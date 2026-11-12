# Build stage: compile the API and run its tests, so a commit with type errors
# or failing tests never gets an image, and never deploys
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
COPY test ./test
RUN npm run build && npm test

# Production stage
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Run as the image's built-in unprivileged "node" user instead of root.
# It owns /app itself, but not the code in it, only because the API writes
# openapi.json and asyncapi.json there when it starts.
RUN chown node:node /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --start-interval=2s --start-period=30s --timeout=3s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:3000/api/ || exit 1
CMD ["node", "dist/index.js"]
