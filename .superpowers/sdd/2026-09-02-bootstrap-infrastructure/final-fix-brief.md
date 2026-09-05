### Final review fix wave

Own the complete final-review remediation. You may modify only files needed to address the listed findings in `api/`, `web/`, the repository root, and `docker/postgres/` if needed for Postgres initialization. Do not add Redis, app containers, domain functionality, auth persistence, or any other product feature. There is no valid Git repository: do not commit.

Address every finding exactly:

1. Bind exposed Compose ports to loopback: `127.0.0.1:5432:5432`, `127.0.0.1:9000:9000`, `127.0.0.1:9001:9001`.
2. Make `npm run lint` in `api/` globally clean, including the existing generated schema formatting issue, with the smallest safe change.
3. Provision the separate `.env.test` Postgres role/database used by API tests through the same development Postgres service (an init SQL/script mounted into `docker-entrypoint-initdb.d` is acceptable), and document it. Do not point tests at the development database.
4. Pin the Vite dev-server contract to port 5173 with `strictPort: true`, matching CORS.
5. Declare the minimum Node runtime required by installed Vite in README and package `engines` or a runtime version file; make README use `npm ci` with lockfiles.
6. Demonstrate the documented full Compose startup and `node ace migration:run`, or, if a genuine external port conflict blocks it, use a project-local override/alternate unused host ports that still exercises the production Compose definitions, explain the exact command and leave default bindings intact. Do not kill external processes.
7. Fix `apiClient` handling for a successful 204/empty response. This is behavior code: follow TDD, adding a test that fails before the implementation and reporting RED/GREEN evidence.
8. Document/ensure mapping of Compose credentials (`POSTGRES_*`, `MINIO_ROOT_*`) to API (`DB_*`, `S3_*`); make root/API ignore rules cover `.env` and `.env.*`, preserving exactly intended tracked env examples including `api/.env.test`.

Run focused and full relevant checks: API `npm run typecheck`, `npm run lint`; Web lint/tests/typecheck/build; `docker compose --env-file .env.example config`; Docker health and migration smoke when Docker socket/ports permit. Report every command, output summary, exceptions and TDD evidence in `final-fix-report.md` in this same directory.
