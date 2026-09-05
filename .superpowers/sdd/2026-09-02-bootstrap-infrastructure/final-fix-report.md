# Final Fix Report

## Status

COMPLETE. All eight final-review findings were addressed within the allowed
infrastructure, API, Web, root-documentation, and test-client scope. No Git
commands or commits were used. No Redis, application containers, domain
functionality, or auth persistence were added.

## Finding-by-finding result

1. **Loopback-only Compose ports:** the default Compose file now publishes
   exactly `127.0.0.1:5432:5432`, `127.0.0.1:9000:9000`, and
   `127.0.0.1:9001:9001`. The expanded default config reports `host_ip:
   127.0.0.1` for every published port.
2. **API lint:** `npm run lint` is clean. `database/schema.ts` is regenerated
   by every Lucid migration and the generator emits a line that conflicts with
   Prettier. The smallest durable fix is the single-file
   `database/schema.ts` entry in `api/.prettierignore`; the rest of the tree is
   still covered by `eslint .`. This was verified again after two migrations
   regenerated the schema.
3. **Separate test PostgreSQL:** Compose passes `POSTGRES_TEST_*` into
   PostgreSQL and mounts `docker/postgres/10-init-test-db.sh` into
   `docker-entrypoint-initdb.d`. A fresh isolated volume created both
   `ideal_learning_test` role and database. A direct connection returned
   `current_user=ideal_learning_test` and
   `current_database=ideal_learning_test`; migrations also ran independently
   against that database. README documents first-start and existing-volume
   provisioning. `api/.env.test` remains separate from development and its
   too-short test `APP_KEY` was corrected so the test environment can boot.
4. **Vite port contract:** `web/vite.config.ts` sets `server.port: 5173` and
   `server.strictPort: true`, matching `CORS_ORIGIN=http://localhost:5173`.
5. **Node and reproducible installs:** `web/package.json` and its lockfile
   declare Vite 8.2.2's exact Node engine range
   `^20.19.0 || >=22.12.0`. The API package and lockfile declare its stricter
   AdonisJS floor, `>=24.0.0`; README therefore requires Node 24+ for the full
   repository and explicitly records the Vite range. README uses `npm ci` for
   both committed lockfiles.
6. **Compose and migrations smoke:** the default startup encountered a genuine
   external conflict on host port 9000; no external process was killed. The
   checked-in project-local `docker-compose.smoke.yml` overrides only host
   ports to `15432`, `19000`, and `19001`, leaving default production Compose
   definitions intact. With that override, PostgreSQL and MinIO both became
   healthy and development/test migrations completed. The isolated smoke
   containers, network, and volumes were removed after verification.
7. **`apiClient` 204 behavior:** a regression test was written and observed
   failing before implementation. The minimal implementation returns
   `undefined` for successful HTTP 204 responses without trying to parse JSON.
8. **Credential mapping and env ignores:** README maps development/test
   `POSTGRES_*` values to API `DB_*`, and `MINIO_ROOT_*` to API `S3_*`.
   `api/.env.test` now uses the same MinIO credentials as Compose while keeping
   a test-only bucket. Root, API, and existing Web ignore rules cover `.env`
   plus `.env.*`; only `/.env.example`, `api/.env.example`,
   `api/.env.docker.example`, `api/.env.test`, and `web/.env.example` are
   explicitly preserved.

## TDD evidence for `apiClient`

Test break named before implementation: removing/omitting the 204 branch must
make a no-content DELETE reject during JSON parsing instead of resolving with
`undefined`.

### RED

Command:

```sh
cd web
npm run test -- src/lib/api-client.test.ts
```

Observed before production-code change:

```text
Test Files  1 failed (1)
Tests       1 failed | 2 passed (3)
apiClient > returns undefined for a successful response with no content
AssertionError: promise rejected "SyntaxError: Unexpected end of JSON input"
instead of resolving
exit 1
```

### GREEN

Same command after adding only the `response.status === 204` branch:

```text
Test Files  1 passed (1)
Tests       3 passed (3)
exit 0
```

The final full Web test run repeated the 3/3 passing result.

## Final verification commands

All commands below were run from the repository root unless a `cd` is shown.

### Static config and runtime contracts

```sh
docker compose --env-file .env.example config
```

- Exit 0.
- Expanded default ports: `127.0.0.1:5432`, `127.0.0.1:9000`, and
  `127.0.0.1:9001`.
- Expanded PostgreSQL environment includes all three `POSTGRES_TEST_*`
  variables and the init-script bind mount.

```sh
sh -n docker/postgres/10-init-test-db.sh
node -e "const api=require('./api/package.json'); const web=require('./web/package.json'); const vite=require('./web/node_modules/vite/package.json'); if(api.engines.node !== '>=24.0.0') process.exit(1); if(web.engines.node !== vite.engines.node) process.exit(1); console.log('api=' + api.engines.node); console.log('web=' + web.engines.node); console.log('vite=' + vite.version + ' ' + vite.engines.node)"
```

- Exit 0.
- Script syntax valid.
- Output: API `>=24.0.0`; Web and Vite 8.2.2 both
  `^20.19.0 || >=22.12.0`.

### API

```sh
cd api
npm run typecheck && npm run lint
```

- Exit 0.
- TypeScript emitted no diagnostics.
- ESLint emitted 0 errors and 0 warnings, after the final schema regeneration.

```sh
cd api
DB_PORT=15432 npm test
```

- Outside the restricted network sandbox: exit 0; the application and
  `.env.test` booted successfully.
- Runner result: `NO TESTS EXECUTED` because the API currently contains no
  unit or functional spec files. The required API checks are typecheck and
  lint, both covered above.

