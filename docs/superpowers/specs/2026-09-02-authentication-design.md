# Autenticação e administrador inicial

## Objetivo

Implementar o fluxo completo de autenticação do portal: login e logout por
sessão em cookie HTTP-only, usuário atual restaurado pelo Web, rotas protegidas
para o portal e para a administração, e um seed idempotente do administrador
inicial. Não inclui gestão administrativa de usuários, cursos ou permissões de
conteúdo.

## Estratégia de sessão

A API AdonisJS usará o guard `web` de sessão já configurado. O login valida
credenciais e cria uma sessão; o cookie é emitido pelo backend e nunca é
devolvido como token à SPA. Logout encerra a sessão. O Web faz chamadas com
`credentials: 'include'` e não lê nem persiste tokens no navegador.

O CORS continuará limitado à origem configurada e permitirá credenciais. O
endpoint de perfil é a fonte de verdade para restauração de sessão no
carregamento inicial.

## Usuários e administrador inicial

A tabela `users` terá:

- `role`: `ADMIN` ou `STUDENT`;
- `status`: `ACTIVE` ou `BLOCKED`.

Somente usuários ativos podem iniciar e manter sessão. O seed do administrador
é idempotente e obtém nome, e-mail e senha exclusivamente de `ADMIN_NAME`,
`ADMIN_EMAIL` e `ADMIN_PASSWORD`. Ele cria o administrador quando não existir
e falha com uma mensagem clara caso as variáveis obrigatórias não estejam
definidas. Nenhuma credencial administrativa será versionada.

O endpoint público de signup do starter será removido. Usuários serão criados
em uma etapa administrativa futura.

## Contrato da API

```text
POST /api/v1/auth/login
  body: { email, password }
  sucesso: { user }
  efeito: cria sessão HTTP-only

POST /api/v1/account/logout
  requer sessão
  sucesso: { message }
  efeito: encerra sessão

GET /api/v1/account/profile
  requer sessão
  sucesso: { user }
```

O payload público de usuário contém id, nome, e-mail, role e status; nunca
inclui hash/senha. Falha de credenciais, usuário bloqueado e sessão ausente não
devem vazar detalhes sensíveis e devem receber respostas HTTP apropriadas.

## Web

O Web terá um `AuthProvider` que consulta o perfil com TanStack Query para
restaurar a sessão e expõe usuário, estado de carregamento, login e logout. O
cliente HTTP sempre inclui cookies e não armazena credenciais em
`localStorage`/`sessionStorage`.

As rotas iniciais são:

```text
/login             público; redireciona usuário autenticado
/app                layout protegido para usuário autenticado ativo
/admin              layout protegido para ADMIN
```

Os layouts protegidos fazem a verificação para experiência de navegação, mas
a API continua sendo responsável por toda autorização real. O logout invalida
o perfil em cache e redireciona para `/login`.

## Erros e segurança

- Login inválido e usuário bloqueado retornam uma mensagem genérica para não
  revelar se um e-mail existe.
- Sessão ausente retorna 401; papel insuficiente no Web impede a navegação,
  e endpoints administrativos futuros devem responder 403 na API.
- Cookies de desenvolvimento são configurados para o cenário HTTP local;
  produção exige cookies `secure` e configuração explícita de domínio/origem.
- Testes devem cobrir seed idempotente, login ativo/bloqueado, perfil/logout e
  guards/redirecionamentos do Web.

## Verificação

1. Migrações e seed criam o administrador sem duplicá-lo.
2. Login válido estabelece sessão e perfil é acessível após reload do Web.
3. Login inválido/bloqueado não estabelece sessão.
4. Logout invalida a sessão e as rotas protegidas redirecionam para login.
5. Usuário STUDENT não acessa `/admin`; ADMIN acessa `/admin` e `/app`.
6. API e Web passam lint, testes, typecheck e build.
