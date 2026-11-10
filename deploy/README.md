# Deploying to davhi.se.rit.edu

Production redeploys from `main` every night at midnight Eastern, and whenever someone runs `audiaptic-redeploy` on davhi. Each deploy does the following, even when there are no new commits:

- **Builds:** checks out the latest commit on `main` and rebuilds both images. The rebuild pulls fresh Node and Caddy base images, so security patches get in.
- **Restarts:** recreates the containers and waits for their health checks.

If something goes wrong:

- **Build fails:** this includes type errors and failing API tests. The running version stays up.
- **Health checks fail:** the deploy rolls back to the last commit that deployed successfully.

Each deploy posts one message to Discord and edits it as the deploy moves along: building, starting, then the result. The message shows the commit that was deployed and the commits it added since the last deploy. If the build fails or a rollback happens, it also shows the end of the build log.

The stack is two containers, defined in [docker-compose.yml](../docker-compose.yml):

| Container | What it does |
| --- | --- |
| `caddy` | Serves the built portal, proxies `/api/*` (including websockets) to the API, and gets the TLS certificate from [RIT's ACME server](https://acme.rit.edu). Asks for the portal password, except on the audience and performer websockets. Runs as the unprivileged `caddy` user. |
| `davhi-api` | The Fastify API. It isn't published on any port, so only Caddy can reach it. Runs as the unprivileged `node` user. |

## One-time setup

### 1. Get EAB credentials from CertifiCat

Sign in to [acme.rit.edu](https://acme.rit.edu) with RIT SSO and create EAB (External Account Binding) credentials for `davhi.se.rit.edu`. You get a **Key ID** and an **HMAC key**; step 4 puts them in `.env`.

Don't generate a certificate there. Caddy uses the EAB credentials to register with CertifiCat, then requests and renews the certificate itself.

### 2. Install Docker

Run the rest of these steps on davhi as an account with sudo. Skip this step if `docker compose version` already prints a version.

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo systemctl enable --now docker
```

If `sudo docker ps` lists containers from an earlier attempt, such as `caddy-proxy` or `davhi-api`, stop them with `sudo docker compose down` in their old checkout. They hold ports 80 and 443.

### 3. Clone and install

```bash
sudo git clone https://github.com/TeamAudiaptic/audiaptic-server.git /opt/audiaptic-server
sudo bash /opt/audiaptic-server/deploy/install.sh
```

[install.sh](install.sh) does the following:

- **Deploy account:** creates the `audiaptic` account, which owns the checkout and runs every deploy. It has no password and can't log in.
- **jq:** installs it, for the Discord messages.
- **Nightly deploy:** installs the timer.
- **Redeploy command:** installs `audiaptic-redeploy`.
- **Settings file:** creates `/opt/audiaptic-server/.env` from [.env.example](../.env.example).

### 4. Fill in `.env`

First make the portal password's hash and the performer token:

```bash
sudo docker run --rm -it caddy:2-alpine caddy hash-password   # type the portal password twice
openssl rand -hex 32                                           # the performer token
```

Then fill in `.env`:

```bash
sudo nano /opt/audiaptic-server/.env
```

| Setting | Value |
| --- | --- |
| `ACME_EMAIL` | Your RIT email |
| `ACME_EAB_KEY_ID` | The Key ID from CertifiCat |
| `ACME_EAB_MAC_KEY` | The HMAC key from CertifiCat |
| `PORTAL_USER` | The username for the portal login |
| `PORTAL_PASSWORD_HASH` | The `hash-password` output, in single quotes: `'$2a$14$...'` |
| `PERFORMER_TOKEN` | The `openssl` output |
| `DISCORD_WEBHOOK_URL` | The channel's webhook URL |
| `CLOUDFLARE_*`, `R2_BUCKET_NAME`, `VITE_R2_BUCKET_URL` | The R2 settings |

Write values as plain text, without quotes, except `PORTAL_PASSWORD_HASH`. Its `$` signs need the single quotes, or Compose reads them as variables. Only `.env` ever holds these values. Don't put them in the Caddyfile, `docker-compose.yml`, or GitHub. Docker Compose reads `.env` and passes each value to the container that needs it.

To change the password or token later, edit `.env` and run `audiaptic-redeploy`.

### 5. Deploy for the first time

```bash
audiaptic-redeploy
curl -u <PORTAL_USER> https://davhi.se.rit.edu/api/
```

The `curl` asks for the portal password, then should print `{"message":"Hello, world!"}`. Discord should show a **✅ Deployed** message.

## Day to day

| To | Run |
| --- | --- |
| Deploy now | `audiaptic-redeploy` |
| See when the next nightly deploy runs | `systemctl list-timers audiaptic-deploy.timer` |
| Read past deploy logs | `journalctl -u 'audiaptic-deploy@*'` |
| See the deployed commit | `cat /opt/audiaptic-server/.deploy/deployed` |
| See the containers | `cd /opt/audiaptic-server && sudo docker compose ps` |
| Read the API's logs | `cd /opt/audiaptic-server && sudo docker compose logs -f davhi-api` |
| Undo a bad deploy | `git revert` the commit on `main`, then run `audiaptic-redeploy`. |
| Skip tonight's deploy | `sudo systemctl stop audiaptic-deploy.timer`, then `start` to resume |
| Pick up changes to `deploy/systemd/` or `deploy/audiaptic-redeploy` | `sudo bash /opt/audiaptic-server/deploy/install.sh` |

**A deploy drops every connected websocket**, because it restarts the containers. If a performance will run past midnight, stop the timer first.

`audiaptic-redeploy` runs the deploy as a systemd service. Pressing Ctrl+C or losing your SSH connection only stops the output, and the deploy itself keeps going.

Don't edit files in `/opt/audiaptic-server` by hand. Each deploy force-checks-out `main` and overwrites tracked files. `.env` and `.deploy/` are untracked, so deploys leave them alone.

## Connecting clients

- **Portal:** `https://davhi.se.rit.edu`. The browser asks for `PORTAL_USER` and the portal password, then the portal shows its own login page.
- **Performer websocket (Max):** `wss://davhi.se.rit.edu/api/performer?token=<PERFORMER_TOKEN>`. Without the right token, the connection is refused with a 401.
- **Audience websocket:** `wss://davhi.se.rit.edu/api/audience/{code}`. No password needed.
- **Anything else under `/api`**, such as `curl` or `/api/docs`, needs the portal login: `curl -u <PORTAL_USER> https://davhi.se.rit.edu/api/...`

The password is a stopgap. The portal's own login page only checks in the browser, and the API doesn't check logins yet.
