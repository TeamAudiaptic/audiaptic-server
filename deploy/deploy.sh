#!/usr/bin/env bash
# Deploys the latest commit on main to davhi.se.rit.edu. See deploy/README.md.
#
# audiaptic-deploy.timer runs this every night at midnight Eastern, and the
# audiaptic-redeploy command runs it on demand. Every run, even one with no new
# commits:
#   1. checks out the latest commit on origin/main
#   2. rebuilds both images, pulling fresh Node and Caddy base images so
#      security patches get in
#   3. recreates the containers and waits for their health checks
# If the build fails, including on type errors or failing API tests, the
# running containers are left alone. If the new containers fail their health
# checks, it rolls back to the last commit that deployed successfully.
#
# If DISCORD_WEBHOOK_URL is set in .env, each deploy posts one Discord message
# and edits it as the deploy moves along. That needs curl and jq.
set -euo pipefail

BRANCH=main
STATE=.deploy      # gitignored: lock file, last deployed commit, last deploy's log
WAIT_SECONDS=180   # how long new containers get to become healthy

# Discord embed colors
BLUE=5793266
GREEN=5763719
ORANGE=15105570
RED=15548997

# Everything runs inside main, which bash reads in full before running any of
# it, because the git checkout below can replace this file mid-run.
main() {
    cd "$(dirname "$0")/.."
    mkdir -p "$STATE"

    exec 9>"$STATE/lock"
    if ! flock -n 9; then
        echo "Another deploy is already running." >&2
        return 1
    fi

    LOG="$STATE/last-deploy.log"
    : > "$LOG"
    WEBHOOK=$(env_value DISCORD_WEBHOOK_URL)
    SITE=$(env_value SITE_DOMAIN)
    REPO_URL=$(git remote get-url origin | sed -E 's#^git@github\.com:#https://github.com/#; s#\.git$##')
    MESSAGE_ID=""
    COMMIT_URL=""
    COMMIT_TEXT=""
    CHANGES_TEXT=""
    # Set by the systemd unit: "nightly" from the timer, otherwise the username
    # of whoever ran audiaptic-redeploy
    if [[ "${DEPLOY_TRIGGER:-}" == nightly ]]; then
        TRIGGER="Nightly redeploy"
    else
        TRIGGER="Manual redeploy by ${DEPLOY_TRIGGER:-$(id -un)}"
    fi

    local var
    for var in SITE_DOMAIN ACME_EMAIL ACME_EAB_KEY_ID ACME_EAB_MAC_KEY PORTAL_USER PORTAL_PASSWORD_HASH PERFORMER_TOKEN; do
        if [[ -z "$(env_value "$var")" ]]; then
            echo "$var is missing from .env. Copy .env.example to .env and fill it in." >&2
            notify "❌ Deploy didn't start" "$RED" "\`$var\` is missing from \`.env\` on the server."
            return 1
        fi
    done
    # Without single quotes, Compose reads the hash's $ signs as variables and
    # mangles it, and then nobody can log in
    if ! grep -qE "^PORTAL_PASSWORD_HASH='[\$]2[aby]?[\$]" .env; then
        echo "PORTAL_PASSWORD_HASH in .env must be the output of caddy hash-password, in single quotes." >&2
        notify "❌ Deploy didn't start" "$RED" "\`PORTAL_PASSWORD_HASH\` in \`.env\` must be the output of \`caddy hash-password\`, in single quotes."
        return 1
    fi

    local deployed target
    deployed=$(cat "$STATE/deployed" 2>/dev/null || true)
    if ! git fetch --quiet origin "$BRANCH" 2>> "$LOG"; then
        echo "Couldn't fetch $BRANCH from GitHub. Nothing changed." >&2
        notify "❌ Deploy didn't start" "$RED" "Couldn't fetch \`$BRANCH\` from GitHub. Nothing changed.$(log_tail)"
        return 1
    fi
    target=$(git rev-parse "origin/$BRANCH")
    describe "$target" "$deployed"

    echo "$TRIGGER: deploying ${target:0:7}."
    notify "🔨 Building" "$BLUE" "Pulling base images and building \`${target:0:7}\`."
    git checkout --quiet --force "$target"

    if ! run docker compose build --pull; then
        echo "The build failed. The previous version is still running." >&2
        if [[ -n "$deployed" ]]; then
            git checkout --quiet --force "$deployed"
            notify "❌ Build failed" "$RED" "Nothing was restarted, so \`${deployed:0:7}\` is still live.$(log_tail)"
        else
            notify "❌ Build failed" "$RED" "Nothing is deployed yet.$(log_tail)"
        fi
        return 1
    fi

    notify "🚀 Starting" "$BLUE" "Built. Recreating the containers and waiting for their health checks."
    if ! up; then
        local failure
        failure=$(log_tail)
        echo "${target:0:7} failed its health checks." >&2
        if [[ -z "$deployed" ]]; then
            notify "❌ Deploy failed" "$RED" "The new containers failed their health checks, and there's no earlier deploy to roll back to.$failure"
            return 1
        fi

        echo "Rolling back to ${deployed:0:7}." >&2
        notify "↩️ Rolling back" "$ORANGE" "\`${target:0:7}\` failed its health checks. Rolling back to \`${deployed:0:7}\`.$failure"
        git checkout --quiet --force "$deployed"
        if run docker compose build && up; then
            notify "↩️ Rolled back" "$ORANGE" "\`${target:0:7}\` failed its health checks, so \`${deployed:0:7}\` is live again.$failure"
        else
            echo "The rollback failed too." >&2
            notify "🔥 Rollback failed" "$RED" "The site is probably down. On davhi: \`cd /opt/audiaptic-server && sudo docker compose ps\`$(log_tail)"
        fi
        return 1
    fi

    echo "$target" > "$STATE/deployed"
    # Remove the images this deploy replaced, and build cache older than two weeks
    docker image prune --force > /dev/null
    docker builder prune --force --filter until=336h > /dev/null
    echo "Deployed ${target:0:7}."
    notify "✅ Deployed" "$GREEN" "Live at https://$SITE"
}

