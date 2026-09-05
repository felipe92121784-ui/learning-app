# Task 3 — Interface administrativa shadcn/ui

## Resultado

Implementada a administração Web de usuários em `/admin/users`, com listagem,
filtro de status, criação, edição de nome/e-mail e confirmação para bloquear ou
reativar alunos. A UI usa TanStack Query para preload, cache, mutations e
invalidação; estados de carregamento e erro ficam visíveis nas páginas e nas
ações.

As rotas continuam abaixo do layout `_admin`, que já executa
`requireAdminUser`. Assim, um STUDENT é redirecionado para `/app` antes de
carregar dados administrativos; a API permanece responsável pela autorização
final. A tabela exibe administradores somente para leitura e oferece edição e
status apenas para usuários `STUDENT`.

Não foram alterados arquivos em `api/`, o `README` ou a página de conta da Task
4. Nenhum commit foi tentado porque o diretório não possui Git válido.

## TDD

### RED

Os testes foram escritos antes de cada comportamento e falharam pelas lacunas
esperadas:

- `users-api.test.ts`: o módulo de transporte ainda não existia;
- `users-queries.test.tsx`: os hooks e query keys ainda não existiam;
- `users-table.test.tsx`: a tabela/status/actions ainda não existia;
- `user-form.test.tsx`: os formulários ainda não existiam; depois, os testes
  detectaram que o callback público recebia indevidamente o evento DOM como
  segundo argumento;
- `-users-routes.test.tsx`: os caches de listagem e detalhe permaneciam
  `undefined` porque as rotas não tinham loaders;
- o teste adicional da mutation de criação mostrou que a lista em cache
  continuava antiga até o refetch.

### GREEN

Os ciclos focados encerraram com:

```text
users-api.test.ts             5 passed
users-queries.test.tsx        3 passed
users-table.test.tsx          3 passed
user-form.test.tsx            3 passed
-users-routes.test.tsx        3 passed
```

A cobertura da Task 3 valida as cinco chamadas HTTP, carregamento via hook,
cache/invalidação após criação e status, badges traduzidos, confirmação de
bloqueio, estado pendente/erro, payloads distintos de criação/edição e guard +
preload das rotas reais.

## Implementação

- `users-api.ts` consome o envelope público `{ data }` dos cinco endpoints sem
  enviar `role`/`status` na criação ou senha na edição.
- `users-queries.ts` centraliza query keys, list/detail hooks e mutations. O
  usuário retornado atualiza os caches imediatamente, seguido de invalidação.
- `UsersTable` usa `Table`, `Badge`, `Dialog`, `Alert` e `Button`; mudanças de
  status exigem confirmação e mostram loading/erro.
- `CreateUserForm` e `EditUserForm` usam `Form`, React Hook Form e Zod. Criação
  recebe senha inicial; edição expõe apenas nome/e-mail.
- a listagem usa o `Select` shadcn para filtrar todos, ativos ou bloqueados.
- o painel `/admin` ganhou acesso à gestão de usuários.

## shadcn/ui

Foram adicionados os componentes oficiais `table`, `badge`, `dialog`, `select`
e `form`. O CLI atual criou os quatro primeiros em um diretório literal `@/`
em vez de resolver o alias para `src`; o conteúdo oficial foi movido via patch
para `src/components/ui` e o diretório incorreto foi removido.

O `form` exigia `react-hook-form`, `zod` e `@hookform/resolvers`. O resolver
mais recente publicado apresentou conflito de peer dependency com o Zod já
usado pelo router, por isso foi fixada a versão compatível `5.2.2` sem
`--force`/`--legacy-peer-deps`; o componente foi aplicado a partir do conteúdo
do registro oficial.

## Rotas

O plano sugeria `routes/_admin/users/*`, mas `_admin` é um layout pathless no
TanStack Router e essa estrutura geraria `/users/*`. Para entregar os URLs da
spec, `admin.tsx` passou a ser um layout com `Outlet`, o painel foi preservado
em `admin/index.tsx` e as novas páginas ficaram em
`routes/_admin/admin/users/*`. A árvore gerada confirma:

```text
/admin/users
/admin/users/new
/admin/users/$userId
```

Todas continuam descendentes do layout `_admin` existente.

## Arquivos

Modificados:

- `web/package.json`
- `web/package-lock.json`
- `web/src/routeTree.gen.ts` (gerado pelo plugin do TanStack Router)
- `web/src/routes/_admin/admin.tsx`

Criados:

- `web/src/components/ui/badge.tsx`
- `web/src/components/ui/dialog.tsx`
- `web/src/components/ui/form.tsx`
- `web/src/components/ui/select.tsx`
- `web/src/components/ui/table.tsx`
- `web/src/features/users/user-form.tsx`
- `web/src/features/users/user-form.test.tsx`
- `web/src/features/users/users-api.ts`
- `web/src/features/users/users-api.test.ts`
- `web/src/features/users/users-queries.ts`
- `web/src/features/users/users-queries.test.tsx`
- `web/src/features/users/users-table.tsx`
- `web/src/features/users/users-table.test.tsx`
- `web/src/features/users/users-types.ts`
- `web/src/routes/_admin/admin/index.tsx`
- `web/src/routes/_admin/admin/users/index.tsx`
- `web/src/routes/_admin/admin/users/new.tsx`
- `web/src/routes/_admin/admin/users/$userId.tsx`
- `web/src/routes/_admin/admin/users/-users-routes.test.tsx`
- `.superpowers/sdd/2026-09-03-user-administration/task-3-report.md`

## Verificação final

```text
cd web && npm test
Test Files 12 passed (12)
Tests 37 passed (37)

cd web && npm run typecheck
exit 0

cd web && npm run lint
exit 0, sem warnings

cd web && npm run build
2197 modules transformed
exit 0
```
