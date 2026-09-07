# Zima Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Package Ideal Learning as a production Docker stack for Zima, publishing only one configurable Web/Caddy port.

**Architecture:** Web builds the React SPA and Caddy proxies /api internally to Adonis. API, worker, Postgres and MinIO are private services with persistent volumes. Cloudflare Tunnel is outside the stack.

**Tech Stack:** Docker Compose, Node 24, AdonisJS, Vite, Caddy, PostgreSQL 17, MinIO.

**Spec:** docs/superpowers/specs/2026-09-07-zima-production-deployment-design.md

## Global Constraints

- Only web publishes APP_PORT (default 8080); API, worker, Postgres and MinIO have no ports.
- APP_PUBLIC_URL drives APP_URL, CORS_ORIGIN and VITE_API_URL.
- No Cloudflare service/token/TLS is added.
- API production command is node bin/server.js, never npm run dev.
- Secrets remain only in ignored .env.production; migration and admin seed are explicit commands.

---

## Task 1: Build production images

**Files:**
- Modify: api/Dockerfile
- Create: web/Dockerfile
- Create: web/Caddyfile
- Create: .dockerignore

- [ ] **Step 1: Establish the build baseline**

Run: docker build -t ideal-learning-api-test ./api

Expected: it exposes that the existing Dockerfile starts the development command and there is no Web production image.

- [ ] **Step 2: Implement the multi-stage API image**

Use Node 24 bookworm-slim. Builder runs npm ci and npm run build. Runtime installs poppler-utils, copies the built Adonis output and production node modules, runs non-root, exposes 3333, and uses CMD node bin/server.js. The worker must be able to override its command with node ace process:material-jobs.

- [ ] **Step 3: Implement Web/Caddy image**

Node builder runs npm ci and npm run build using build argument VITE_API_URL. Caddy runtime serves the dist directory, falls back SPA paths to index.html, and reverse proxies /api to api:3333. It must not cache protected API responses.

- [ ] **Step 4: Add Docker ignore rules**

Ignore git data, all .env files, node_modules, dist, coverage, .superpowers and local uploads. Keep source and lockfiles.

- [ ] **Step 5: Verify image builds**

Run: docker build -t ideal-learning-api-prod ./api

Run: docker build --build-arg VITE_API_URL=https://example.test/api/v1 -t ideal-learning-web-prod ./web

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

Run: git add api/Dockerfile web/Dockerfile web/Caddyfile .dockerignore

Run: git commit -m "feat: add production application images"

## Task 2: Define private Compose production stack

**Files:**
- Create: docker-compose.production.yml
- Create: .env.production.example
- Modify: .gitignore

- [ ] **Step 1: Write environment example**

Include APP_PORT=8080, an empty APP_PUBLIC_URL marker, empty secret markers for APP_KEY/database/MinIO/admin, production NODE_ENV, internal DB_HOST=postgres, S3 endpoint http://minio:9000, cookie sessions and tile defaults 4096/256. No real domain or secret.

- [ ] **Step 2: Ignore the real environment**

Add .env.production to .gitignore.

Run: git check-ignore -q .env.production

Expected: PASS.

- [ ] **Step 3: Define five Compose services**

Create web, api, worker, postgres and minio. Use restart unless-stopped on all services, named volumes for Postgres/MinIO, and healthchecks for Postgres/MinIO/API. API and worker wait for the two stores; Web waits for API. Web is the only service with an APP_PORT-to-80 mapping.

- [ ] **Step 4: Bind build configuration safely**

Pass VITE_API_URL derived from APP_PUBLIC_URL plus /api/v1 only as the Web build argument. API gets APP_URL and CORS_ORIGIN from the same public URL. The worker reads the same private env settings as API.

- [ ] **Step 5: Validate Compose**

Create a temporary env with syntactically valid temporary values.

Run: docker compose --env-file temporary-production-env -f docker-compose.production.yml config

Expected: PASS, only web has ports, and no cloudflared service exists.

- [ ] **Step 6: Commit Task 2**

Run: git add docker-compose.production.yml .env.production.example .gitignore

Run: git commit -m "feat: add Zima production stack"

## Task 3: Document operation and smoke test

**Files:**
- Modify: README.md

- [ ] **Step 1: Add first-start guide**

Document copying .env.production.example to .env.production, setting APP_PORT/APP_PUBLIC_URL/secrets, and starting with docker compose using the production file and env file.

- [ ] **Step 2: Document explicit database setup**

Document the exact compose exec commands for node ace migration:run and node ace db:seed with the admin seeder. Explain the seed is idempotent and tunnel configuration remains outside the project.

- [ ] **Step 3: Document maintenance**

Include update, logs, stop, Postgres/MinIO volume backup, and worker reprocessing commands. State the existing tunnel targets the Zima host and APP_PORT.

- [ ] **Step 4: Document smoke test**

Cover Web response, login/profile, upload, worker READY status, protected viewer, denied access, authorized original download, and browser Network check for no-store/no MinIO exposure.

- [ ] **Step 5: Validate documented service names**

Run docker compose config using the temporary env and confirm every documented service/command exists.

- [ ] **Step 6: Commit Task 3**

Run: git add README.md

Run: git commit -m "docs: add Zima production deployment guide"

## Final Verification

- [ ] API and Web production images build.
- [ ] Compose validates with a non-secret temporary env.
- [ ] Only Web publishes APP_PORT and data services remain private.
- [ ] README has first start, migration, seed, update, backup, tunnel target and protected-content smoke test.
- [ ] Real .env.production is ignored.

