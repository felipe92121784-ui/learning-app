# Bootstrap de Infraestrutura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar a API AdonisJS e uma nova SPA React independentes prontas para desenvolvimento local com PostgreSQL e MinIO.

**Architecture:** A API mantém autenticação stateless por Bearer token, migra o Lucid para PostgreSQL e recebe configurações de CORS e MinIO exclusivamente por ambiente. O Web é uma SPA Vite separada que fornece Router, Query Client e um cliente HTTP central. O Compose inicia somente dependências de infraestrutura; API e Web continuam em processos locais.

**Tech Stack:** AdonisJS 7, TypeScript, PostgreSQL 17, MinIO, Docker Compose, React 19, Vite, TanStack Router, TanStack Query, Tailwind CSS, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-02-bootstrap-infrastructure-design.md`

## Global Constraints

- `api` e `web` precisam manter `package.json`, lockfile e `node_modules` próprios; não usar workspaces.
- Usar PostgreSQL e MinIO privados no ambiente local; não incluir Redis.
- A API é a única futura intermediária para recursos privados do storage.
- Não criar modelos/endpoints de Course, Module, Material ou permissões neste bootstrap.
- Não persistir tokens sensíveis no `localStorage` do Web.
- CORS deve permitir somente origens explicitamente configuradas.

---

### Task 1: Preparar a infraestrutura da API para PostgreSQL e MinIO

**Files:**
- Modify: `api/package.json`
- Modify: `api/config/database.ts`
- Modify: `api/config/cors.ts`
- Modify: `api/start/env.ts`
- Modify: `api/.env.example`
- Modify: `api/.env.test`
- Create: `api/.env.docker.example`

**Interfaces:**
- Consumes: variáveis `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`, `CORS_ORIGIN`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`.
- Produces: configuração Lucid `pg` válida e CORS com allowlist explícita.

- [ ] **Step 1: Atualizar os drivers da API**

No `api/package.json`, remover `better-sqlite3` de `dependencies` e adicionar `pg` em `dependencies`. Manter as versões existentes de AdonisJS.

- [ ] **Step 2: Configurar e validar ambiente**

Em `api/start/env.ts`, acrescentar schemas para host, porta, usuário, senha e nome do banco, origem CORS e endpoint/credenciais/bucket/região S3. Usar `Env.schema.number()` para `DB_PORT`, `Env.schema.string()` para valores secretos e `Env.schema.string({ format: 'url', tld: false })` para endpoints URL.

- [ ] **Step 3: Trocar a conexão Lucid para Postgres**

Substituir a conexão `sqlite` em `api/config/database.ts` por `pg`, usando `env.get('DB_*')`, migrations em `database/migrations` e `debug: app.inDev`. A conexão padrão deve ser `pg`.

- [ ] **Step 4: Restringir CORS por ambiente**

Em `api/config/cors.ts`, usar `env.get('CORS_ORIGIN').split(',').map((origin) => origin.trim())` como allowlist e preservar `credentials: true`, métodos REST e headers refletidos. Não usar `origin: true`.

- [ ] **Step 5: Atualizar os exemplos de variáveis**

Documentar os valores locais de desenvolvimento em `api/.env.example`, incluindo Postgres, CORS e MinIO. Criar `api/.env.docker.example` com os mesmos nomes e os endpoints internos de serviço (`postgres` e `minio`) para uso futuro em containers. Manter segredos como valores de exemplo, sem reutilizar os de produção.

- [ ] **Step 6: Instalar e verificar a API**

Run: `npm install --package-lock-only && npm run typecheck && npm run lint`

Expected: o lockfile contém `pg`; TypeScript e ESLint terminam com código 0.

- [ ] **Step 7: Commit**

```bash
git add api/package.json api/package-lock.json api/config/database.ts api/config/cors.ts api/start/env.ts api/.env.example api/.env.test api/.env.docker.example
git commit -m "chore(api): configure postgres and storage environment"
```

### Task 2: Criar o projeto Web independente

**Files:**
- Create: `web/` (scaffold Vite React TypeScript)
- Create: `web/.env.example`
- Create: `web/components.json`
- Modify: `web/package.json`
- Modify: `web/vite.config.ts`
- Modify: `web/tsconfig.app.json`
- Create: `web/src/routes/__root.tsx`
- Create: `web/src/routes/index.tsx`
- Create: `web/src/router.tsx`
- Create: `web/src/lib/api-client.ts`
- Modify: `web/src/main.tsx`
- Modify: `web/src/index.css`

