# Portal do aluno — desenho da Fase 7

## Objetivo

Entregar a jornada do aluno para descobrir cursos publicados, navegar por
módulos e materiais e abrir conteúdo autorizado no viewer protegido da Fase 6.
O Portal exibe a estrutura completa de um curso disponível, mas torna itens
sem `VIEW` claramente bloqueados e não clicáveis.

## Decisões aprovadas

- O Portal usa a navegação lista de cursos → página de curso → material.
- A home do aluno mostra somente cursos `PUBLISHED` nos quais o aluno possui
  ao menos um recurso com `VIEW` efetivo.
- A existência de uma regra no curso, módulo ou material pode tornar o curso
  visível no catálogo. Isso preserva permissões específicas de módulo/material.
- Em um curso disponível, aluno vê todos os módulos e materiais; os que não
  possuem `VIEW` ficam bloqueados com cadeado e não podem ser clicados.
- Itens autorizados mas ainda não processados ou com processamento falho são
  exibidos como indisponíveis, nunca como liberados.
- A API decide o acesso; estados e rotas do web são somente experiência de uso.

## Limites e invariantes de segurança

- As rotas de catálogo são exclusivas do aluno autenticado com sessão `web`.
- Todo cálculo de acesso chama exclusivamente `AccessControlService.resolve`;
  não haverá réplica de herança, validade ou default-deny no controlador/web.
- A API jamais devolve `storageKey`, URL MinIO, derivados privados, URL de
  download ou metadados administrativos de acesso.
- Um curso que não é `PUBLISHED` nunca é devolvido ao aluno, mesmo com uma
  regra `VIEW` ativa.
- A rota manual de um curso publicado que o aluno não pode alcançar devolve
  `404`, sem confirmar sua existência. Um curso `DRAFT`/`ARCHIVED` também
  devolve `404`.
- Um material bloqueado não recebe URL para viewer nem capacidade de download;
  os endpoints da Fase 6 continuam revalidando `VIEW`/`DOWNLOAD`.
- ADMIN não recebe uma exceção implícita: essas rotas usam a identidade
  autenticada e a mesma resolução de permissões. A navegação administrativa
  não as usa.

## API do catálogo do aluno

As rotas vivem em `/api/v1/student`, exigem autenticação `web` e retornam
envelopes existentes `{ data: ... }`.

### Lista de cursos

`GET /student/courses`

1. Busca somente cursos com `status = PUBLISHED` em ordem estável (mais
   recentes primeiro, depois ID).
2. Para cada curso, testa se há ao menos um recurso na árvore do curso cujo
   `VIEW` está efetivamente permitido para o usuário no instante UTC atual.
3. Retorna somente cursos alcançáveis, com dados seguros e `moduleCount`.

Contrato:

```ts
type StudentCourseSummary = {
  id: number
  title: string
  description: string | null
  moduleCount: number
}
```

Um curso é alcançável quando o próprio curso, algum módulo ou algum material
tem `VIEW = ALLOW` resolvido. Um `DENY` mais específico é respeitado: a árvore
é inspecionada por recurso, não por suposição de herança.

### Árvore de curso

`GET /student/courses/:id`

1. Localiza o curso publicado pelo ID válido.
2. Carrega módulos e materiais ordenados por `position`.
3. Resolve `VIEW` para curso, cada módulo e cada material no mesmo instante
   UTC da requisição.
4. Se nenhum recurso for permitido, responde `404`.
5. Caso contrário, devolve toda a estrutura com estados seguros.

Contrato:

```ts
type StudentCourseDetail = StudentCourseSummary & {
  modules: Array<{
    id: number
    title: string
    description: string | null
    availability: 'AVAILABLE' | 'LOCKED'
    materials: Array<{
      id: number
      title: string
      description: string | null
      type: 'PDF' | 'IMAGE' | 'ZIP'
      availability: 'AVAILABLE' | 'LOCKED' | 'UNAVAILABLE'
      unavailableReason?: 'PROCESSING' | 'FAILED'
    }>
  }>
}
```

`AVAILABLE` de módulo significa que o módulo ou algum material dele tem VIEW;
é uma indicação de percurso, não concede conteúdo por si só. Material é
`AVAILABLE` apenas com VIEW efetivo e `processingStatus = READY`. Sem VIEW,
material é `LOCKED`, mesmo se já estiver pronto. Com VIEW e status
`UPLOADING`/`PROCESSING`, é `UNAVAILABLE` com `PROCESSING`; com `FAILED`, é
`UNAVAILABLE` com `FAILED`. ZIP autorizado e pronto é `AVAILABLE`, pois seu
download poderá ser autorizado separadamente pela Fase 6, mas não há viewer
para ele nesta fase.

O catálogo não registra acesso em `access_logs`: abertura de material e
download continuam sendo os únicos momentos auditados pelos endpoints da
Fase 6.

## Serviços e serialização

