# Task 1 — Primitivas shadcn e fundação de navegação

## Status

Concluída. O escopo ficou restrito à Task 1 de
`docs/superpowers/plans/2026-09-04-application-layouts.md`.

Não foram alterados:

- `web/src/routes/_admin.tsx`;
- `web/src/routes/_app.tsx`;
- `web/src/features/auth/authenticated-shell.tsx`;
- guards, autenticação ou qualquer arquivo da API.

Os layouts completos de ADMIN e STUDENT permanecem para as Tasks 2 e 3.

## Implementação

### Fundação compartilhada

Criados:

- `web/src/components/layout/app-sidebar.tsx`;
- `web/src/components/layout/app-sidebar.test.tsx`.

`AppSidebar` fornece:

- itens de navegação tipados por `AppSidebarNavItem`;
- destinos restritos a rotas estáticas geradas pelo TanStack Router por
  `AppSidebarRoute`;
- recolhimento desktop controlado pelas props `collapsed` e
  `onCollapsedChange`;
- renderização mobile no `Sheet` usado internamente pela sidebar oficial;
- `AppSidebarTrigger` com nomes acessíveis contextuais: abrir/fechar no mobile
  e recolher/expandir no desktop;
- correspondência ativa exata ou por prefixo, incluindo `aria-current="page"`;
- tooltips para preservar o nome dos itens quando a sidebar está recolhida;
- slot opcional de rodapé e conteúdo principal dentro de `SidebarInset`.

### Primitivas oficiais shadcn/ui

Adicionadas pelo CLI oficial:

- `web/src/components/ui/sidebar.tsx`;
- `web/src/components/ui/sheet.tsx`;
- `web/src/components/ui/avatar.tsx`;
- `web/src/components/ui/dropdown-menu.tsx`;
- `web/src/components/ui/separator.tsx`;
- `web/src/components/ui/tooltip.tsx`.

Dependências internas exigidas pela sidebar:

- `web/src/components/ui/skeleton.tsx`;
- `web/src/hooks/use-mobile.ts`.

O CLI também atualizou as versões oficiais locais de `button.tsx` e
`input.tsx` e acrescentou os tokens de sidebar em `web/src/index.css`.
Diretivas pontuais do oxlint foram mantidas nos arquivos gerados para aceitar
os padrões oficiais de Fast Refresh, efeito responsivo e skeleton randômico
sem warnings.

`web/tsconfig.json` passou a declarar o alias `@/*` também no config raiz. Isso
permite que o CLI resolva corretamente os destinos já definidos em
`tsconfig.app.json`. Uma primeira geração incorreta em `web/@` foi removida, e
o pacote transitório indevido `cn` foi desinstalado; não restaram imports ou
dependências com esse nome.

## TDD — evidência RED → GREEN

### RED

Comando:

```text
npm test -- src/components/layout/app-sidebar.test.tsx
```

Resultado inicial: exit code 1. O Vitest falhou ao resolver
`./app-sidebar`, exatamente porque a fundação compartilhada ainda não existia.

### GREEN

O teste focado cobre três comportamentos reais:

1. o trigger muda o estado controlado de expandido para recolhido no desktop;
2. o trigger mobile abre um `Sheet` que contém a navegação;
3. o item prefixado mais específico recebe `aria-current="page"`, enquanto um
   item configurado como exato não é marcado em uma rota descendente.

Comando final:

```text
npm test -- src/components/layout/app-sidebar.test.tsx
```

Resultado: exit code 0, 1 arquivo e 3 testes aprovados.

## Verificação final

Executada a partir de `web/`:

| Comando | Resultado |
| --- | --- |
| `npm test` | exit 0; 14 arquivos e 45 testes aprovados |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0; sem warnings |
| `npm run build` | exit 0; 2.201 módulos transformados |

## Observações de entrega

- O diretório informado não é um repositório Git (`fatal: not a git
  repository`), portanto nenhum commit foi criado, conforme solicitado.
- A API pública do servidor não foi alterada.
- A integração da fundação nas rotas e as configurações específicas de
  navegação pertencem às Tasks 2 e 3 e não foram antecipadas.