### Web

```sh
cd web
npm run lint && npm run test && npm run typecheck && npm run build
```

- Exit 0.
- Oxlint clean.
- Vitest: 1 file passed, 3 tests passed.
- TypeScript build mode clean.
- Vite 8.2.2 build: 150 modules transformed; production assets emitted.

Final contract scans also exited 0:

```sh
rg -n "server:|port: 5173|strictPort: true" web/vite.config.ts
rg -n "npm ci|Node.js 24|\^20\.19\.0|POSTGRES_TEST_|MINIO_ROOT_|api/\.env\.test" README.md
rg -n "\*\*/\.env|api/\.env\.test|api/\.env\.docker\.example|web/\.env\.example" .gitignore
rg -n "\.env\.\*|!\.env\.test|!\.env\.docker\.example|!\.env\.example" api/.gitignore
```

### Docker health, test database, and migrations

Default startup attempt (outside the restricted Docker sandbox):

```sh
docker compose --env-file .env.example -p ideal-learning-final-fix up -d --wait
```

- PostgreSQL started, but MinIO could not bind host port 9000:
  `Bind for 0.0.0.0:9000 failed: port is already allocated`.
- This is the genuine external port conflict allowed by the review brief. No
  external process/container was stopped.

Exact successful override startup:

```sh
docker compose --env-file .env.example \
  -p ideal-learning-final-fix \
  -f docker-compose.yml \
  -f docker-compose.smoke.yml \
  up -d --wait
```

- Exit 0.
- `ideal-learning-final-fix-postgres-1`: healthy on
  `127.0.0.1:15432->5432`.
- `ideal-learning-final-fix-minio-1`: healthy on
  `127.0.0.1:19000->9000` and `127.0.0.1:19001->9001`.

Connection check:

```sh
docker compose --env-file .env.example \
  -p ideal-learning-final-fix \
  -f docker-compose.yml \
  -f docker-compose.smoke.yml \
  exec -T postgres psql -U ideal_learning_test -d ideal_learning_test \
  -v ON_ERROR_STOP=1 -c 'SELECT current_user, current_database();'
```

- Exit 0.
- Returned `ideal_learning_test | ideal_learning_test`.

Development migration smoke, using the versioned API example because the
preexisting untracked `api/.env` lacks required infrastructure keys:

```sh
cd api
set -a; . ./.env.example; set +a
DB_PORT=15432 node ace migration:run
```

- Initial successful run migrated both migration files and generated schema
  classes.
- Final idempotence run: `Already up to date`, 2 tables scanned, exit 0.

Test-database migration smoke:

```sh
cd api
set -a; . ./.env.test; set +a
DB_PORT=15432 node ace migration:run
```

- Initial successful run migrated both migration files into
  `ideal_learning_test`.
- Final idempotence run: `Already up to date`, 2 tables scanned, exit 0.

Cleanup of only the isolated smoke resources:

```sh
docker compose --env-file .env.example \
  -p ideal-learning-final-fix \
  -f docker-compose.yml \
  -f docker-compose.smoke.yml \
  down -v
```

- Exit 0; the two smoke containers, their isolated network, and their two
  temporary volumes were removed. This test data was intentionally ephemeral
  and is not recoverable; no external Docker resources were changed.

## Diagnostic attempts and handled exceptions

- Initial API baseline: `cd api && npm run lint` failed with exactly one
  `prettier/prettier` error in generated `database/schema.ts`; baseline
  `npm run typecheck` passed.
- Initial Web baseline:
  `cd web && npm run lint && npm run test && npm run typecheck && npm run build`
  passed with 2 tests before the new regression test.
- `node --version` reported `v25.9.0`; `npm --version` reported `11.12.1`;
  installed Vite reported `8.2.2` and engine
  `^20.19.0 || >=22.12.0`.
- `ss -ltn '( sport = :5432 or sport = :9000 or sport = :9001 )'` could not
  open the netlink socket in the restricted sandbox. The authoritative Docker
  startup then exposed the actual 9000 bind conflict.
- The first migration attempt used the preexisting local `api/.env` and failed
  validation because that untracked file contains only legacy app keys. It was
  not overwritten. Comparing key names with
  `awk -F= '/^[A-Z][A-Z0-9_]*=/{print $1}'` confirmed the versioned
  `api/.env.example` is complete; smoke commands loaded that example.
- The next migration attempt found `pg` missing from the local `node_modules`
  even though it was already present in `package.json` and the lockfile.
  `cd api && npm ci` first failed with sandbox DNS `EAI_AGAIN`; the same command
  with approved network access installed 517 locked packages and audited 518
  with 0 vulnerabilities. No dependency versions changed.
- A migration attempt inside the restricted sandbox failed with
  `connect EPERM 127.0.0.1:15432`; the same `node ace migration:run` with
  approved loopback access succeeded.
- The first test-database boot caught the invalid 15-character
  `APP_KEY=testing-app-key`; after changing only that test value to
  `testing-app-key-value`, the test migration succeeded.
- `DB_PORT=15432 npm test` first hit a sandbox-only
  `uv_interface_addresses` error; outside the network sandbox it booted and
  exited 0 with `NO TESTS EXECUTED`.

## Files changed

- Root: `.env.example`, `.gitignore`, `README.md`, `docker-compose.yml`,
  `docker-compose.smoke.yml`.
- PostgreSQL: `docker/postgres/10-init-test-db.sh`.
- API: `.env.test`, `.gitignore`, `.prettierignore`, `package.json`,
  `package-lock.json`.
- Web: `package.json`, `package-lock.json`, `vite.config.ts`,
  `src/lib/api-client.ts`, `src/lib/api-client.test.ts`.
