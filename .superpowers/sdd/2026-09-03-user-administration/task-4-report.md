# Task 4 — Conta e integração

## Resultado

Implementada a página protegida `/app/account`, acessível pelo item **Conta**
da navegação autenticada. A página permite que qualquer usuário `ACTIVE`
altere somente a própria senha informando a senha atual, uma nova senha de 8 a
32 caracteres e a confirmação correspondente.

O formulário usa os componentes shadcn/ui `Card`, `Form`, `Input`, `Button` e
`Alert`, com React Hook Form, Zod e TanStack Query. A requisição usa o cliente
HTTP compartilhado, portanto inclui o cookie de sessão, e envia exatamente o
contrato existente da API para `PATCH /api/v1/account/password`. Sucesso limpa
os três campos e mostra confirmação; resposta `422` mostra feedback específico
sem expor a mensagem interna da API; outras falhas recebem mensagem genérica.

O `README.md` agora descreve criação, edição, bloqueio/reativação de alunos e a
troca de senha pelo próprio usuário. Nenhum arquivo da API foi modificado e
nenhum fluxo de convite, recuperação ou troca administrativa de senha foi
adicionado.

## TDD

### RED

Os testes foram escritos antes dos respectivos comportamentos e falharam pelas
lacunas esperadas:

- `router.test.ts`: o caminho `/app/account` era apenas um fuzzy match da rota
  `/app`; o último match era `/_app/app`, não uma página de conta registrada;
- `account-password-form.test.tsx`: os dois cenários iniciais falharam porque a
  página ainda não possuía o campo **Senha atual**;
- o teste de integração da navegação falhou porque não existia link **Conta**.

Evidência observada:

```text
cd web && npm test -- src/router.test.ts
Tests 1 failed | 5 passed
Expected routeId /_app/app_/account, received /_app/app

cd web && npm test -- src/features/account/account-password-form.test.tsx
Tests 2 failed (2)
Unable to find a label with the text of: Senha atual

cd web && npm test -- src/features/account/account-password-form.test.tsx
Tests 1 failed | 2 passed
Unable to find role="link" and name "Conta"
```

### GREEN

Depois das implementações mínimas, a execução focada encerrou com:

```text
cd web && npm test -- src/features/account/account-password-form.test.tsx src/router.test.ts
Test Files 2 passed (2)
Tests 9 passed (9)
```

Os testes exercitam a árvore e a página reais com o `AuthProvider`, o
`QueryClient` e o cliente HTTP de produção. Somente a fronteira de rede é
substituída. Eles cobrem guard anônimo, usuário ativo, descoberta pela
navegação, método/URL/headers/payload do PATCH, confirmação visual de sucesso e
feedback após `422` com ação reabilitada.

## Rota

O arquivo literal sugerido pelo plano, `routes/_app/account.tsx`, produziria
`/account`, pois `_app` é um layout pathless do TanStack Router. A implementação
usa `routes/_app/app_.account.tsx`: o sufixo `_` preserva `/app` no URL, mas
impede que a nova página seja filha visual de `app.tsx` (que não é um layout).
A árvore gerada confirma `fullPath: /app/account` e `parentRoute: AppRoute`,
herdando o `beforeLoad` autenticado de `_app`.

## Arquivos

Modificados:

- `README.md`
- `web/src/features/auth/authenticated-shell.tsx`
- `web/src/router.test.ts`
- `web/src/routeTree.gen.ts` (gerado pelo plugin do TanStack Router)

Criados:

- `web/src/features/account/account-password-api.ts`
- `web/src/features/account/account-password-form.tsx`
- `web/src/features/account/account-password-form.test.tsx`
- `web/src/routes/_app/app_.account.tsx`
- `.superpowers/sdd/2026-09-03-user-administration/task-4-report.md`

## Verificação completa

```text
cd api && npm test
Tests 21 passed (21)

cd api && npm run typecheck
exit 0

cd api && npm run lint
exit 0, sem warnings

cd api && npm run build
build completed, exit 0

cd web && npm test
Test Files 13 passed (13)
Tests 42 passed (42)

cd web && npm run typecheck
exit 0

cd web && npm run lint
exit 0, sem warnings

cd web && npm run build
2201 modules transformed, exit 0
```

O smoke automatizado de integração está incluído na suíte funcional completa
da API e comprovou:

- login de usuário bloqueado rejeitado com `401` genérico;
- sessão existente do aluno revogada na requisição seguinte ao bloqueio, sem
  afetar a sessão do ADMIN ativo;
- senha atual incorreta rejeitada sem alterar o hash;
- senha correta alterando somente o usuário autenticado;
- login antigo recebendo `401` e login com a nova senha recebendo `200`.

## Notas de ambiente

No sandbox, o runner Japa não conseguiu consultar interfaces de rede
(`uv_interface_addresses returned Unknown system error 1`) e encerrou com
código zero sem executar testes. A repetição autorizada fora do sandbox
inicializou o servidor efêmero e executou os 21 testes; somente essa execução é
contada como evidência válida.

Git não está disponível neste diretório (`fatal: not a git repository`) e a
execução foi explicitamente instruída a não criar commit ou subagentes. O
workspace compartilhado foi preservado.
