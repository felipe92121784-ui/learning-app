# Final fix — layouts administrativo e do aluno

## Status

Concluído dentro do escopo Web aprovado. O `Sheet` mobile agora fecha após a
seleção de um destino, e os estilos citados na revisão final usam primitivas e
variantes shadcn com tokens semânticos. Nenhum arquivo da API, rota fora do
shell autenticado ou configuração de autorização foi alterado. Nenhum commit
foi criado.

## Correções

### Fechamento da navegação mobile

A causa raiz estava em `NavigationItems`: o link atualizava a rota, mas o
estado `openMobile` do `SidebarProvider` não era atualizado. Cada `Link`
continua sendo um link nativo e agora fecha esse estado durante a ativação. O
diálogo do `Sheet` sai da árvore e o trigger volta a ser exposto com o nome
acessível `Abrir navegação`.

O fixture do teste passou a incluir o destino real `/admin`, permitindo
verificar em conjunto que a rota muda e que o diálogo fecha.

### Primitivas e tokens semânticos

- A marca customizada da sidebar foi substituída por `Avatar`,
  `AvatarFallback` e `CardTitle`.
- Os títulos e subtítulos dos headers ADMIN/STUDENT usam `CardTitle` e
  `CardDescription`; as classes restantes nesses consumidores tratam apenas
  de layout, espaçamento, truncamento e responsividade.
- Os avisos de erro de logout usam `Alert`/`AlertDescription` com a variante
  `destructive`. A nova apresentação `banner` concentra borda e formato na
  variante da primitiva em vez de no layout consumidor.
- `index.css` agora declara e mapeia os tokens base do shadcn (`background`,
  `foreground`, `card`, `muted`, `primary`, `destructive`, `border`, `input`,
  `ring` e relacionados), inclusive para modo escuro. O `body` usa
  `bg-background` e `text-foreground` em vez de cores Slate literais.
- O build final confirmou a geração das utilities semânticas usadas, incluindo
  `bg-background`, `bg-card`, `bg-muted`, `bg-primary`, `border-border`,
  `text-destructive` e `text-muted-foreground`.

As rotas de login, usuários e conta não foram refatoradas neste wave, conforme
o limite explícito da revisão final.

## TDD — RED → GREEN

Mudança de produção que o teste protege: remover a chamada que fecha
`openMobile` deve permitir a navegação, mas deixar o diálogo do `Sheet` aberto.

### RED

```text
npm test -- src/components/layout/app-sidebar.test.tsx
```

Resultado antes da correção: exit 1; 4 testes aprovados e 1 falhou. A rota já
era `/admin`, mas `queryByRole('dialog')` ainda devolvia o diálogo aberto.

### GREEN

O mesmo comando após a correção terminou com exit 0: 1 arquivo e 5 testes
aprovados.

Verificação focada adicional:

```text
npm test -- src/components/layout/app-sidebar.test.tsx src/routes/-_admin.test.tsx src/routes/-_app.test.tsx
```

Resultado: exit 0; 3 arquivos e 15 testes aprovados.

## Arquivos alterados

- `web/src/components/layout/app-sidebar.tsx`
- `web/src/components/layout/app-sidebar.test.tsx`
- `web/src/components/ui/alert.tsx`
- `web/src/routes/_admin.tsx`
- `web/src/routes/_app.tsx`
- `web/src/index.css`
- `.superpowers/sdd/2026-09-04-application-layouts/final-fix-report.md`

## Verificação final

Executada a partir de `web/` após todas as alterações de produção:

| Comando | Resultado |
| --- | --- |
| `npm test` | exit 0; 16 arquivos e 57 testes aprovados |
| `npm run typecheck` | exit 0; sem diagnósticos |
| `npm run lint` | exit 0; sem erros ou warnings |
| `npm run build` | exit 0; 2.212 módulos transformados |

