# syntax=docker/dockerfile:1

# ---- build ---------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY server/package.json server/
COPY web/package.json web/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

COPY server server
COPY web web
RUN pnpm --filter @reader/web build && pnpm --filter @reader/server build

# ---- runtime -------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY server/package.json server/
COPY web/package.json web/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --prod --frozen-lockfile --filter @reader/server

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist

ENV PORT=8080 HOST=0.0.0.0
EXPOSE 8080
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server/dist/infrastructure/main.js"]
