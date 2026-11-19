/**
 * Fastify's `trustProxy` setting for this app.
 *
 * Every request arrives through Caddy, the only thing that can reach this app
 * (docker-compose.yml doesn't publish its port). Trust the connection from
 * Caddy and nothing before it, so request.ip is the client address Caddy put
 * last in X-Forwarded-For, and a client can't fake it with its own header.
 * The time route's rate limit relies on this.
 *
 * Fastify's numeric `trustProxy: 1` reads the same, but Fastify 5 treats a
 * number as "trust nothing", which would put every client in one bucket.
 */
export function trustCaddyOnly(_address: string, hop: number) {
    return hop === 0;
}
