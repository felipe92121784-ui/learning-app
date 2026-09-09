FROM node:24-bookworm-slim AS dependencies

WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM dependencies AS build

COPY . .
# .adonisjs/ is gitignored, so regenerate the server indexes and the Tuyau
# client registry before tsc runs (node ace build alone skips the registry).
RUN node ace codegen
RUN npm run build

FROM node:24-bookworm-slim AS production-dependencies

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/build ./
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules

USER node
EXPOSE 3333

CMD ["node", "bin/server.js"]
