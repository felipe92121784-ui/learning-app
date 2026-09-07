# Fase 8 — Visualização protegida avançada de imagens

**Data:** 2026-09-07  
**Status:** aprovado para especificação; aguarda revisão do documento e plano executável

## Objetivo

Permitir a consulta fluida e protegida de imagens técnicas grandes, sem tornar
originais ou derivados públicos. A fase introduz pirâmide multi-resolução para
imagens grandes, watermark dinâmica por aluno, controles avançados de consulta
e validações de segurança e operação.

O resultado atende às seções 26 a 31 do `PROJECT_SPEC.MD`: conteúdo privado,
autorização no backend, derivados/tiles, watermark incorporada ao conteúdo
entregue e uma experiência adequada para desktop e touch.

## Decisões confirmadas

- A watermark contém `nome completo · e-mail · data/hora UTC`, repetida na
  diagonal.
- A watermark é aplicada durante a entrega da visualização, dentro dos bytes
  da imagem; um overlay HTML pode complementar a UX, mas nunca é a proteção
  principal.
- A watermark cobre páginas rasterizadas de PDF, previews de imagens e tiles.
- O download já autorizado continua fornecendo o original sem watermark. Esta
  fase não cria cópias de download por aluno.
- Imagens cujo maior lado for maior que **4.096 px** usam tiles; até esse
  limite permanecem no preview WebP existente.
- O limiar e o tamanho de tile serão configurações de ambiente. Os valores
  iniciais são `IMAGE_TILE_THRESHOLD_PX=4096` e `IMAGE_TILE_SIZE=256`.
- A solução de visualização é OpenSeadragon encapsulado em componente React,
  com fonte privada de tiles. Não será criada manualmente uma engine de
  pirâmide, gestos e viewport.

## Escopo

Inclui:

- Pirâmide de tiles WebP para imagens grandes.
- Manifesto privado da imagem em tiles.
- Watermark dinâmica e incorporada para todo derivado visualizado.
- OpenSeadragon, zoom, pan, toque/pinch, fullscreen, fit, reset e lupa.
- Proteções de cache e auditoria sem explosão de linhas de log por tile.
- Testes automatizados e roteiro UAT com materiais reais.

Não inclui:

- Watermark no arquivo original baixado com permissão.
- OCR, vídeo, streaming, edição de imagem, anotações ou progresso de curso.
- Painel administrativo para editar limiar/tamanho de tile. A configuração é
  de ambiente nesta fase.
- Tiles para PDF. PDFs continuam em páginas rasterizadas; essas páginas passam
  a receber watermark no serving.

## Arquitetura do processamento

### Tipos de saída

O pipeline atual gera um único `IMAGE_PREVIEW` para imagens e `PDF_PAGE` para
PDF. A fase acrescenta uma saída de imagem em tiles, sem alterar a origem
privada nem a fila de processamento existente.

Para uma imagem até o limiar, o worker preserva o fluxo atual:

```text
original privado → preview.webp privado → READY
```

Para uma imagem grande, o renderer lê o original em diretório de trabalho com
permissão restrita e produz, no mesmo run de processamento:

```text
original privado
  → imagem base / metadados
  → níveis da pirâmide (menor resolução até resolução original)
  → tiles WebP de 256 × 256 px
  → manifesto de tiles
  → objetos privados no prefixo do run
  → READY
```

Cada nível reduz a resolução pela metade em relação ao próximo. O manifesto
registra largura, altura, tamanho de tile, nível mínimo/máximo e a convenção de
endereçamento `nível/coluna/linha`. Ele não expõe storage keys do MinIO.

### Persistência e atomicidade

`MaterialDerivative` e/ou uma entidade de manifesto dedicada representarão a
saída publicada. A implementação escolherá um contrato explícito para
identificar a pirâmide e seus metadados, sem criar uma linha relacional para
cada tile quando isso não for necessário. As chaves de storage permanecem
internas e ficam associadas ao prefixo já utilizado para limpeza de runs.

