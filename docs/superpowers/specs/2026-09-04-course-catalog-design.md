# Catálogo administrativo de cursos — Design

## Objetivo

Permitir que administradores organizem a estrutura inicial `Course → Module`
sem disponibilizar o catálogo para alunos nem introduzir arquivos, materiais
ou regras de acesso.

## Escopo

### Course

Um curso possui `id`, `title`, `description`, `status`, timestamps e módulos.
Os status válidos são `DRAFT`, `PUBLISHED` e `ARCHIVED`.

- Criar e editar curso.
- Listar e abrir um curso administrativo.
- Alterar status, inclusive arquivar, sem exclusão física nesta fase.
- `cover_storage_key` fica para a Fase 3, quando houver storage privado.

### Module

Um módulo possui `id`, `courseId`, `title`, `description`, `position` e
timestamps.

- Criar, editar e excluir módulos de um curso.
- Reordenar módulos com ações "mover para cima" e "mover para baixo".
- A ordenação é persistida pelo servidor e sempre retornada por `position ASC`.
- A exclusão somente é permitida nesta fase porque ainda não existem materiais.

## API

Todas as rotas ficam sob `/api/v1`, requerem sessão `web` e middleware
`admin`.

| Método | Rota | Responsabilidade |
| --- | --- | --- |
| GET | `/courses` | Listar cursos por criação decrescente. |
| POST | `/courses` | Criar curso em `DRAFT`. |
| GET | `/courses/:id` | Retornar curso e seus módulos ordenados. |
| PATCH | `/courses/:id` | Atualizar título, descrição ou status. |
| POST | `/courses/:courseId/modules` | Criar módulo ao final da lista. |
| PATCH | `/courses/:courseId/modules/:id` | Atualizar título ou descrição do módulo. |
| DELETE | `/courses/:courseId/modules/:id` | Excluir módulo e compactar posições restantes. |
| PUT | `/courses/:courseId/modules/order` | Persistir uma lista completa e válida de IDs de módulos. |

As entradas recebem validação Vine: títulos de 2 a 160 caracteres;
descrições opcionais até 2.000 caracteres; status somente do enum; e a
reordenação deve conter exatamente os IDs dos módulos daquele curso, sem
duplicatas. Registros fora do curso retornam 404, e entrada inválida usa a
resposta de validação padrão da API.

## Persistência

Uma migration cria `courses` e outra cria `modules`, com FK `modules.course_id`
para `courses.id` e exclusão em cascata. `position` é inteiro não negativo;
criação usa o próximo índice e remoção/reordenação ocorre dentro de transação
para não deixar posições intermediárias ou duplicadas.

Os modelos Lucid representam as relações `Course.modules` e `Module.course`.
Transformers retornam somente campos públicos, em `camelCase`, seguindo o
envelope JSON existente.

## Interface administrativa

O menu ganha "Cursos". As três telas são:

1. Lista de cursos com status, descrição resumida e ação para criar/editar.
2. Formulário de novo curso.
3. Detalhe/edição do curso, com formulário do curso e painel de módulos
   ordenados, criação, edição, exclusão e botões de ordenação.

As telas usam componentes shadcn existentes e TanStack Query para cache,
carregamento, erros e invalidação após mutações. Não há rota de aluno,
consulta pública, nem links de catálogo no shell do aluno.

## Segurança e limites

- O frontend não é a autoridade: todas as rotas de catálogo requerem admin.
- Curso arquivado continua gerenciável pelo admin e não é apagado.
- Não há upload, capa, material, permissão ou acesso de aluno nesta fase.

## Verificação

Testes da API cobrem autenticação/admin, CRUD de curso, criação ao fim,
edição, exclusão e reordenação válida/inválida de módulos. Testes web cobrem
contratos HTTP, queries/mutações, telas e navegação. A entrega exige testes,
typecheck, lint e build de API e web.
