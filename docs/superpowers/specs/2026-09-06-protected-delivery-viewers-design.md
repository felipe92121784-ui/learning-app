# Entrega e viewers protegidos — desenho da Fase 6

## Objetivo

Entregar ao aluno materiais PDF e IMAGE sem expor o arquivo original durante
a visualização. Toda entrega protegida será autorizada somente por
`AccessControlService`; downloads do original serão independentes, auditáveis
e limitados a uma URL MinIO assinada por cinco minutos.

Esta fase cria os contratos de entrega e componentes de viewer reutilizáveis.
Ela não cria o catálogo, a navegação ou as páginas de descoberta do aluno:
isso permanece na Fase 7.

## Decisões aprovadas

- A autorização de `VIEW` e `DOWNLOAD` continua independente e é resolvida
  exclusivamente por `AccessControlService`.
- Cada URL temporária do original expira em cinco minutos.
- A auditoria armazena `VIEW_MATERIAL`, `DOWNLOAD_MATERIAL` e
  `FAILED_ACCESS`, incluindo usuário, material, data/hora, IP e user-agent.
- Derivados são servidos por endpoints autenticados da API, e não por URLs
  assinadas de storage. Assim, toda solicitação de uma página ou imagem volta
  a validar `VIEW`.
- Nesta fase, IMAGE usa o derivado `IMAGE_PREVIEW` existente com zoom e pan.
  Pirâmide de tiles, lupa, touch avançado, fullscreen e watermark por usuário
  são explicitamente da Fase 8.

## Limites e invariantes de segurança

- O bucket MinIO, originais e derivados permanecem privados.
- `storageKey`, URLs internas de storage e metadados privados de derivados
  nunca são serializados em respostas da API.
- Sem uma decisão `DOWNLOAD = ALLOW` ativa, nenhuma rota pode devolver,
  redirecionar, fazer streaming ou assinar a chave do original.
- Sem uma decisão `VIEW = ALLOW` ativa, a API não devolve metadados úteis de
  visualização nem bytes de derivados.
- Um administrador não ganha acesso implícito a estes endpoints: a rota é
  destinada ao usuário autenticado e sua decisão é a mesma resolução de
  permissões usada para STUDENT. A área administrativa não terá link de
  download ou viewer nesta fase.
- A proteção não é DRM: derivados podem ser capturados por screenshot, mas o
  original não é entregue como consequência de `VIEW`.

## Modelo de dados de auditoria

Criar `access_logs` como registro somente de inserção:

| Campo | Regra |
| --- | --- |
| `id` | chave primária |
| `user_id` | FK para o usuário autenticado |
| `material_id` | FK para o material solicitado |
| `action` | `VIEW_MATERIAL`, `DOWNLOAD_MATERIAL` ou `FAILED_ACCESS` |
| `ip_address` | endereço remoto normalizado, nulo quando indisponível |
| `user_agent` | cabeçalho limitado a tamanho seguro, nulo quando ausente |
| `created_at` | instante UTC criado pelo banco/aplicação |

Não haverá endpoint de edição ou exclusão. Um serviço `AccessLogService`
centraliza a criação de eventos, para que rotas de entrega não definam suas
próprias regras de persistência.

Eventos são registrados quando a tentativa chega a uma rota protegida:

- `VIEW_MATERIAL`: a resposta de manifesto de visualização foi autorizada;
- `DOWNLOAD_MATERIAL`: a URL temporária foi emitida;
- `FAILED_ACCESS`: uma tentativa autenticada recebeu decisão negada, inclusive
  solicitação direta de derivado ou download.

Para não transformar a paginação de PDF em uma linha por byte ou por página,
as requisições de bytes de derivados não geram um segundo `VIEW_MATERIAL`:
o evento é criado na abertura autorizada do manifesto. A segurança de cada
requisição de bytes continua sendo revalidada.

## API de entrega

Todas as rotas abaixo pertencem a `/api/v1`, exigem a sessão `web` ativa e
passam o `user.id` autenticado para `AccessControlService.resolve` com
`resourceType: 'MATERIAL'`. IDs inválidos e materiais inexistentes preservam
as convenções atuais de validação/404; uma decisão negada devolve `403` e
registra `FAILED_ACCESS`.

### Manifesto de visualização

`GET /materials/:id/view`

1. Localiza o material.
2. Resolve `VIEW` no instante UTC atual.
3. Se negado, cria `FAILED_ACCESS` e responde `403` sem metadados de storage.
4. Se autorizado, exige material `READY` e derivado compatível; cria
   `VIEW_MATERIAL` e retorna dados seguros.

Contrato de sucesso:

```ts
type ProtectedMaterialView = {
  id: number
  title: string
  type: 'PDF' | 'IMAGE' | 'ZIP'
  viewer: {
    kind: 'PDF_PAGES' | 'IMAGE_PREVIEW'
    derivatives: Array<{
      id: number
      pageNumber: number | null
      width: number
      height: number
      position: number
      contentUrl: string
    }>
  }
  download: { allowed: boolean }
}
```

