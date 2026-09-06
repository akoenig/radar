# syntax=docker/dockerfile:1

# Debian-based (glibc), not Alpine: effect depends on msgpackr, whose optional
# native accelerator msgpackr-extract only publishes glibc prebuilds. On musl it
# falls back to compiling from source, which needs a toolchain the slim images
# deliberately omit.
ARG NODE_VERSION=24
ARG PNPM_VERSION=11.24.0

# ---- build ---------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS build
ARG PNPM_VERSION
WORKDIR /app
ENV CI=true
RUN npm install --global pnpm@${PNPM_VERSION}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY server/package.json server/
COPY web/package.json web/
RUN --mount=type=cache,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store --global && pnpm install --frozen-lockfile

COPY server server
COPY web web
RUN pnpm --filter @reader/web build && pnpm --filter @reader/server build

# ---- runtime -------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
ARG PNPM_VERSION
WORKDIR /app
ENV NODE_ENV=production CI=true
RUN npm install --global pnpm@${PNPM_VERSION}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY server/package.json server/
COPY web/package.json web/
RUN --mount=type=cache,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store --global \
    && pnpm install --frozen-lockfile --prod --filter @reader/server \
    && pnpm store prune || true

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist

ENV PORT=8080 HOST=0.0.0.0
EXPOSE 8080
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server/dist/infrastructure/main.js"]
