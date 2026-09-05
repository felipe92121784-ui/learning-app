# Task 3 — Estado de autenticação e guards no Web

## Resultado

Implementada a autenticação Web baseada exclusivamente na sessão HTTP-only da
API. O cliente envia cookies em todas as requisições, o `AuthProvider` restaura
o perfil com TanStack Query e expõe `user`, `isLoading`, `login` e `logout`.
Nenhum token ou credencial é salvo em `localStorage` ou `sessionStorage`.

`/app` exige usuário `ACTIVE`; `/admin` exige usuário `ACTIVE` com papel
`ADMIN`. Os `beforeLoad` aguardam a consulta de perfil pelo cache compartilhado
antes de liberar a rota, evitando flash de conteúdo protegido. Anônimos são
enviados a `/login`, estudantes são enviados de `/admin` para `/app` e usuários
autenticados são enviados de `/login` para `/app`.

O formulário de login possui labels associados aos campos, autocomplete,
estado pendente e mensagem genérica para qualquer falha. Os shells protegidos
incluem navegação e ação de logout; o logout limpa/invalida o perfil e redireciona
para `/login`.

## Contrato consumido

Foi usado o contrato efetivo entregue pela Task 2:

- `POST /api/v1/auth/login` retorna `{ data: { user } }` e estabelece cookie;
- `GET /api/v1/account/profile` retorna `{ data: { user } }` ou `401`;
- `POST /api/v1/account/logout` encerra a sessão.

## TDD

### RED

Os testes foram escritos antes dos respectivos comportamentos de produção e
falharam pelas lacunas esperadas:

- `apiClient` retornou `credentials: undefined` em vez de `include`;
- módulos `auth-api`, `auth-guards`, `auth-provider`, `auth-cache` e formulário
  ainda não existiam;
- a integração da árvore de rotas falhou porque `createAppRouter` ainda não
  existia.

### GREEN

A suíte final cobre:

- cookies incluídos pelo cliente central;
- login JSON e ausência de uso de browser storage;
- restauração de perfil, `401` tratado como usuário ausente e logout;
- cache de perfil atualizado e invalidado após login/logout;
- estado exposto pelo `AuthProvider`;
- labels e erro genérico do formulário;
- redirects reais da árvore de rotas em memória para anônimo, estudante,
  administrador e login autenticado.

Resultado final: 7 arquivos de teste, 20 testes aprovados.

## Arquivos

Modificados:

- `web/src/lib/api-client.ts`
- `web/src/lib/api-client.test.ts`
- `web/src/main.tsx`
- `web/src/router.tsx`
- `web/src/router.test.ts`
- `web/src/routeTree.gen.ts` (gerado pelo plugin do TanStack Router)
- `web/src/routes/__root.tsx`
- `web/src/routes/index.tsx`

Criados:

- `web/src/features/auth/auth-api.ts`
- `web/src/features/auth/auth-api.test.ts`
- `web/src/features/auth/auth-cache.ts`
- `web/src/features/auth/auth-cache.test.ts`
- `web/src/features/auth/auth-guards.ts`
- `web/src/features/auth/auth-guards.test.ts`
- `web/src/features/auth/auth-provider.tsx`
- `web/src/features/auth/auth-provider.test.tsx`
- `web/src/features/auth/auth-types.ts`
- `web/src/features/auth/authenticated-shell.tsx`
- `web/src/features/auth/login-form.tsx`
- `web/src/routes/-login.test.tsx`
- `web/src/routes/login.tsx`
- `web/src/routes/_app.tsx`
- `web/src/routes/_app/app.tsx`
- `web/src/routes/_admin.tsx`
- `web/src/routes/_admin/admin.tsx`

O plano sugeria `_app/index.tsx` e `_admin/index.tsx`. No TanStack Router, um
segmento iniciado por `_` é pathless e seu `index.tsx` resolveria para `/`, não
para `/app` ou `/admin`. Por isso os layouts solicitados foram mantidos como
`_app.tsx` e `_admin.tsx`, com filhos `app.tsx` e `admin.tsx`, produzindo os URLs
corretos sem conflito com a rota raiz.

Nenhum arquivo da API ou da raiz foi alterado e nenhum commit foi criado.

## Verificação final

```text
cd web && npm run lint
exit 0, sem warnings

cd web && npm test
Test Files 7 passed (7)
Tests 20 passed (20)

cd web && npm run typecheck
exit 0

cd web && npm run build
168 modules transformed
exit 0
```
