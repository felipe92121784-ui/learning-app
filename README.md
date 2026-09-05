# Ideal Learning

This repository contains two independent projects for local development:

- `api/`: AdonisJS API, served locally on `http://localhost:3333`.
- `web/`: Vite React SPA, served locally on `http://localhost:5173`.

Docker Compose starts only the local infrastructure dependencies: PostgreSQL and
MinIO. There is no Redis service and neither application runs in Compose.

## Prerequisites

- Docker with Docker Compose
- Node.js 24 or newer and npm. The API dependencies require Node 24; the Web
  package also declares Vite 8's supported range, `^20.19.0 || >=22.12.0`.

## Local setup

1. Create the local environment files from their examples:

   ```sh
   cp .env.example .env
   cp api/.env.example api/.env
   cp web/.env.example web/.env
   ```

2. Start PostgreSQL and MinIO:

   ```sh
   docker compose --env-file .env up -d --wait
   ```

3. Configure the initial administrator, install API dependencies, apply migrations,
   and create the administrator:

   ```sh
   cd api
   npm ci
   node ace migration:run
   node ace db:seed --files database/seeders/admin_seeder
   npm run dev
   ```

4. In another terminal, install and start the Web app:

   ```sh
   cd web
   npm ci
   npm run dev
   ```

Both projects commit npm lockfiles, so `npm ci` installs the reviewed dependency
graph without rewriting it. Vite is pinned to port 5173 and exits instead of
silently choosing another port when 5173 is occupied; this keeps the dev-server
origin aligned with the API CORS configuration.

## Initial administrator and login

Before running the admin seed command, set the following values in `api/.env`.
They are required only by the seed, must be kept secret, and must never be
committed. Leave the corresponding example values empty.

| Setting | Purpose |
| --- | --- |
| `ADMIN_NAME` | Display name for the initial administrator |
| `ADMIN_EMAIL` | E-mail used to find the administrator and to log in |
| `ADMIN_PASSWORD` | Password for the initial administrator |

`node ace db:seed --files database/seeders/admin_seeder` is idempotent: it creates one active
administrator for `ADMIN_EMAIL` when none exists, and running it again does not
create another account. The configured e-mail and password are the credentials
for the first login at `http://localhost:5173/login`. The root `.env` includes
the same variables for a future containerized API; for the local API process,
`api/.env` is the source of truth.

## User administration and account passwords

After signing in with the initial administrator, open **Administração** and
then **Gerenciar usuários** (or go directly to
`http://localhost:5173/admin/users`). The administrator can:

1. Select **Novo aluno** and provide the student's name, e-mail, and initial
   password. New accounts are always created as active students; the Web UI
   cannot choose another role or initial status.
2. Select a student to edit their name or e-mail. Passwords are not available
   from the administrative edit screen.
3. Block an active student to prevent new logins and invalidate an existing
   authenticated session. Activate the student again to restore login access.

Every active authenticated user, including the administrator, can select
**Conta** in the main navigation (or open
`http://localhost:5173/app/account`) and change only their own password. The
form requires the current password, a new password of 8 to 32 characters, and
matching confirmation. After a successful change, the old password no longer
works for future logins. Invitation e-mails and password recovery are not part
of this workflow.

After the API is running, this cookie-session smoke test verifies login, profile,
logout, and the expected unauthenticated profile response. Replace the shell
variables with the same secret values configured in `api/.env`; do not paste
credentials into shell history or commit them.

```sh
export LOGIN_EMAIL='your-admin-email'
export LOGIN_PASSWORD='your-admin-password'
export COOKIE_JAR="$(mktemp)"

curl --fail-with-body -sS -c "$COOKIE_JAR" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}" \
  http://localhost:3333/api/v1/auth/login
curl --fail-with-body -sS -b "$COOKIE_JAR" \
  http://localhost:3333/api/v1/account/profile
curl --fail-with-body -sS -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X POST \
  http://localhost:3333/api/v1/account/logout
curl -sS -o /dev/null -w '%{http_code}\n' -b "$COOKIE_JAR" \
  http://localhost:3333/api/v1/account/profile # expected: 401
rm -f "$COOKIE_JAR"
```

If the default local service ports are already in use, start only the
infrastructure on the smoke ports and point the API database port at `15432`:

```sh
docker compose --env-file .env -f docker-compose.yml -f docker-compose.smoke.yml up -d --wait
cd api && DB_PORT=15432 node ace migration:run && DB_PORT=15432 node ace db:seed --files database/seeders/admin_seeder
```

## Local services

- API: `http://localhost:3333`
- SPA: `http://localhost:5173`
- MinIO S3 API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`
- PostgreSQL: `localhost:5432`

Compose publishes PostgreSQL and MinIO only on `127.0.0.1`. The root `.env`
configures Compose. The API and Web each keep their own environment file, so
their configuration remains independent. Use `api/.env.docker.example` only for
a future API container, where service names are reachable as `postgres` and
`minio`.

## Infrastructure credentials

Keep values on each row aligned when customizing the local examples:

| Compose (`.env`) | API host process | Purpose |
| --- | --- | --- |
| `POSTGRES_DB` | `DB_DATABASE` in `api/.env` | Development database |
| `POSTGRES_USER` | `DB_USER` in `api/.env` | Development database role |
| `POSTGRES_PASSWORD` | `DB_PASSWORD` in `api/.env` | Development role password |
| `POSTGRES_TEST_DB` | `DB_DATABASE` in `api/.env.test` | Isolated test database |
| `POSTGRES_TEST_USER` | `DB_USER` in `api/.env.test` | Isolated test role |
| `POSTGRES_TEST_PASSWORD` | `DB_PASSWORD` in `api/.env.test` | Isolated test role password |
| `MINIO_ROOT_USER` | `S3_ACCESS_KEY` in `api/.env` and `api/.env.test` | Local MinIO access key |
| `MINIO_ROOT_PASSWORD` | `S3_SECRET_KEY` in `api/.env` and `api/.env.test` | Local MinIO secret key |

On the first start of a new PostgreSQL volume, Compose mounts
`docker/postgres/10-init-test-db.sh`, which creates the role and database from
`POSTGRES_TEST_*`. AdonisJS loads the committed `api/.env.test` under
`NODE_ENV=test`, so API tests remain isolated from the development database.
For a volume created before this initializer existed, provision it once with:

```sh
docker compose --env-file .env exec -T postgres \
  sh /docker-entrypoint-initdb.d/10-init-test-db.sh
```
