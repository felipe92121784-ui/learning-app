# Deploy de produção no Zima

**Data:** 2026-09-07  
**Status:** aprovado para especificação; aguarda revisão do documento e plano executável

## Objetivo

Empacotar o Ideal Learning para execução autônoma no Zima, sem incluir Cloudflare
Tunnel. O tunnel existente do usuário apontará para a única porta HTTP publicada
pela stack.

## Arquitetura

```text
Cloudflare Tunnel existente
  → host Zima:${APP_PORT}
    → web (Caddy + SPA React)
      └─ /api/* → api:3333
                     ├─ postgres
                     ├─ minio privado
                     └─ worker
```

O serviço `web` é a única entrada pública, com `${APP_PORT:-8080}:80`.
`api`, `worker`, `postgres` e `minio` compartilham uma rede Docker interna e
não têm portas publicadas.

## Serviços

- `web`: build multi-stage do React e Caddy. Serve a SPA com fallback para
  `index.html` e faz reverse proxy de `/api/*` para `api:3333`.
- `api`: build multi-stage da aplicação Adonis. Em produção executa
  `node bin/server.js`, não o servidor de desenvolvimento.
- `worker`: reutiliza a imagem de API e executa `node ace process:material-jobs`.
- `postgres`: banco com volume persistente e healthcheck.
- `minio`: armazenamento privado com volume persistente e healthcheck; não
  publica API nem console.

Todos os serviços usam `restart: unless-stopped`. API, worker e web aguardam
as dependências necessárias por healthcheck.

## Configuração

O arquivo real `.env.production` é ignorado. O exemplo versionado contém todas
as chaves sem segredos reais.

Variáveis principais:

- `APP_PORT=8080`: porta local do Zima publicada pelo serviço web; o usuário
  pode alterá-la para evitar conflito.
- `APP_PUBLIC_URL=https://dominio-a-definir`: obrigatória. Alimenta
  `APP_URL`, `CORS_ORIGIN` e `VITE_API_URL=${APP_PUBLIC_URL}/api/v1`.
- `APP_KEY`: segredo forte próprio da instância.
- `POSTGRES_*`, `MINIO_ROOT_*`, `S3_*`: credenciais fortes e coerentes entre
  serviços.
- `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`: usados uma única vez pelo
  seed idempotente.
- `IMAGE_TILE_THRESHOLD_PX=4096` e `IMAGE_TILE_SIZE=256`: preservam o
  comportamento de imagens protegidas.

Com Web e API no mesmo domínio público, sessões permanecem `Secure`,
`HttpOnly` e `SameSite=Lax` em produção. CORS aceita exclusivamente
`APP_PUBLIC_URL`.

## Operação

Primeira instalação:

1. Copiar `.env.production.example` para `.env.production` e preencher todos
   os segredos e `APP_PUBLIC_URL`.
2. Subir a stack com build.
3. Executar migrations como comando explícito no container API.
4. Executar o seed idempotente do administrador como comando explícito.
5. Configurar o tunnel existente para o host e `APP_PORT` escolhido.

Atualizações usam `docker compose --env-file .env.production -f
docker-compose.production.yml up -d --build`; não recriam volumes. Migrations
continuam explícitas quando uma versão as introduzir.

Backup é responsabilidade operacional do Zima: preservar/exportar os volumes
de Postgres e MinIO antes de atualizações relevantes. O guia documenta os
nomes desses volumes e os smoke tests de login, upload/processamento e viewer
protegido.

## Segurança

- Nenhum container de Cloudflare Tunnel, segredo de tunnel ou porta de banco/
  MinIO entra na stack pública.
- MinIO mantém bucket e objetos privados; API/worker usam somente a rede
  interna.
- O Caddy não faz cache de conteúdo protegido; a API continua emitindo
  respostas `private, no-store`.
- Não registrar segredos em Compose, Dockerfile, README ou exemplos reais.

## Validação

- Build da imagem API, Web e worker.
- `docker compose config` com `.env.production.example` preenchido de forma
  sintática.
- Subida local da stack, healthchecks e migrations/seed explícitos.
- Smoke test através da porta do web: login, perfil, upload, processamento,
  visualização protegida e controle de acesso.

## Fora de escopo

- Criar, autenticar ou configurar Cloudflare Tunnel.
- TLS dentro do container; TLS termina no tunnel existente.
- Alta disponibilidade, múltiplos nós, backup automatizado externo ou CI/CD.
