# Task 2 — Relatório do projeto Web

## Status

Implementação concluída no diretório `web/`. Nenhum commit foi tentado, conforme instrução de que o repositório Git não é válido.

## Mudanças realizadas

- Criei uma SPA independente com Vite, React e TypeScript, com `package.json`, `package-lock.json` e `node_modules` próprios.
- Adicionei TanStack Router com roteamento baseado em arquivos (`src/routes/__root.tsx`, `src/routes/index.tsx`), o `router` e a árvore gerada `src/routeTree.gen.ts`.
- Adicionei `QueryClientProvider` e `RouterProvider` no ponto de entrada.
- Configurei Vite com React, o plugin do Router e Tailwind; também configurei o alias `@/*` no Vite e TypeScript.
- Configurei Tailwind 4 no CSS de entrada e shadcn em `components.json`, apontando UI para `src/components/ui` e CSS para `src/index.css`.
- Criei `.env.example` com `VITE_API_URL=http://localhost:3333/api/v1`.
- Implementei o cliente HTTP tipado `apiClient<T>(path, options)`: compõe a URL via `VITE_API_URL`, sempre envia `Accept: application/json`, preserva cabeçalhos fornecidos pelo chamador (incluindo `Authorization`) e lança `ApiError` para respostas HTTP não-OK.
- A página inicial é apenas o bootstrap solicitado e mostra a URL da API exclusivamente em desenvolvimento. Não foram adicionadas telas/rotas de domínio nem acesso a `localStorage` ou `sessionStorage`.
- Incluí Vitest e um script `test` para cobrir o comportamento manual do cliente HTTP.

## Evidência TDD

O comportamento que o teste protege é a quebra de composição de URL/cabeçalhos de autenticação e a ausência de conversão de erro HTTP em `ApiError`.

1. RED: criei `src/lib/api-client.test.ts` antes de `src/lib/api-client.ts` e executei `npm test -- src/lib/api-client.test.ts`.
   - Resultado esperado: falha por não encontrar `./api-client` (exit code 1), comprovando que o contrato ainda não existia.
2. GREEN: implementei o menor cliente compatível com o contrato e executei o mesmo teste.
   - Resultado: `1` arquivo e `2` testes aprovados (exit code 0).
3. Após pequenos ajustes estritos do TypeScript 6, a execução final de `npm test` continuou com `1` arquivo e `2` testes aprovados.

## Comandos e resultados

| Comando | Resultado |
| --- | --- |
| `npm create vite@latest web -- --template react-ts` | sucesso (scaffold criado) |
| `npm install @tanstack/react-query @tanstack/react-router @tanstack/router-plugin` | sucesso |
| `npm install -D tailwindcss @tailwindcss/vite shadcn@latest vitest` | sucesso |
| `npm test -- src/lib/api-client.test.ts` antes da implementação | falhou como esperado: módulo do cliente inexistente |
| `npm test` | exit code 0; 1 arquivo, 2 testes aprovados |
| `npm run typecheck` | exit code 0 |
| `npm run build` | exit code 0; build Vite concluído |
| `npm run lint` | exit code 0; sem avisos |
| `rg -n "localStorage|sessionStorage" src` | nenhuma ocorrência |

## Auto-revisão

- O contrato público pedido (`apiClient(path, options): Promise<T>`) está exportado e possui teste para sucesso e resposta HTTP não-OK.
- O token não é persistido nem lido: somente cabeçalhos informados pelo chamador são encaminhados.
- `VITE_API_URL` é o único contrato Web→API, documentado no arquivo de exemplo e usado no cliente e no diagnóstico da rota inicial.
- Router, Query, Tailwind e a configuração shadcn estão conectados no app, sem dependência de workspaces ou da API.
- A árvore de rotas foi gerada pelo plugin TanStack e é necessária para que o `router` seja typecheckável em processos independentes.

## Preocupações conhecidas

- O cliente assume resposta JSON nos casos de sucesso, que é o contrato atual previsto pela API. Se futuramente houver endpoints `204 No Content` ou binários, o contrato deve ser estendido explicitamente.

## Fix round 1

- Atualizei `web/.gitignore` para ignorar `.env` e `.env.*`, com a exceção explícita `!.env.example`; configurações locais deixam de poder ser adicionadas por engano, enquanto o template continua versionável.
- Validação executada em um repositório Git temporário (o workspace não possui `.git` válido): `git check-ignore -q .env` retornou `0` e `git check-ignore -q .env.example` retornou `1`. O comando de asserção terminou com exit code `0` e produziu: `ignored .env exit=0; tracked template exit=1`.