Criar `StudentCatalogService` que recebe `AccessControlService`, encapsula
consulta de cursos/módulos/materiais e constrói os DTOs acima. Ele compartilha
um único `DateTime.utc()` por operação para evitar estados diferentes na borda
de validade. Controladores só extraem usuário, chamam o serviço e serializam
os DTOs.

Para impedir N+1 evitável, a consulta pré-carrega módulos/materiais ordenados;
a resolução de acesso pode continuar explícita por recurso no MVP para manter
o mesmo algoritmo central. Não haverá cache de servidor dos resultados por
usuário nesta fase.

## Web: rotas e componentes

Criar uma feature `features/student-catalog` com tipos, cliente da API e hooks
TanStack Query, separada da feature administrativa de cursos.

### Home `/app`

- Substitui o placeholder por saudação curta, título “Seus cursos” e cards
  shadcn para os cursos retornados.
- Card mostra título, descrição, número de módulos e botão/link “Abrir curso”.
- Mostra Skeleton durante carregamento, mensagem segura em falha e estado vazio
  quando o aluno não possui nenhum curso disponível.

### Detalhe `/app/courses/:courseId`

- Rota protegida sob `_app`, com parâmetro numérico validado.
- Breadcrumb “Portal / curso”, cabeçalho e descrição do curso.
- Módulos são Accordion shadcn, ordenados como na API. Módulo bloqueado recebe
  cadeado e texto de contexto, mas seus materiais continuam visíveis.
- Materiais usam ícones por tipo e Badge de estado. Um material `LOCKED` tem
  cadeado, texto “Conteúdo bloqueado”, `aria-disabled` e não monta Link,
  Button nem chamada de rede ao viewer.
- Material `UNAVAILABLE` exibe “Processando material” ou “Material
  indisponível”, sem ação clicável e sem expor erro interno.
- Material `AVAILABLE` navega para `/app/courses/:courseId/materials/:materialId`.

### Material `/app/courses/:courseId/materials/:materialId`

- Busca o manifesto pelo `ProtectedMaterialViewer` da Fase 6, que já protege
  cache entre sessões e revalida acesso no backend.
- Exibe breadcrumb de volta ao curso e o viewer. Material autorizado ZIP mostra
  o estado “sem visualização” existente; seu botão de download só aparece se
  o manifesto permitir `DOWNLOAD`.
- Se o ID não pertence ao curso selecionado, a rota não renderiza um conteúdo
  e devolve/representa estado não encontrado seguro. A API do viewer continua
  sendo autoridade para o material.

O layout existente `_app` mantém sidebar, área central de no máximo 1200px e
componentes shadcn. Nenhuma tela administrativa é modificada.

## Falhas, trocas de sessão e consistência

- `401` é tratado pelo fluxo de sessão já existente; a limpeza de catálogo
  segue a limpeza das queries de material protegido em logout, login, expiração
  ou troca de usuário, impedindo a exibição transitória de dados do aluno A ao
  aluno B.
- `404` no curso/material mostra estado de não encontrado sem detalhar se foi
  não publicado ou sem permissão.
- `403`/falha do viewer mostra estado genérico seguro e não transforma um item
  bloqueado em clicável.
- O frontend não decide acesso a partir de cache local. Cada recarga consulta
  os endpoints do aluno; o backend resolve validade no instante UTC.

## Testes e critério de aceite

### API

1. Student vê na lista somente cursos publicados que contêm um recurso com
   VIEW efetivo; DRAFT/ARCHIVED não aparecem com qualquer regra.
2. Acesso em COURSE, MODULE e MATERIAL torna o curso descobrível; DENY mais
   específico e regra expirada removem corretamente a disponibilidade.
3. Detalhe de curso devolve módulos/materiais completos com `AVAILABLE`,
   `LOCKED` e `UNAVAILABLE` corretos, sem campos privados.
4. Curso publicado sem nenhum VIEW e acesso manual a curso não publicado
   devolvem 404; sessão inválida/bloqueada é recusada.
5. Catálogo não cria access logs; abertura de viewer continua auditada na
   Fase 6.

### Web

1. Home renderiza cards, loading, erro e vazio com componentes shadcn.
2. Página de curso apresenta a hierarquia completa, mas bloqueados não têm
   link, botão ou evento de viewer; disponíveis têm a rota correta.
3. Estados de processamento/falha permanecem indisponíveis e seguros.
4. Rota de material usa o viewer existente e preserva o caminho de volta.
5. Troca de sessão remove queries do catálogo e não mostra informação do aluno
   anterior enquanto a nova consulta está pendente.
6. Typecheck, lint, build e suites API/web passam.

## Fora de escopo

- Edição administrativa de cursos, módulos, materiais ou permissões.
- Busca textual, favoritos, progresso, conclusão de curso e notificações.
- Tiles, watermark, lupa, fullscreen e touch avançado (Fase 8).
- Vídeo, streaming, certificados, pagamentos e funcionalidades LMS.
