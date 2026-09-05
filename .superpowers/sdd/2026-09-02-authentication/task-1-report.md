# Task 1 — Usuário, roles/status e seed ADMIN

## Resultado

Implementados os campos `role` e `status` do usuário, o seed ADMIN idempotente e a serialização pública desses campos. Não foram alterados controllers, rotas, sessão ou Web.

## TDD

### RED

1. Criado `api/tests/unit/admin_seeder.spec.ts` antes do código de produção.
2. Executado `cd api && npm test -- --files tests/unit/admin_seeder.spec.ts`.
3. Com o banco de testes disponível, os dois testes falharam pelo motivo esperado: `Cannot find module .../database/seeders/admin_seeder.js`.

O primeiro uso do comando literal do plano (`npm test tests/unit/admin_seeder.spec.ts`) foi interpretado pelo Japa como nome de suite. O filtro correto desta configuração é `--files`.

### GREEN

Após adicionar a migração, os tipos/colunas, o seeder e as variáveis de ambiente:

```text
cd api && npm test -- --files tests/unit/admin_seeder.spec.ts
Tests  2 passed (2)

cd api && npm run typecheck
exit 0

cd api && npm run lint
exit 0
```

Também foi executado `node ace migration:run` com as variáveis locais equivalentes a `api/.env.example`; as três migrações foram aplicadas e `api/database/schema.ts` foi regenerado.

## Testes adicionados

- Executar `AdminSeeder` duas vezes cria exatamente um usuário para o e-mail configurado, com `ADMIN`/`ACTIVE` e senha validamente hashada.
- Configuração ADMIN sem senha rejeita com `ADMIN_PASSWORD must be defined`.

## Arquivos alterados

- `api/database/migrations/1788398294467_add_role_and_status_to_users_table.ts`
- `api/database/seeders/admin_seeder.ts`
- `api/database/schema.ts`
- `api/app/models/user.ts`
- `api/app/transformers/user_transformer.ts`
- `api/start/env.ts`
- `api/.env.example`
- `api/.env.test`
- `api/.env.docker.example`
- `.env.example`
- `api/tests/unit/admin_seeder.spec.ts`

## Preocupações e notas

- As variáveis `ADMIN_*` são opcionais no carregamento da aplicação para que somente o seed falhe claramente quando faltarem. O seeder exige as três e não possui credenciais padrão.
- O PostgreSQL local não estava em execução. Para a verificação, foi iniciado somente o serviço `postgres`; o volume existente não continha o usuário/banco de testes, então foram criados `ideal_learning_test` e `ideal_learning_test` localmente com os valores já definidos no Compose. Nenhum dado de produção foi usado.
- Não houve commit, conforme solicitado; este diretório não é um repositório Git válido.
