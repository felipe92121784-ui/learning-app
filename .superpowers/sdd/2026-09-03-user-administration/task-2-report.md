# Task 2 — Bloqueio e troca de senha

## Resultado

Implementado o endpoint administrativo de status com os únicos valores
`ACTIVE` e `BLOCKED`, e o endpoint autenticado de troca da própria senha. O
fluxo de bloqueio foi validado ponta a ponta: depois de um ADMIN bloquear um
aluno, a sessão que o aluno já possuía recebe `401` na próxima requisição,
enquanto o ADMIN ativo continua autenticado.

A troca de senha exige a senha atual correta e confirmação da nova senha. A
persistência usa o hook de hash já fornecido por `withAuthFinder`; nenhuma
senha ou hash é serializado. Não foram alterados arquivos em `web/` nem o
`README`, e nenhum commit foi tentado porque o diretório não possui Git válido.

## TDD

### RED

Os testes foram adicionados antes do código de produção:

- `users.spec.ts`: bloqueio, reativação, rejeição de status fora do enum,
  revogação de sessão existente, preservação da sessão do ADMIN ativo e `403`
  para STUDENT no novo endpoint;
- `account_password.spec.ts`: senha atual incorreta, troca bem-sucedida somente
  para o usuário autenticado, confirmação divergente e exigência de sessão.

As execuções RED falharam pelo motivo esperado — as rotas ainda não existiam:

```text
cd api && npm test -- --files=tests/functional/users.spec.ts
Tests 6 passed, 4 failed (10)
Expected 200/422/403, received 404

cd api && npm test -- --files=tests/functional/account_password.spec.ts
Tests 4 failed (4)
Expected 422/200/401, received 404
```

### GREEN

Depois da implementação mínima:

```text
cd api && npm test -- --files=tests/functional/account_password.spec.ts
Tests 4 passed (4)

cd api && npm test -- --files=tests/functional/users.spec.ts
Tests 10 passed (10)
```

## Implementação

- `PATCH /api/v1/users/:id/status` permanece atrás dos middlewares de sessão e
  ADMIN, valida o status com `USER_STATUSES`, persiste a alteração e retorna o
  transformer público do usuário.
- `PATCH /api/v1/account/password` permanece atrás do middleware de sessão,
  valida `currentPassword`, `newPassword` e `newPasswordConfirmation`, usa
  `validatePassword` para produzir erro `422` estruturado e salva somente o
  usuário autenticado.
- A revalidação de `ACTIVE` já existente em `AuthMiddleware` é exercitada na
  requisição posterior ao bloqueio. O teste também confirma que ela não
  interrompe a sessão de um ADMIN que continua `ACTIVE`.

## Arquivos alterados

- `api/app/controllers/account_passwords_controller.ts` (novo)
- `api/app/controllers/users_controller.ts`
- `api/app/validators/account_password.ts` (novo)
- `api/app/validators/admin_user.ts`
- `api/start/routes.ts`
- `api/tests/functional/account_password.spec.ts` (novo)
- `api/tests/functional/users.spec.ts`
- `.superpowers/sdd/2026-09-03-user-administration/task-2-report.md` (novo)

## Verificações

```text
cd api && npm test
Tests 21 passed (21)

cd api && npm run typecheck
exit 0

cd api && npm run lint
exit 0
```

## Notas de ambiente

- O comando literal `npm test tests/functional/...` é interpretado pelo Japa
  atual como filtro de suíte; o filtro funcional correto é `--files=...`.
- O runner funcional precisa consultar interfaces de rede e abrir o servidor
  HTTP local. Dentro do sandbox ocorreu
  `uv_interface_addresses returned Unknown system error 1`; as execuções
  válidas foram feitas fora do sandbox com a permissão necessária.
- Duas suítes funcionais não podem ser executadas em paralelo porque ambas
  tentam usar `127.0.0.1:3333`; por isso todas as evidências válidas acima foram
  coletadas sequencialmente.