# Runs a command, sending its output both to the terminal or journal and to the deploy log
run() {
    "$@" 2>&1 | tee -a "$LOG"
}

# Recreates the containers even if their images didn't change, so every deploy restarts them
up() {
    run docker compose up --detach --force-recreate --remove-orphans --wait --wait-timeout "$WAIT_SECONDS"
}

# Reads one value from .env, without running it the way `source` would
env_value() {
    local value
    value=$(grep -E "^$1=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\r') || true
    value=${value#\"}
    value=${value%\"}
    value=${value#\'}
    value=${value%\'}
    printf '%s' "$value"
}

# Fills in the Commit and Changes fields of the Discord message
describe() {
    local target=$1 deployed=$2 count
    COMMIT_URL="$REPO_URL/commit/$target"
    COMMIT_TEXT="[\`${target:0:7}\`]($COMMIT_URL) $(git log -1 --format=%s "$target" | cut -c1-150)"
    COMMIT_TEXT+=$'\n'$(git log -1 --format='by %an, <t:%ct:R>' "$target")

    if [[ -z "$deployed" ]]; then
        CHANGES_TEXT="First deploy"
    elif [[ "$deployed" == "$target" ]]; then
        CHANGES_TEXT="No new commits since the last deploy. Rebuilding with the latest base images and restarting."
    elif count=$(git rev-list --count --first-parent "$deployed..$target" 2>/dev/null); then
        local noun=commits
        if (( count == 1 )); then noun=commit; fi
        CHANGES_TEXT="[$count new $noun]($REPO_URL/compare/$deployed...$target) since \`${deployed:0:7}\`:"$'\n'
        CHANGES_TEXT+=$(git log --first-parent -n 5 --format="• [\`%h\`]($REPO_URL/commit/%H) %s" "$deployed..$target" | cut -c1-220)
        if (( count > 5 )); then
            CHANGES_TEXT+=$'\n'"…and $((count - 5)) more"
        fi
    else
        CHANGES_TEXT="The last deploy, \`${deployed:0:7}\`, is no longer in main's history."
    fi
}

# The end of the deploy log as a code block, to show in Discord what went wrong
log_tail() {
    local lines
    lines=$(sed -e 's/\x1b\[[0-9;]*m//g' -e 's/\r$//' -e '/^[[:space:]]*$/d' -e "s/\`\`\`/'''/g" "$LOG" | tail -n 20 | tail -c 1500)
    if [[ -n "$lines" ]]; then
        printf '\n```\n%s\n```' "$lines"
    fi
}

elapsed() {
    if (( SECONDS >= 60 )); then
        printf '%dm %ds' $((SECONDS / 60)) $((SECONDS % 60))
    else
        printf '%ds' "$SECONDS"
    fi
}

# Posts this deploy's Discord message the first time, then edits it in place.
# A Discord problem never fails the deploy.
notify() {
    if [[ -z "$WEBHOOK" ]]; then
        return 0
    fi
    local title=$1 color=$2 details=$3 payload
    payload=$(jq -n \
        --arg title "$title" \
        --argjson color "$color" \
        --arg description "$TRIGGER"$'\n\n'"$details" \
        --arg url "$COMMIT_URL" \
        --arg commit "$COMMIT_TEXT" \
        --arg changes "$CHANGES_TEXT" \
        --arg footer "${SITE:-davhi} · $BRANCH · $(elapsed)" \
        '{
            allowed_mentions: {parse: []},
            embeds: [{
                title: $title,
                color: $color,
                description: $description[0:4000],
                fields: [
                    {name: "Commit", value: $commit[0:1024]},
                    {name: "Changes", value: $changes[0:1024]}
                ] | map(select(.value != "")),
                footer: {text: $footer},
                timestamp: (now | todate)
            } + (if $url == "" then {} else {url: $url} end)]
        }') || return 0

    if [[ -z "$MESSAGE_ID" ]]; then
        MESSAGE_ID=$(curl -fsS -m 10 -H 'Content-Type: application/json' -d "$payload" "$WEBHOOK?wait=true" | jq -r '.id // empty') || MESSAGE_ID=""
    else
        curl -fsS -m 10 -o /dev/null -X PATCH -H 'Content-Type: application/json' -d "$payload" "$WEBHOOK/messages/$MESSAGE_ID" || true
    fi
}

main "$@"; exit