PDF retorna seus derivados `PDF_PAGE` em ordem de posição; IMAGE retorna o
único `IMAGE_PREVIEW`. ZIP não tem viewer nesta fase e recebe uma resposta
sem viewer, ainda mantendo `download.allowed` determinado de modo independente.
Material não pronto ou sem derivado necessário devolve `409` com código seguro
de disponibilidade, sem registrar uma falha de autorização.

### Bytes de derivado

`GET /materials/:materialId/derivatives/:derivativeId`

1. Confirma que o derivado pertence ao material indicado.
2. Resolve `VIEW` de novo para o material no instante UTC atual.
3. Com autorização, obtém o objeto privado e faz streaming com o MIME
   persistido (`image/webp`), `Content-Disposition: inline` e
   `Cache-Control: private, no-store`.

Não existe fallback para o original, não há redirect para MinIO e o endpoint
não retorna `storageKey`. Derivado ausente no storage retorna erro controlado
sem vazar detalhes internos.

### URL de download do original

`POST /materials/:id/download-url`

1. Localiza o material e resolve `DOWNLOAD` no instante UTC atual.
2. Se negado, registra `FAILED_ACCESS` e responde `403`.
3. Se autorizado, emite URL `GET` MinIO assinada para a chave original, com
   `ResponseContentDisposition` de attachment e nome original saneado, válida
   por exatamente 300 segundos.
4. Registra `DOWNLOAD_MATERIAL` e retorna `{ url, expiresAt }`.

A assinatura é a única exceção de URL para um objeto privado. O endpoint nunca
faz stream do original e a chave não aparece no JSON. A expiração não revoga
uma URL já emitida antes dos cinco minutos; novas emissões sempre reavaliam a
permissão atual.

## Componentes e fluxo web

Criar um módulo `features/protected-viewer` independente de rotas de catálogo:

- cliente tipado para manifesto e emissão de URL;
- hooks React Query para carregar o manifesto e solicitar download;
- `ProtectedMaterialViewer` que escolhe o componente conforme `viewer.kind`;
- `PdfPagesViewer`, com páginas WebP em sequência e estados de carregamento e
  erro;
- `ImagePreviewViewer`, com zoom por botões/roda, pan por arrasto, ajustar à
  tela e reset.

Os componentes recebem o manifesto, usam `contentUrl` autenticado como URL
absoluta da própria API e não montam URLs de storage. O botão de download só é apresentado
quando `download.allowed` é verdadeiro; a API continua sendo a autoridade se
o usuário chamar a rota diretamente. Eles serão integrados ao Portal do aluno
na Fase 7, quando existir um material autorizado para abrir.

## Storage e interfaces internas

Expandir `StorageService` com uma única operação explícita para a exceção de
download:

```ts
createTemporaryDownloadUrl(input: {
  key: string
  filename: string
  expiresInSeconds: 300
}): Promise<string>
```

`MinioStorageProvider` implementa essa operação via presigner do AWS SDK,
com o mesmo client, bucket privado e path style já usados pelo projeto. O
serviço de entrega recebe abstrações para storage, controle de acesso e logs,
o que permite testes unitários sem MinIO.

## Erros e concorrência

- O controlador consulta a decisão imediatamente antes de cada entrega;
  permissões expiradas ou revogadas impedem novas chamadas.
- Falhas de storage e assinatura respondem `500` genérico, são registradas no
  logger do servidor e não incluem chave, URL ou erro S3 para o cliente.
- Auditoria ocorre antes de responder um `403`; se não puder ser gravada por
  indisponibilidade do banco, a entrega é negada (`500`) em vez de permitir
  acesso sem trilha auditável.
- Uma falha de log após uma URL de download ser criada impede sua resposta;
  a URL potencialmente gerada expira em até cinco minutos e não é exposta no
  JSON. O código deve registrar o incidente sem registrar a URL.

## Testes e critério de aceite

Cobrir API, serviços e web com os seguintes casos:

1. `VIEW` autorizado entrega manifesto de PDF/IMAGE e stream de derivado, mas
   resposta não contém chave privada nem original.
2. Sem `VIEW`, manifesto e derivado retornam `403` e registram
   `FAILED_ACCESS`.
3. Uma alteração/expiração de `VIEW` entre manifesto e solicitação de página
   bloqueia a página.
4. `DOWNLOAD` negado não chama presigner nem expõe URL; `DOWNLOAD` permitido
   emite URL de cinco minutos com attachment e registra `DOWNLOAD_MATERIAL`.
5. `VIEW` e `DOWNLOAD` são independentes: visualizar não autoriza baixar e
   baixar não autoriza abrir derivados.
6. ZIP não fornece viewer; materiais não prontos não fingem estar disponíveis.
7. Viewer web renderiza páginas e imagem protegidas, mostra download apenas
   quando permitido, e oferece zoom/pan/fit/reset sem criar URL de original.
8. Typecheck, lint e todas as suítes API/Web passam.

## Fora de escopo

- Catálogo/navegação do aluno e rota que seleciona material (Fase 7).
- Tiles, pirâmide multi-resolução, lupa, fullscreen, pinch-to-zoom e
  watermark por usuário (Fase 8).
- ZIP viewer, vídeo, streaming, pagamentos e certificação.
