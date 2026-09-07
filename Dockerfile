# syntax=docker/dockerfile:1

# Debian-based (glibc), not Alpine: effect depends on msgpackr, whose optional
# native accelerator msgpackr-extract only publishes glibc prebuilds. On musl it
# falls back to compiling from source, which needs a toolchain the slim images
# deliberately omit.
ARG NODE_VERSION=24
ARG PNPM_VERSION=11.24.0

# The store location is passed per command. Writing it to pnpm's global config
# instead would require pnpm's global bin directory to be on PATH.
ARG PNPM_STORE=/pnpm-store

# ---- build ---------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS build
ARG PNPM_VERSION
ARG PNPM_STORE
WORKDIR /app
ENV CI=true
RUN npm install --global pnpm@${PNPM_VERSION}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY server/package.json server/
COPY web/package.json web/
RUN --mount=type=cache,target=${PNPM_STORE} \
    pnpm install --frozen-lockfile --store-dir ${PNPM_STORE}

COPY server server
COPY web web
RUN pnpm --filter @reader/web build && pnpm --filter @reader/server build

# ---- runtime -------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
ARG PNPM_VERSION
ARG PNPM_STORE
WORKDIR /app
ENV NODE_ENV=production CI=true
RUN npm install --global pnpm@${PNPM_VERSION}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY server/package.json server/
COPY web/package.json web/
RUN --mount=type=cache,target=${PNPM_STORE} \
    pnpm install --frozen-lockfile --prod --filter @reader/server --store-dir ${PNPM_STORE}

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist

# Cloud in a Bottle mounts BOTTLE_APP_DATA_DIR and the server prefers it. This
# is the fallback for a plain `docker run`, and it must be writable by the
# unprivileged user: SQLite needs to create -wal and -shm beside the database.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]

ENV PORT=8080 HOST=0.0.0.0
EXPOSE 8080
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server/dist/infrastructure/main.js"]
