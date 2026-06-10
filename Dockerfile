# syntax=docker/dockerfile:1

# ---- Stage 1: build the React frontend ----
FROM node:20-bookworm-slim AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- Stage 2: install deps (native build) + bundle the server ----
FROM node:20-bookworm AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- Stage 3: slim runtime ----
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=web /web/dist ./web/dist
# Writable data dir for SQLite (also mounted as a volume in compose).
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
