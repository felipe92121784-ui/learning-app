# Task 2 — AdminLayout

## Status

Concluída. O escopo ficou restrito à Task 2 de
`docs/superpowers/plans/2026-09-04-application-layouts.md`.

Não foram alterados:

- `web/src/routes/_app.tsx` ou qualquer layout STUDENT;
- autorização, guards ou arquivos da API;
- a assinatura pública da fundação criada na Task 1.

O workspace não contém metadados válidos de Git, portanto nenhum commit foi
criado, conforme solicitado.

## Implementação

### Navegação administrativa

Criado `web/src/features/layout/admin-navigation.ts` com os únicos destinos
ADMIN atualmente implementados:

- `Visão geral` → `/admin` (correspondência exata);
- `Usuários` → `/admin/users`.

Nenhum destino do portal do aluno é fornecido ao `AppSidebar`.

### Shell em produção

`web/src/routes/_admin.tsx` agora monta diretamente a fundação compartilhada
`AppSidebar`, resolvendo o apontamento de que ela ainda não era consumida por
um layout real. O `beforeLoad`, `profileQueryOptions` e
`requireAdminUser(user, location.href)` foram preservados.

O AdminLayout agora inclui:

- sidebar recolhível no desktop;
- trigger no cabeçalho que abre o `Sheet` no mobile;
- cabeçalho responsivo com contexto da área administrativa;
- avatar e menu de conta com nome/e-mail do administrador;
- logout com retorno para `/login` por navegação com `replace`;
- alerta acessível quando o logout falha, mantendo o usuário em `/admin`.

## TDD — evidência RED → GREEN

Criado `web/src/routes/-_admin.test.tsx`, ignorado corretamente pelo gerador de
rotas por seu prefixo `-`.

### Isolamento da navegação

O primeiro RED encontrou o shell legado com `Portal`, `Conta` e
`Administração`, e falhou pela ausência de `Visão geral`. Depois da integração
do `AppSidebar`, passou confirmando `Visão geral`/`Usuários` e a ausência dos
links STUDENT.

### Conta e logout

Foram observados ciclos RED separados para:

1. ausência do gatilho/menu da conta;
2. seleção de `Sair` sem alteração de `/admin` para `/login`;
3. falha de logout sem alerta e com rejeição não tratada.

Os GREENs finais verificam a identidade no menu, logout real via provider,
navegação para login e erro anunciado com `role="alert"`.

### Responsividade e guards

O teste de integração mobile abre o `Sheet` a partir do header e confirma que
ele contém somente a navegação ADMIN. O teste existente de rotas de usuários
também foi executado e confirmou tanto o acesso de ADMIN a `/admin/users`
quanto o redirecionamento herdado de STUDENT para `/app`.

## Verificação final

Executada a partir de `web/`:

| Comando | Resultado |
| --- | --- |
| `npm test -- src/routes/-_admin.test.tsx src/routes/_admin/admin/users/-users-routes.test.tsx` | exit 0; 2 arquivos e 8 testes aprovados |
| `npm test` | exit 0; 15 arquivos e 50 testes aprovados |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0; sem warnings |
| `npm run build` | exit 0; 2.211 módulos transformados |

