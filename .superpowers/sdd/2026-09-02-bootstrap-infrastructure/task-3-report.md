# Task 3 — Ambiente Docker e documentação de inicialização

## Status

Concluída sem commits. O diretório não é um repositório Git válido (`git status`
retornou `fatal: not a git repository`), portanto nenhum comando Git de escrita
foi executado.

## Mudanças realizadas

- Criado `docker-compose.yml` com exatamente dois serviços:
  - `postgres`, usando `postgres:17-alpine`, `POSTGRES_*` do ambiente raiz,
    porta `5432`, volume nomeado `postgres_data` e healthcheck `pg_isready`.
  - `minio`, usando a release fixada e verificável
    `minio/minio:RELEASE.2025-04-22T22-12-26Z` (digest baixado:
    `sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e`),
    comando `server /data --console-address ":9001"`, `MINIO_ROOT_*` do
    ambiente raiz, portas `9000` e `9001`, volume nomeado `minio_data` e
    healthcheck HTTP em `/minio/health/live`.
- Criado `.env.example` raiz com credenciais exclusivamente locais para
  PostgreSQL e MinIO.
- Criado `.gitignore` para arquivos de ambiente locais, dependências, builds,
  relatórios de cobertura e arquivos de IDE/SO; `.env.example` permanece
  rastreável.
- Criado `README.md` com o bootstrap reproduzível, cópia dos três exemplos de
  ambiente, inicialização da infraestrutura por `docker compose up -d --wait`,
  instalações independentes de API e Web, migração via `node ace migration:run`,
  URLs locais e a observação de que Redis não é usado.

## Comandos de validação e resultados

| Comando | Resultado |
| --- | --- |
| `docker compose --env-file .env.example config` | Código 0. Renderizou apenas `postgres` e `minio`, sem variáveis ausentes; confirmou as portas, volumes e healthchecks. |
| `docker compose --env-file .env.example config --services` | Código 0. Saída: `postgres` e `minio`. |
| `docker pull minio/minio:RELEASE.2025-04-22T22-12-26Z` | Código 0. A tag de release existe no registry e foi resolvida para `sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e`. |
| `docker run --rm --entrypoint /bin/sh minio/minio:RELEASE.2025-04-22T22-12-26Z -c 'command -v curl'` | Código 0. Saída: `/usr/bin/curl`; o mecanismo configurado no healthcheck existe na imagem fixada. |
| `docker compose --env-file .env.example up -d --wait` | Não completou porque a porta publicada `0.0.0.0:9000` já estava alocada por outro processo/container local. Os containers e a rede temporários foram removidos em seguida com `docker compose ... down`. |
| `docker compose --env-file .env.example run -d --no-deps minio` + `docker inspect --format '{{.State.Health.Status}}' <container>` | Código 0. O mesmo serviço, sem publicar portas para não conflitar com a porta local ocupada, retornou `healthy`; o log do healthcheck registrou duas execuções com exit code `0`. |
| `docker compose --env-file .env.example down --remove-orphans` | Código 0. Removeu o container one-off e a rede usados somente na validação. |
| `rg` sobre Compose, README e `.gitignore` | Código 0. Confirmou imagens, portas, volumes, healthchecks, `node ace migration:run`, ausência declarada de Redis, URLs e regras de ignore exigidas. |
| `git status --short` | Não aplicável: falhou porque o diretório não é um repositório Git; nenhum commit foi tentado, conforme instrução. |

## Auto-revisão contra o brief

- O Compose contém somente PostgreSQL e MinIO; não há Redis nem containers da
  API/Web.
- Os dois serviços têm volumes persistentes, portas padrão e healthchecks. O
  healthcheck HTTP do MinIO foi executado com a imagem fixada e atingiu
  `healthy` com exit code `0`.
- As credenciais do Compose são injetadas por `.env`; os valores de exemplo são
  locais e diferentes de valores de produção.
- A documentação separa claramente os ambientes raiz, API e Web e usa o comando
  Ace decidido no brief (`node ace migration:run`).
- Não foram modificados arquivos em `api/` ou `web/`.

## Preocupações remanescentes

- O MinIO foi validado em container, inclusive o healthcheck. A execução
  completa de `docker compose up -d --wait` ficou impedida neste host porque a
  porta publicada `9000` já estava ocupada externamente ao projeto. Em uma
  máquina com as portas `5432`, `9000` e `9001` disponíveis, o comando do README
  aguardará os healthchecks antes das migrations.
