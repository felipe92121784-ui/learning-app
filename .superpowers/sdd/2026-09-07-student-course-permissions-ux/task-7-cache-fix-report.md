# Task 7 — Atualizar lista após associação removida

## Resultado

Corrigido o fluxo de `409` no modal de cursos e permissões. O handler agora:

- remove imediatamente o curso ausente da query `student-course-associations/list/:studentId`;
- invalida a mesma query para refazer a leitura no servidor;
- mantém o curso oculto da lista renderizada durante a atualização;
- fecha a configuração e exibe a mensagem de associação removida.

O caminho de associação ausente detectada antes da mutation também aguarda o handler assíncrono. Nenhuma alteração de API foi feita.

## Teste adicionado

`student-course-permissions-dialog.test.tsx` verifica que uma mutation com `409` remove o card `Fundamentos de redes` e deixa a entrada da query correta vazia.

## Verificação

- `npm test -- --run src/features/access-rules/student-course-permissions-dialog.test.tsx` — 12 testes passaram
- `npm run typecheck` — passou
- `npm run lint` — passou
- `git diff --check` — passou
