# Bootstrap de infraestrutura

## Objetivo

Preparar o repositório para iniciar o Portal de Cursos e Materiais Técnicos
com dois projetos Node independentes: a API AdonisJS já existente e uma nova
SPA React chamada `web`. Este escopo não inclui modelos de domínio, telas de
produto ou endpoints além dos recursos de autenticação criados pelo starter da
API.

## Estrutura do repositório

```text
ideal-learning/
├── api/                  # API AdonisJS independente
├── web/                  # SPA React/Vite independente
├── docker-compose.yml    # Dependências de desenvolvimento
├── .env.example          # Convenções do ambiente local
└── README.md             # Instruções de inicialização
```

Cada projeto preserva seu próprio `package.json`, lockfile e `node_modules`.
Não haverá workspace nem monorepo JavaScript. A raiz será preparada para ser a
raiz do Git assim que o repositório for inicializado corretamente.

## API

O projeto `api` continuará usando AdonisJS e TypeScript. A autenticação já
instalada permanecerá baseada em tokens Bearer (`Authorization: Bearer …`) e
os endpoints de login, logout e perfil existentes continuarão sendo o ponto
de partida; não será criado fluxo de autorização de cursos nesta etapa.

Lucid será migrado de SQLite para PostgreSQL, com todas as configurações de
conexão validadas por variáveis de ambiente. O driver SQLite será removido e o
driver `pg` será usado. O CORS aceitará somente as origens configuradas por
ambiente, com `http://localhost:5173` como padrão local; não ficará aberto para
toda origem durante desenvolvimento.

As credenciais e o endpoint S3 do MinIO serão declarados e validados, mas uma
abstração/serviço de armazenamento só será criada quando o primeiro fluxo de
upload for implementado. Isso evita acoplar o domínio ao MinIO e evita código
sem consumidor.

## Web

O projeto `web` será criado com React, TypeScript e Vite. Ele incluirá
TanStack Router com roteamento baseado em arquivos, TanStack Query com um
`QueryClient` de aplicação, Tailwind CSS e a configuração base do shadcn/ui.

Haverá uma raiz de rotas, uma rota mínima de saúde/início e um cliente HTTP
centralizado. A URL da API virá de `VITE_API_URL`. O cliente será preparado
para anexar token apenas em memória quando uma futura camada de autenticação o
fornecer; não persistirá tokens em `localStorage`. Não serão criadas rotas ou
telas de `/admin` e `/app` neste bootstrap.

## Ambiente local

O `docker-compose.yml` terá somente:

- PostgreSQL, com volume nomeado persistente, healthcheck e porta exposta;
- MinIO, com volume nomeado persistente, console administrativo e healthcheck.

Redis não será incluído: não existe ainda requisito de cache, fila ou sessão
distribuída. A API e a SPA serão executadas no host com seus próprios comandos
de desenvolvimento, preservando feedback rápido de Vite e AdonisJS.

O arquivo de exemplo na raiz documentará as variáveis compartilhadas, e cada
app terá seu `.env.example` correspondente. Arquivos `.env` reais e dados de
volumes serão ignorados pelo Git.

## Verificação

Após a implementação, a verificação deve cobrir:

1. `docker compose config` resolve o Compose;
2. instalação e `typecheck` da API com o driver PostgreSQL;
3. instalação, `typecheck` e build do Web;
4. variáveis obrigatórias documentadas e validadas;
5. documentação com os comandos para subir dependências, migrar o banco e
   iniciar API e Web.

## Decisões explícitas

- PostgreSQL e MinIO são dependências locais obrigatórias.
- Redis fica fora deste bootstrap.
- A API mantém tokens Bearer para o ponto de partida existente.
- O Web e a API são projetos Node independentes, não um monorepo.
- Arquivos privados nunca são expostos diretamente pelo Web; a integração
  futura passa pela API.
