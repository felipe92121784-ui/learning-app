# Task 1 — Infraestrutura da API: relatório

## Escopo executado

Implementada a preparação da API AdonisJS para PostgreSQL e MinIO, sem criar
modelos, endpoints ou serviços de domínio. A conexão Lucid padrão agora é
PostgreSQL e CORS usa apenas a allowlist informada por ambiente.

## Arquivos alterados

- `api/package.json`
  - Remove `better-sqlite3` das dependências e de `allowScripts`.
  - Adiciona `pg` em `dependencies` (`^8.16.3`).
- `api/package-lock.json`
  - Regenerado com `pg` como dependência direta e sem `better-sqlite3` como
    dependência direta.
- `api/config/database.ts`
  - Define `pg` como conexão padrão, com `DB_HOST`, `DB_PORT`, `DB_USER`,
    `DB_PASSWORD` e `DB_DATABASE`; preserva migrations em
    `database/migrations` e `debug: app.inDev`.
- `api/config/cors.ts`
  - Troca a abertura de desenvolvimento pela allowlist
    `env.get('CORS_ORIGIN').split(',').map((origin) => origin.trim())`.
  - Mantém `credentials: true`, métodos REST e `headers: true`.
- `api/start/env.ts`
  - Valida todas as variáveis `DB_*`, `CORS_ORIGIN` e `S3_*`; `DB_PORT` usa
    `Env.schema.number()` e `S3_ENDPOINT` usa URL com `tld: false`.
- `api/.env.example`
  - Documenta valores locais de PostgreSQL, CORS e MinIO.
- `api/.env.test`
  - Define valores completos e isolados para a validação de ambiente em testes.
- `api/.env.docker.example`
  - Novo exemplo para containers, com `DB_HOST=postgres` e
    `S3_ENDPOINT=http://minio:9000`.

## Comandos e evidências

| Comando | Resultado |
| --- | --- |
| `npm install --package-lock-only` | código 0; lockfile atualizado; 0 vulnerabilidades reportadas pelo npm. |
| `npm run typecheck` | código 0 (`tsc --noEmit`). Executado novamente após o ajuste de formatação, também com código 0. |
| `npm run lint` (primeira execução) | código 1: formatação em `api/config/cors.ts` e em `api/database/schema.ts`. |
| `npm run lint` (após ajustar CORS) | código 1 apenas em `api/database/schema.ts:11`, regra `prettier/prettier`. |
| `npx eslint config/database.ts config/cors.ts start/env.ts` | código 0 para os três arquivos TypeScript configurados nesta task. |
| `NODE_ENV=test node ace list` | código 0; a aplicação carregou com a validação de ambiente de teste. |
| Checagem programática do lockfile | código 0: `pg=^8.16.3`; `better-sqlite3` ausente das dependências diretas. |

## Auto-revisão contra o plano

- Driver SQLite removido da API e conexão Lucid padrão definida como `pg`.
- Todas as variáveis de banco, CORS e S3 solicitadas são documentadas e
  validadas.
- A allowlist de CORS não usa `origin: true`; trimming de múltiplas origens é
  preservado conforme o contrato.
- Os exemplos local e Docker usam os mesmos nomes de variáveis; o Docker usa
  os nomes internos dos serviços para PostgreSQL e MinIO.
- Não foram criados modelos, endpoints, migrations ou serviço de storage.
- Nenhum commit foi tentado, pois o repositório Git não é válido/escrevível.

## Preocupações / bloqueios

O lint global ainda falha por uma única divergência de Prettier em
`api/database/schema.ts:11`. O arquivo é gerado e não integra a lista de
arquivos atribuídos à Task 1, portanto não foi alterado. A configuração da
Task 1 passa no lint direcionado e o typecheck global passa.
