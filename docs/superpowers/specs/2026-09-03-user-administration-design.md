# Fase 1: administração de usuários

## Escopo

Permitir que administradores criem, consultem, editem, ativem e bloqueiem
alunos. Cada aluno recebe uma senha inicial definida pelo administrador e pode
trocar apenas a própria senha na página de conta. Convites por e-mail,
recuperação de senha e gestão de múltiplos administradores ficam fora desta
fase.

## API

Rotas administrativas exigem sessão e `role === ADMIN`:

```text
GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/:id
PATCH  /api/v1/users/:id
PATCH  /api/v1/users/:id/status
```

`POST /users` recebe `fullName`, `email`, `password` e cria sempre um
`STUDENT` ativo. Atualização administrativa altera nome/e-mail, mas nunca
papel ou senha diretamente. Status aceita somente `ACTIVE` e `BLOCKED`.

```text
PATCH /api/v1/account/password
```

Exige sessão, senha atual e nova senha com confirmação. A senha é alterada
somente para o usuário autenticado.

Usuários bloqueados não iniciam sessão; requisições autenticadas também
revalidam o status do usuário para que bloqueio revogue o uso das sessões já
existentes. Todas as respostas públicas usam o transformer de usuário, sem
hash de senha.

## Web

```text
/admin/users
/admin/users/new
/admin/users/:userId
/app/account
```

As páginas administrativas usam as proteções de rota existentes. O Web usa
TanStack Query para listagem/mutations/invalidação. Toda UI usa shadcn/ui como
padrão: `Button`, `Input`, `Label`, `Card`, `Table`, `Badge`, `Dialog`,
`Select`, `Alert` e `Form` quando apropriados; Tailwind serve apenas para
layout e composição.

## Verificação

1. Apenas ADMIN gerencia usuários; STUDENT recebe 403.
2. Criar aluno armazena senha com hash e não cria outro admin.
3. Email duplicado e dados inválidos retornam validação consistente.
4. Bloqueio impede novo login e invalida requisições de sessão existentes.
5. Usuário troca a própria senha somente com a senha atual correta.
6. Telas Web usam componentes shadcn e refletem loading/erro das mutations.
