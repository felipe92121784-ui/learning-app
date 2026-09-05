# Task 1 — API administrativa de usuários

## Resultado

Implementados os endpoints administrativos de listagem, criação, detalhe e
atualização de usuários, todos protegidos por sessão web e papel `ADMIN`.
A criação fixa `role = STUDENT` e `status = ACTIVE` no servidor. A atualização
aceita somente nome e e-mail. Todas as respostas passam pelo
`UserTransformer`, sem senha/hash.

Não foram alterados arquivos em `web/`, o `README` ou os endpoints de status e
troca de senha da Task 2. Nenhum commit foi tentado, conforme solicitado.

## TDD

### RED

`api/tests/functional/users.spec.ts` foi criado antes do código de produção,
com sete cenários para:

- ADMIN listar, criar, consultar e atualizar usuários;
- criação forçar aluno ativo, persistir hash e não expor `password`;
- atualização ignorar `password`, `role` e `status`;
- STUDENT receber `403` nos quatro endpoints;
- e-mail duplicado retornar `422` tanto na criação quanto na atualização.

O comando literal do plano interpreta o caminho como nome de suíte na versão
atual do Japa:

```text
cd api && npm test tests/functional/users.spec.ts
Cannot apply suites filter. "tests/functional/users.spec.ts" suite is not configured
```

O filtro válido é `--files`. A primeira execução com ele revelou que
`loginAs` dependia de um helper `withSession` não instalado. O teste foi
corrigido antes da produção para exercitar o fluxo real login → cookie de
sessão → endpoint administrativo. Depois disso, o RED esperado foi comprovado:

```text
cd api && npm test -- --files tests/functional/users.spec.ts
Tests 7 failed (7)
Expected 200/201/403/422, received 404
```

Os sete testes falharam especificamente porque as rotas administrativas ainda
não existiam.

### GREEN

Depois de adicionar middleware, validadores, controller e rotas:

```text
cd api && npm test -- --files tests/functional/users.spec.ts
Tests 7 passed (7)
```

## Implementação

- `AdminMiddleware` retorna `403` quando o usuário autenticado não é `ADMIN`.
- As quatro rotas usam primeiro o middleware de autenticação com guard `web` e
  depois o middleware administrativo.
- `createAdminUserValidator` valida nome, e-mail único e senha.
- `updateAdminUserValidator` permite somente nome/e-mail e exclui o próprio ID
  da verificação de unicidade.
- `UsersController` delega validação e serialização, ordena a listagem por ID,
  responde `201` na criação e usa `findOrFail` em detalhe/atualização.

## Arquivos alterados

- `api/app/controllers/users_controller.ts` (novo)
- `api/app/middleware/admin_middleware.ts` (novo)
- `api/app/validators/admin_user.ts` (novo)
- `api/tests/functional/users.spec.ts` (novo)
- `api/start/kernel.ts`
- `api/start/routes.ts`
- `.superpowers/sdd/2026-09-03-user-administration/task-1-report.md` (novo)

## Verificação final

```text
cd api && npm test
Tests 14 passed (14)

cd api && npm run typecheck
exit 0

cd api && npm run lint
exit 0
```

O primeiro lint após a implementação apontou somente duas quebras de linha do
Prettier no novo teste. `npx prettier --write tests/functional/users.spec.ts`
formatou somente esse arquivo; a repetição do lint encerrou com código 0.

## Notas de ambiente

- O runner funcional precisa consultar interfaces de rede e abrir o servidor
  HTTP local; dentro do sandbox ele falhou com
  `uv_interface_addresses returned Unknown system error 1`. As execuções Japa
  válidas foram feitas com a permissão necessária fora do sandbox.
- O projeto já possuía autenticação por sessão web e revalidação de conta
  ativa. A Task 1 reutiliza esse comportamento e acrescenta somente a
  autorização por papel.