O job só passa a `SUCCEEDED` e o material a `READY` quando todos os objetos e o
manifesto foram enviados. Em falha ou perda do lease, os objetos daquele run
entram no mecanismo de limpeza já existente e nenhum manifesto parcial fica
visível. Reprocessar uma imagem substitui a pirâmide anterior sob o mesmo
bloqueio transacional usado pelos derivados atuais.

## Entrega protegida e watermark

### Contrato HTTP

O endpoint de visualização continuará exigindo sessão `web` e a capacidade
`VIEW`. Para uma imagem grande, ele retorna um viewer do tipo `IMAGE_TILES`
com metadados seguros e uma URL de manifesto no domínio da API. As URLs de
manifesto e tiles carregam apenas IDs de recurso/posição; não carregam chave de
objeto, token reutilizável ou URL assinada do MinIO.

Toda leitura — manifesto, tile, página PDF e preview — executa a mesma decisão
de acesso no backend antes de recuperar o objeto privado. Acesso negado ou
sessão expirada devolve erro genérico e não enumera materiais, níveis ou
arquivos. O original permanece fora do fluxo de visualização.

### Watermark no serving

Após a autorização, a API compõe uma camada SVG/texto usando o nome completo,
e-mail e relógio UTC do pedido. Ela é repetida diagonalmente, com contraste
suficiente e transparência que mantenha leitura técnica razoável. A camada é
aplicada via processamento de imagem aos bytes enviados:

- cada tile de imagem grande;
- o preview de imagem pequena;
- cada página WebP derivada de PDF.

Assim, salvar bytes do viewer ou fazer captura preserva a identificação do
acesso. A API não persiste uma cópia integral por usuário. As respostas levam
`Cache-Control: no-store` e não recebem URL pública/temporária de objeto; o
browser pode manter apenas o necessário em memória durante a tela ativa.

Os downloads explicitamente autorizados permanecem no fluxo existente de URL
temporária do original, sem transformação nem watermark, conforme decisão do
produto. A permissão é verificada no instante de gerar esse download.

### Auditoria e observabilidade

Uma abertura bem-sucedida segue gerando um único `VIEW_MATERIAL`; um download
permitido, um `DOWNLOAD_MATERIAL`; e uma tentativa negada, `FAILED_ACCESS`.
Tiles não criam eventos individuais: isso multiplicaria o volume do log sem
melhorar a trilha de auditoria humana.

O job de processamento passa a expor internamente métricas de saída úteis à
operação (modo preview/tile, contagem de níveis/tiles e duração), sem responder
chaves privadas ou caminhos locais à UI. Erros seguem os códigos seguros de
processamento e entrega já adotados.

## Frontend

### Viewer de imagem

Um adaptador React encapsula a instância de OpenSeadragon. Ele recebe o
manifesto protegido e fornece uma fonte de tile que requisita a API usando a
sessão atual. Ao navegar para outro material, fazer logout ou receber sessão
expirada, a instância é destruída e não mantém referência ao manifesto/tile
anterior.

Imagens grandes usam esse adaptador. Imagens pequenas mantêm o viewer atual,
modernizado para apresentar os mesmos controles quando cabíveis. PDFs mantêm
as páginas atuais com watermark; a fase não transforma PDF em pirâmide.

### Controles e acessibilidade

A barra de controles reutiliza componentes shadcn e ícones do sistema:

- aumentar/diminuir zoom;
- ajustar à tela e redefinir;
- pan por mouse, teclado e arraste;
- roda do mouse e pinch-to-zoom;
- fullscreen;
- lupa circular momentânea, acionada por botão e ponteiro/toque.

Teclado e rótulos acessíveis permanecem disponíveis. A lupa amplia a região
indicada dentro da viewport já autorizada; ela não cria endpoint, derivado ou
cache independente.

Carregamento inicial, tile que falha e sessão expirada têm estados explícitos.
Uma falha transitória de tile pode fazer nova tentativa limitada. Falha de
autorização encerra a consulta com uma mensagem segura, em vez de continuar
tentando ou mostrar detalhes do recurso.

O React Query, localStorage, sessionStorage e rotas não armazenam manifesto,
tile ou URL de conteúdo protegido. O estado de controle pode existir em memória
enquanto a tela está montada.

