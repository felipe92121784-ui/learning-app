FROM node:24-bookworm-slim AS dependencies

WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM dependencies AS build

COPY . .
# .adonisjs/ is gitignored, so regenerate the server indexes and the Tuyau
# client registry before tsc runs (node ace build alone skips the registry).
# codegen boots the app, which validates start/env.ts, so feed placeholder
# values; this stage is discarded and never reaches the runtime image.
RUN NODE_ENV=production PORT=3333 HOST=0.0.0.0 LOG_LEVEL=info \
  APP_KEY=codegen_placeholder_key_0000000000 APP_URL=http://localhost \
  DB_HOST=localhost DB_PORT=5432 DB_USER=x DB_PASSWORD=x DB_DATABASE=x \
  CORS_ORIGIN=http://localhost \
  S3_ENDPOINT=http://localhost:9000 S3_ACCESS_KEY=x S3_SECRET_KEY=x \
  S3_BUCKET=x S3_REGION=us-east-1 SESSION_DRIVER=cookie \
  node ace codegen
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
