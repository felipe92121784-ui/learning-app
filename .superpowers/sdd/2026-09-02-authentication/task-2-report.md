# Task 2 — Sessão HTTP-only na API

## Resultado

Concluída a migração do fluxo de autenticação da API para o guard `web` do
Adonis. `POST /api/v1/auth/login` cria uma sessão HTTP-only e retorna
`{ data: { user } }`; perfil usa o mesmo envelope; logout encerra a sessão.
Somente usuários `ACTIVE` autenticam. Credenciais inválidas e usuários
`BLOCKED` recebem a mesma resposta genérica `401`. A rota pública de signup
foi removida.

Não foram modificados arquivos em `web/` ou documentação na raiz, e nenhum
commit foi criado (o diretório não possui repositório Git válido).

## TDD

### RED

O teste funcional `api/tests/functional/auth.spec.ts` foi escrito antes das
mudanças de produção. Ele cobre:

- login de usuário `ACTIVE`, cookie `adonis-session` HTTP-only e perfil usando
  esse cookie, sem token no payload;
- resposta genérica idêntica para senha inválida e usuário `BLOCKED`;
- bloqueio posterior de uma conta encerra o acesso da sessão já existente;
- logout seguido por perfil com `401`;
- ausência da rota `POST /api/v1/auth/signup`.

O comando literal do plano, com porta `15432`, não pôde alcançar o PostgreSQL
local porque este ambiente publica o banco de testes em `5432`:

```text
DB_PORT=15432 npm test -- --files tests/functional/auth.spec.ts
Error: connect ECONNREFUSED 127.0.0.1:15432
```

Com a porta definida em `api/.env.test`, o RED confirmou as lacunas esperadas
na implementação antiga:

```text
npm test -- --files tests/functional/auth.spec.ts
Expected 200, received 401  (perfil após login por token)
Expected 401, received 400  (credencial inválida)
Expected 200, received 401  (logout protegido pelo guard API)
Expected 404, received 200  (signup ainda público)
Tests 4 failed (4)
```

Durante a execução, foi identificado que `sessionApiClient(app)` substituía o
cookie da requisição no cliente Japa e destruía a sessão retornada no teardown,
impedindo a prova real de continuidade login → cookie → perfil. O plugin foi
removido de `api/tests/bootstrap.ts`; ele não é usado por nenhum teste atual.
O teste funcional também executa sua limpeza antes de criar os fixtures, para
ser resiliente a uma execução anterior interrompida.

### GREEN

Após mudar o guard padrão para `web`, proteger as rotas explicitamente com o
guard de sessão, substituir token por `auth.use('web').login(user)`, normalizar
o perfil e remover signup, o teste focado passou. O middleware também encerra
uma sessão `web` quando o usuário deixa de estar `ACTIVE`:

```text
npm test -- --files tests/functional/auth.spec.ts
Tests 5 passed (5)
```

Foi feita uma verificação de mutação do contrato sem token: ao inserir
temporariamente `token: 'test-only-token'` na resposta de login, a primeira
prova falhou exatamente em `assert.notProperty(login.body().data, 'token')`.
O campo temporário foi removido antes da verificação final.

## Arquivos alterados

- `api/config/auth.ts`
- `api/start/routes.ts`
- `api/app/controllers/access_tokens_controller.ts`
- `api/app/controllers/profile_controller.ts`
- `api/app/middleware/auth_middleware.ts`
- `api/tests/bootstrap.ts`
- `api/tests/functional/auth.spec.ts`

## Verificação final

```text
cd api && npm test
Tests 7 passed (7)

cd api && npm run typecheck
exit 0

cd api && npm run lint
exit 0
```

## Notas

- O envelope global do projeto é `data`; por isso o contrato efetivo é
  `{ data: { user } }`, contendo o objeto público sem senha/hash/token.
- O cookie de sessão já é configurado como `httpOnly: true` em
  `api/config/session.ts`; o teste valida o atributo emitido pelo login.

## Fix round 1

Removido `api/app/controllers/new_account_controller.ts`, o controller órfão
que ainda continha a criação pública de usuários e emissão de access tokens.
Não houve mudança de escopo em rotas, Web ou documentos raiz.

Verificação após a remoção:

```text
cd api && npm test
Tests 7 passed (7)

cd api && npm run typecheck
exit 0

cd api && npm run lint
exit 0
```