**Interfaces:**
- Consumes: `VITE_API_URL`.
- Produces: `apiClient(path, options)` returning `Promise<T>`, `router`, `QueryClientProvider` e uma rota inicial renderizável.

- [ ] **Step 1: Criar o scaffold e instalar dependências**

Run: `npm create vite@latest web -- --template react-ts`, depois em `web`: `npm install @tanstack/react-query @tanstack/react-router @tanstack/router-plugin` e `npm install -D tailwindcss @tailwindcss/vite shadcn@latest`.

- [ ] **Step 2: Configurar Vite, Tailwind e shadcn**

No `web/vite.config.ts`, registrar os plugins React, Router e Tailwind. No CSS de entrada, importar Tailwind. Configurar aliases `@/*` no TypeScript/Vite e criar `components.json` apontando os componentes para `src/components/ui` e o CSS para `src/index.css`.

- [ ] **Step 3: Criar o contrato de cliente HTTP**

Criar `web/src/lib/api-client.ts` com:

```ts
export async function apiClient<T>(path: string, options: RequestInit = {}): Promise<T>
```

Ele deve compor `import.meta.env.VITE_API_URL`, enviar `Accept: application/json`, aceitar token apenas pelo cabeçalho provido pelo chamador e lançar `ApiError` para respostas não-OK. Não usar nem ler `localStorage`.

- [ ] **Step 4: Criar Router e Query Client**

Criar uma raiz de rotas e `index` com texto de bootstrap. Criar `router.tsx` com `createRouter`, e em `main.tsx` renderizar `QueryClientProvider` e `RouterProvider`. A rota de índice deve mostrar que o Web está pronto e exibir a URL de API apenas como configuração de diagnóstico em desenvolvimento.

- [ ] **Step 5: Criar arquivo de exemplo**

Criar `web/.env.example` com `VITE_API_URL=http://localhost:3333/api/v1`.

- [ ] **Step 6: Verificar o Web**

Run: `npm run typecheck && npm run build`

Expected: a checagem TypeScript e o build Vite terminam com código 0.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "chore(web): scaffold application infrastructure"
```

### Task 3: Adicionar o ambiente Docker e a documentação de inicialização

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Consumes: portas `5432`, `9000` e `9001`, além das variáveis definidas nos exemplos da API e Web.
- Produces: serviços Docker `postgres` e `minio` com healthchecks e instruções reproduzíveis de bootstrap.

- [ ] **Step 1: Criar Compose com Postgres e MinIO**

Definir serviço `postgres` com imagem `postgres:17-alpine`, volume nomeado `postgres_data`, healthcheck com `pg_isready`, `POSTGRES_*` por `.env` e porta `5432:5432`. Definir `minio` com imagem `minio/minio`, comando `server /data --console-address ":9001"`, volume `minio_data`, healthcheck HTTP no endpoint de saúde, `MINIO_ROOT_*` por `.env` e portas `9000:9000`/`9001:9001`.

- [ ] **Step 2: Criar convenções de ambiente e ignore**

Criar `.env.example` raiz com credenciais exclusivamente locais para Postgres e MinIO. Ignorar `.env`, `api/.env`, `web/.env`, `node_modules`, builds e arquivos de IDE, sem ignorar `.env.example`.

- [ ] **Step 3: Documentar o fluxo de desenvolvimento**

No `README.md`, documentar: copiar `.env.example` e os exemplos de cada app; `docker compose up -d`; `cd api && npm install && npm run migration:run` (ou o comando Ace equivalente); `npm run dev` na API; `cd web && npm install && npm run dev` no Web; URLs de API, SPA, MinIO e console. Incluir que não existe Redis e que os projetos são independentes.

- [ ] **Step 4: Verificar o Compose e o estado inicial**

Run: `docker compose --env-file .env.example config`

Expected: Compose renderizado sem campos ausentes e contendo exatamente `postgres` e `minio`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example .gitignore README.md
git commit -m "chore: add local development infrastructure"
```

## Self-review

- Cobertura: Task 1 cobre API/Postgres/CORS/MinIO por ambiente; Task 2 cobre toda a stack inicial do Web; Task 3 cobre Compose, exclusões Git e documentação. Redis está excluído explicitamente.
- Placeholders: não há marcadores `TBD`/`TODO`; os comandos e interfaces estão definidos.
- Consistência: `VITE_API_URL` é o único contrato Web→API; as variáveis `DB_*` e `S3_*` declaradas na API são usadas pela configuração e documentadas.
