# Processamento protegido de PDF e imagem — Design

## Objetivo

Processar originais privados de materiais `PDF` e `IMAGE` em derivados WebP
privados, sem disponibilizar o original, URL de objeto, conteúdo binário,
chave de storage ou viewer nesta fase. O processamento é assíncrono e não
bloqueia a API de upload. Esta fase prepara o contrato que as Fases 5 e 6
usarão para autorização e entrega protegida.

## Escopo e decisões

- A fila é persistida no PostgreSQL; não será adicionado Redis.
- Um serviço Docker `worker` separado da API processa a fila.
- PDFs com até 300 páginas são convertidos em uma página WebP privada por
  página do PDF.
- Imagens recebem um único derivado WebP privado, limitado a uma resolução de
  consulta inicial. A estrutura admite tamanhos adicionais e tiles futuros.
- ZIP não recebe derivado nesta fase e permanece com status `PROCESSING`.
- Cada job pode ter até 3 tentativas. Ao esgotá-las, o material fica `FAILED`.
- O administrador enxerga somente estado e mensagem segura de falha; a Fase 6
  será responsável por viewer, endpoints de entrega e downloads autorizados.

## Persistência

### `processing_jobs`

Cada job representa o processamento de um material e possui:

```text
id
material_id
kind                    # PDF_RENDER | IMAGE_DERIVATIVE
status                  # PENDING | RUNNING | SUCCEEDED | FAILED
attempts
max_attempts            # 3
locked_at
lease_expires_at
last_error_code         # código seguro e finito
created_at
updated_at
```

Há no máximo um job ativo (`PENDING` ou `RUNNING`) por material. O worker
reivindica um job com transação e `FOR UPDATE SKIP LOCKED`; um lease expirado
permite recuperar jobs abandonados após interrupção do worker.

### `material_derivatives`

O registro de cada artefato gerado contém:

```text
id
material_id
kind                    # PDF_PAGE | IMAGE_PREVIEW
storage_key             # privado, não serializado
mime_type               # image/webp
page_number             # 1..N para PDF; nulo para imagem
width
height
position
created_at
updated_at
```

`storage_key` nunca é transformada, serializada ou recebida do navegador.
Existe uma restrição única por material/tipo/página para tornar reexecuções
idempotentes. O `Material.processingStatus` continua sendo a fonte de estado
administrativa: `PROCESSING`, `READY` ou `FAILED` nesta fase.

## Storage e processamento

O `StorageService` é estendido com operações privadas de leitura e listagem
necessárias ao worker, mantendo os controllers sem dependência do SDK S3.

1. A API grava o original em `originals/<uuid>` e, na mesma transação que cria
   o material, cria um job `PENDING` para PDF ou imagem.
2. O worker baixa o original para diretório temporário exclusivo de modo 0700,
   com arquivos 0600.
3. Para PDF, o Poppler contabiliza as páginas antes da conversão. Acima de 300,
   o job falha com `PDF_PAGE_LIMIT_EXCEEDED`, sem gerar derivados. Dentro do
   limite, cada página é renderizada e convertida para WebP.
4. Para imagem, Sharp gera um preview WebP com preservação de proporção e sem
   ampliar a imagem. A resolução inicial é limitada a 2560 px no maior lado.
5. O worker envia derivados para chaves internas
   `derivatives/<material-id>/<run-id>/...`, insere seus metadados e apenas
   então marca material e job como concluídos.

Nenhuma política pública, ACL pública ou URL assinada é criada. O worker remove
diretórios temporários e derivados parciais em falhas; a próxima tentativa usa
um novo `run-id`.

## Execução, falhas e recuperação

O worker executa o comando Adonis próprio em loop. Ele busca jobs pendentes ou
leases vencidos, processa um por vez por processo e aguarda brevemente quando a
fila está vazia. A operação é segura para mais de uma instância por causa do
bloqueio de linha e do lease.

Falhas transitórias (storage, processo externo, I/O) retornam o job a
`PENDING` enquanto houver tentativas. Falhas determinísticas (PDF acima de 300
páginas, original ausente ou entrada inválida) encerram em `FAILED`. Mensagens
persistidas e respostas administrativas usam somente códigos/mensagens
curtas seguras; logs internos podem conter a causa técnica sem retorná-la ao
cliente.

Se uma execução morre, o lease expira; outro worker retoma o job. Antes de
persistir o sucesso, a execução remove metadados/derivados de uma tentativa
anterior para aquele material, evitando duplicação. Exclusão de material deve
cancelar/remover seus jobs e derivados privados antes de apagar metadados.

## Docker e dependências

O Compose passa a incluir `worker`, construído a partir da API. A imagem instala
`poppler-utils` para PDFs e a dependência Node `sharp` para imagens. API e worker
compartilham configurações de PostgreSQL e MinIO, mas usam comandos distintos.
O desenvolvimento continua com PostgreSQL e MinIO locais; Redis não é
necessário.

## Superfície administrativa

O endpoint administrativo existente de materiais continua devolvendo somente
metadados seguros e `processingStatus`. Pode incluir um erro seguro de
processamento apenas para ADMIN. Não haverá endpoint de bytes, URL, download,
viewer, página rasterizada ou imagem derivada nesta fase. A interface admin
pode exibir `PROCESSING`, `READY` e `FAILED`, mas não consulta derivatives.

## Testes e critérios de aceite

- API cria jobs para PDF/imagem dentro da transação do material; ZIP não cria
  job de derivado.
- Workers concorrentes não processam o mesmo job simultaneamente.
- Lease vencido é recuperado; falhas transitórias respeitam máximo de 3
  tentativas; falhas determinísticas não fazem retry infinito.
- PDF de até 300 páginas gera páginas WebP privadas ordenadas; acima do limite
  não gera derivados e termina em `FAILED` seguro.
- Imagem gera preview WebP privado com dimensões preservadas; não amplia.
- Falhas removem temporários e derivados parciais; reexecução não duplica
  registros ou objetos efetivos.
- Delete de material limpa job/derivados/original privados sem vazar chaves.
- Serialização e UI administrativa não expõem URL, URL assinada, arquivo,
  conteúdo binário, segredo ou `storage_key`.
- Testes, typecheck, lint e build passam para API e Web.

## Fora de escopo

- Permissões `VIEW`/`DOWNLOAD`, AccessControlService e catálogo do aluno.
- Viewer, download, URL temporária, endpoint de conteúdo ou acesso do aluno.
- Tiles, múltiplas resoluções, watermark, OCR, vídeos e processamento de ZIP.
