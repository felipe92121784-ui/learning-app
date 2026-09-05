# Task 3 — StudentLayout

## Status

Concluída. O escopo ficou restrito à Task 3 de
`docs/superpowers/plans/2026-09-04-application-layouts.md`.

Não foram alterados:

- `web/src/routes/_admin.tsx` ou a navegação ADMIN;
- autorização, guards ou arquivos da API;
- a assinatura pública da fundação `AppSidebar` criada na Task 1.

O workspace não contém metadados válidos de Git, portanto nenhum commit foi
criado, conforme solicitado.

## Implementação

### Navegação do aluno

Criado `web/src/features/layout/student-navigation.ts` com exatamente os dois
destinos solicitados:

- `Portal` → `/app` (correspondência exata);
- `Conta` → `/app/account`.

Nenhum destino ou ação de administração é fornecido ao `AppSidebar`.

### Shell em produção

`web/src/routes/_app.tsx` agora monta diretamente a fundação compartilhada
`AppSidebar`. O `beforeLoad`, `profileQueryOptions()` e
`requireActiveUser(user, location.href)` foram preservados.

O StudentLayout inclui:

- sidebar recolhível no desktop;
- trigger no cabeçalho que abre o `Sheet` no mobile;
- correspondência ativa baseada no pathname atual, sem marcar `Portal` em
  `/app/account`;
- cabeçalho responsivo da área do aluno;
- avatar e menu de conta com nome/e-mail;
- logout pelo provider de autenticação, seguido de navegação com `replace`
  para `/login`;
- alerta acessível caso o logout falhe.

O teste preexistente do formulário de senha passou a fornecer o stub de
`matchMedia` requerido pelo novo shell responsivo em jsdom. Essa alteração é
apenas de infraestrutura de teste e não muda comportamento de produção.

## TDD — evidência RED → GREEN

Criado `web/src/routes/-_app.test.tsx`, ignorado pelo gerador de rotas por seu
prefixo `-`.

### RED

Comando:

```text
npm test -- src/routes/-_app.test.tsx
```

Resultado inicial: exit code 1; 1 teste aprovado e 3 falharam pelos motivos
esperados:

1. `Portal` também recebia `aria-current="page"` em `/app/account`;
2. o shell legado não oferecia o trigger mobile `Abrir navegação`;
3. a conta não era exposta pelo menu de cabeçalho do novo layout.

### GREEN

O mesmo comando terminou com exit code 0, 1 arquivo e 4 testes aprovados. A
cobertura confirma:

1. somente `Portal` e `Conta`, com os destinos corretos e sem links ADMIN;
2. estado ativo exclusivo de `Conta` em `/app/account`;
3. abertura do `Sheet` mobile contendo apenas navegação STUDENT;
4. logout disponível no menu de conta e retorno real para `/login`.

Na primeira suíte completa, os três testes existentes do formulário de senha
reproduziram a ausência de `window.matchMedia` no jsdom. Após adequar somente o
setup desse teste ao requisito responsivo do novo shell, o comando focado
`npm test -- src/features/account/account-password-form.test.tsx` terminou com
exit code 0 e 3 testes aprovados.

## Guards e rotas

A suíte existente `web/src/router.test.ts` continua verificando que:

- uma visita anônima a `/app` redireciona para `/login` com return path;
- `/app/account` herda o mesmo guard;
- um usuário ativo consegue carregar `/app/account`.

Esses testes fizeram parte da verificação Web completa abaixo.

## Verificação final

Executada a partir de `web/`:

| Comando | Resultado |
| --- | --- |
| `npm test -- src/routes/-_app.test.tsx` | exit 0; 1 arquivo e 4 testes aprovados |
| `npm test -- src/features/account/account-password-form.test.tsx` | exit 0; 1 arquivo e 3 testes aprovados |
| `npm test` | exit 0; 16 arquivos e 54 testes aprovados |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0; sem warnings |
| `npm run build` | exit 0; 2.211 módulos transformados |
