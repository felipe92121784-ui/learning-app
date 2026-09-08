# Detalhes do aluno e matrículas por período

## Objetivo

Substituir a gestão de cursos exclusivamente no modal da lista de usuários por uma página dedicada ao aluno. Ela reúne dados do perfil, cursos atribuídos, período de acesso e permissões, sem perder a configuração detalhada de curso, módulo e material.

## Experiência administrativa

### Entrada

- Na tabela de Usuários, a ação do aluno passa a ser `Ver detalhes`.
- A rota `/admin/users/$userId` deixa de ser apenas o editor simples e torna-se a página de detalhes do aluno. Edição de nome/e-mail continua disponível como uma ação secundária nessa página.
- Administradores não usam essa área de matrícula.

### Cabeçalho do aluno

Um card de perfil no topo contém:

- iniciais, nome e e-mail;
- status ativo/bloqueado;
- data de cadastro formatada em português do Brasil;
- total de cursos atribuídos, incluindo cursos agendados e expirados.

### Cursos

- Abaixo do card, a seção `Cursos do aluno` usa cards no estilo do portal do aluno, em grade responsiva de uma coluna no celular e duas colunas no desktop.
- Cada card mostra título, período (`início` e `término`), status de acesso (`Agendado`, `Ativo` ou `Encerrado`), permissão principal e `Gerenciar permissões`.
- `Gerenciar permissões` abre o componente existente de árvore curso → módulo → material, filtrado para aquele curso. O administrador pode alterar permissões e remover a matrícula, com confirmação.
- O botão `Adicionar curso` abre um modal focado, não a árvore de permissões.

### Modal de matrícula

- Pesquisa e seleção de um curso ainda não atribuído.
- Controle de permissão inicial: `Sem acesso`, `Leitura`, `Total`.
- Campos de data `Início` e `Término`.
- Valores iniciais: data local de hoje e a mesma data no ano seguinte.
- O término é inclusivo: uma data de término representa `23:59:59.999` no fuso `America/Sao_Paulo`; o início representa `00:00:00.000` no mesmo fuso.
- O administrador pode alterar ambas as datas antes de confirmar. A data final deve ser posterior ou igual à inicial no calendário.
- No celular, o modal ocupa a largura disponível; datas são empilhadas e ações ficam de fácil toque.

## Modelo de acesso

Não será criada uma nova tabela de matrícula. A associação do curso continua sendo o par de regras diretas `VIEW`/`DOWNLOAD` no recurso COURSE; isso preserva a fonte de verdade do controle de acesso.

- Na criação/atualização de associação, `startsAt` e `expiresAt` iguais são escritos no par de regras de curso.
- A associação existe enquanto suas regras diretas existirem, inclusive se estiver agendada ou encerrada. Somente remoção explícita apaga as regras do curso, módulos e materiais associados.
- O resolvedor de acesso existente continua ignorando regras fora da janela, portanto alunos não acessam cursos agendados nem encerrados.
- A listagem administrativa de associações deixa de descartar regras temporárias ao identificar a associação. Ela retorna a permissão gravada, `startsAt`, `expiresAt` e o status derivado do horário atual.
- Permissões de módulo/material permanecem exceções diretas; não carregam período próprio nesta entrega.

## Contratos de API

As rotas administrativas existentes de associações permanecem, com campos adicionais:

- `POST /users/:userId/courses/:courseId`: recebe `permission`, `startsAt`, `expiresAt`; cria a associação.
- `PUT /users/:userId/courses/:courseId`: recebe os mesmos campos; atualiza uma associação ainda existente e mantém a proteção contra reconstituição concorrente.
- `GET /users/:userId/courses`: retorna curso, permissão, `startsAt`, `expiresAt` e `status` (`SCHEDULED`, `ACTIVE`, `EXPIRED`).

O servidor valida datas ISO UTC, exige início anterior ao término e não aceita janelas inválidas. A conversão de data local para UTC ocorre no cliente de forma explícita antes da chamada.

## Componentes e arquivos previstos

- Serviço, validador, transformador e testes de associação de curso na API: período e status.
- Tipos, API client e queries de associações no web: novos campos e payload de matrícula.
- Página de detalhes do aluno, componentes de perfil, cards de cursos e modal de matrícula em `web/src/features/users/` e rota existente de usuário.
- Ação da tabela de usuários aponta para a página dedicada; o modal de lista deixa de ser a entrada principal.
- O componente de permissões atual será reutilizado como diálogo de um curso da página, evitando duplicar regras e controles.

## Estados e erros

- Carregamento independente para perfil, cursos e catálogo de cursos; erros exibem retry contextual.
- Não é possível adicionar curso duplicado, salvar data inválida ou modificar/remover associação inexistente.
- Após criar, alterar, remover ou receber conflito, as queries de associação e catálogo do aluno são invalidadas.
- Cursos agendados e encerrados continuam visíveis ao administrador, com status não ambíguo.

## Testes

- API: criação/atualização persiste período no par de regras; GET lista associações futuras/encerradas; status calculado corretamente; aluno não acessa curso fora da janela.
- Web: defaults hoje/+1 ano; conversão de datas; validação do intervalo; card mostra datas/status; rota restringe-se a aluno; ação da tabela navega para detalhe.
- Regressão: árvore de permissões, ZIP download-only e proteção contra ressuscitar associação removida continuam verdes.
