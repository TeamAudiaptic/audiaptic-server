# Production web image: builds the portal, then serves it with Caddy, which also
# proxies /api/* to davhi-api and gets the TLS certificate (see ../Caddyfile).
# The build context is the repo root, set in docker-compose.yml, so this can
# reach both portal/ and the Caddyfile.

FROM node:24-alpine AS build
WORKDIR /portal
COPY portal/package*.json ./
RUN npm ci
COPY portal/ ./
# Vite bakes VITE_* variables into the bundle at build time
ARG VITE_API_URL
ARG VITE_R2_BUCKET_URL
RUN npm run build

FROM caddy:2-alpine
# Run Caddy as an unprivileged user instead of root. It can still listen on
# 80 and 443 because Docker lets any user bind low ports inside a container.
# /data and /config are chowned here so that new named volumes start out
# owned by caddy.
RUN addgroup -S caddy && adduser -S -D -H -G caddy caddy \
    && chown -R caddy:caddy /data /config
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /portal/dist /srv
USER caddy

# Caddy's admin API only answers once the Caddyfile has loaded. It listens on
# 127.0.0.1 only; "localhost" would resolve to ::1 here and be refused.
HEALTHCHECK --interval=30s --start-interval=2s --start-period=30s --timeout=3s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:2019/config/ || exit 1