## Fluxos essenciais

### Aluno autorizado abre imagem grande

1. O aluno navega a um material publicado ao qual possui `VIEW`.
2. A rota protegida pede a visualização; a API valida a capacidade, encontra o
   manifesto e registra `VIEW_MATERIAL` uma única vez.
3. OpenSeadragon busca somente os tiles visíveis para a resolução atual.
4. Cada tile passa por nova autorização, recebe watermark no serving e retorna
   `no-store`.
5. Zoom, pan, pinch, fullscreen e lupa manipulam apenas a viewport. Nenhum
   original é entregue.

### Permissão revogada durante a sessão

1. A autorização administrativa é removida.
2. O próximo manifesto/tile/página requisitado é negado no backend e auditado.
3. A UI abandona a visualização e informa indisponibilidade de forma genérica.
4. O browser não tem uma URL pública reutilizável para continuar carregando
   conteúdo.

### Imagem pequena e PDF

1. O viewer recebe os derivados privados já existentes.
2. Cada derivado passa pela mesma composição de watermark no endpoint.
3. O aluno pode usar os controles compatíveis sem que se crie uma pirâmide
   desnecessária.

## Erros e limites

- Material ausente, ainda processando ou sem derivados mantém os códigos
  seguros atuais (`MATERIAL_NOT_READY`/`DERIVATIVES_NOT_READY`).
- Manifesto ou tile ausente para material `READY` é tratado como erro de
  derivado, não como possibilidade de recuperar o original.
- Erro de processamento de watermark retorna falha genérica sem bytes brutos
  do derivado como fallback.
- A geração opera no diretório privado de trabalho e respeita o lease do job.
- As respostas de imagem não devem revelar storage key, prefixo do run ou
  informação de usuário diferente do solicitante.

## Estratégia de validação

### Backend

- Renderer: imagem abaixo/acima do limiar, níveis corretos, dimensões, bordas,
  manifesto, permissões do diretório e formato WebP.
- Processamento: publicação atômica, reprocessamento e limpeza de prefixo em
  falha/lease perdido.
- Entrega: manifesto/tile exige sessão e `VIEW`; permissão revogada é negada;
  URLs do MinIO não aparecem em payloads.
- Watermark: teste de composição verifica que o conteúdo retornado não é o
  objeto cru; cobre tile, preview e página PDF.
- Cache/auditoria: `no-store`, um evento de abertura por viewer e nenhum evento
  por tile; downloads continuam registrados separadamente.

### Frontend

- Adaptador cria/destrói corretamente OpenSeadragon e limpa estado ao trocar
  material ou sessão.
- Fonte privada monta URLs esperadas e lida com 401/403 sem reter conteúdo.
- Controles de zoom, fit, reset, fullscreen, lupa, teclado e estados de erro.
- Fluxos existentes de preview e PDF preservam disponibilidade, acessibilidade
  e componentes shadcn.

### UAT

Com uma imagem técnica acima de 4.096 px e um PDF real:

1. Validar que somente tiles visíveis são requisitados ao navegar e ampliar.
2. Conferir watermark diagonal com nome, e-mail e horário UTC em tile, preview
   e página PDF.
3. Validar pan, zoom, pinch, fullscreen, fit, reset e lupa em desktop/touch.
4. Revogar `VIEW` em outra sessão e confirmar que a próxima leitura falha.
5. Confirmar ausência de objeto público, URL do MinIO no payload e cache
   persistente de conteúdo.
6. Validar que download permitido baixa o original e gera seu registro, sem
   watermark.

## Critérios de aceite

- Imagens grandes são consultadas fluidamente por tiles privados de múltiplas
  resoluções.
- Todo conteúdo visualizado possui watermark personalizada incorporada.
- Nenhum original, objeto MinIO ou derivado bruto se torna URL pública.
- O aluno só recebe conteúdo enquanto possui `VIEW`.
- Viewer oferece zoom, pan, touch/pinch, fullscreen, fit, reset e lupa.
- A trilha auditável de abertura, negação e download permanece íntegra sem
  registrar uma linha por tile.
