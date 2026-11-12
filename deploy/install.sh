#!/usr/bin/env bash
# Sets up davhi to run audiaptic-server:
#   sudo bash /opt/audiaptic-server/deploy/install.sh
#
# It creates the audiaptic deploy account and installs jq (for the Discord
# messages), the nightly deploy timer, and the audiaptic-redeploy command. It
# also creates .env from .env.example if there isn't one yet.
#
# It's safe to run again. Do that whenever something in deploy/systemd/ or
# deploy/audiaptic-redeploy changes.
set -euo pipefail

APP=/opt/audiaptic-server
ACCOUNT=audiaptic

if [[ $EUID -ne 0 ]]; then
    echo "Run this with sudo." >&2
    exit 1
fi
if [[ ! -f $APP/docker-compose.yml ]]; then
    echo "Clone the repo to $APP first." >&2
    exit 1
fi
if ! docker compose version > /dev/null 2>&1; then
    echo "Install Docker and its Compose plugin first. See deploy/README.md." >&2
    exit 1
fi

if ! command -v jq > /dev/null; then
    if command -v apt-get > /dev/null; then
        apt-get update -q && apt-get install -y -q jq
    elif command -v dnf > /dev/null; then
        dnf install -y -q jq
    else
        echo "Install jq, then run this again." >&2
        exit 1
    fi
fi

# The deploy account has no password and no login shell. Being in the docker
# group lets it run Docker without sudo.
if ! id "$ACCOUNT" > /dev/null 2>&1; then
    useradd --system --create-home --home-dir "/var/lib/$ACCOUNT" --shell /usr/sbin/nologin "$ACCOUNT"
fi
usermod -aG docker "$ACCOUNT"

if [[ ! -f $APP/.env ]]; then
    cp "$APP/.env.example" "$APP/.env"
    echo "Created $APP/.env from .env.example. Fill it in before the first deploy."
fi
chown -R "$ACCOUNT:$ACCOUNT" "$APP"
chmod 600 "$APP/.env"

# An earlier version of this setup used a non-template unit
rm -f /etc/systemd/system/audiaptic-deploy.service

install -m 644 "$APP/deploy/systemd/audiaptic-deploy@.service" "$APP/deploy/systemd/audiaptic-deploy.timer" /etc/systemd/system/
install -m 755 "$APP/deploy/audiaptic-redeploy" /usr/local/bin/audiaptic-redeploy
systemctl daemon-reload
systemctl enable audiaptic-deploy.timer
systemctl restart audiaptic-deploy.timer

echo
echo "Installed. Next nightly deploy:"
systemctl list-timers audiaptic-deploy.timer --no-pager
