# Storage privado e materiais — Design

## Objetivo

Permitir que administradores enviem materiais vinculados a módulos, mantendo
originais exclusivamente no MinIO privado. A etapa não disponibiliza arquivos
nem catálogo para alunos e não cria URLs públicas.

## Escopo de arquivo e limites

Os únicos formatos aceitos são PDF, imagens e ZIP. Os limites ficam em banco,
por categoria, com valor inicial de 100 MB:

| Categoria | Material type | Limite inicial |
| --- | --- | --- |
| PDF | `PDF` | 100 MB |
| Imagem | `IMAGE` | 100 MB |
| ZIP | `ZIP` | 100 MB |

O backend identifica o tipo por MIME validado e extensão permitida. A extensão
sozinha nunca é suficiente. Arquivos inválidos, acima do limite ou sem uma
combinação MIME/extensão permitida retornam 422 antes de serem armazenados.

O administrador ajusta os três limites por meio de uma tela de configurações.
O valor é inteiro positivo em MB, com máximo técnico de 1 GB. A regra é lida
no servidor a cada upload; o frontend só melhora a experiência.

## Persistência

`materials` pertence a `modules`, com os campos: `title`, `description`,
`type`, `storage_key`, `original_filename`, `mime_type`, `size`, `position`,
`processing_status`, timestamps. Os tipos são `PDF`, `IMAGE` e `ZIP`; os
status são `UPLOADING`, `PROCESSING`, `READY` e `FAILED`.

Nesta fase, depois do upload privado bem-sucedido, cada material termina em
`PROCESSING`. A Fase 4 será a única responsável por produzir derivados e
trocar PDF/imagem para `READY`. ZIP não recebe visualização derivada ainda.

`upload_settings` armazena uma linha por categoria (`PDF`, `IMAGE`, `ZIP`) e
`max_size_bytes`; migrations inserem os três defaults de 100 MB.

## StorageService

O domínio depende de uma interface de storage, não do SDK do MinIO:

```ts
interface StorageService {
  ensurePrivateBucket(): Promise<void>
  putObject(input: PutObjectInput): Promise<void>
  deleteObject(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}
```

`MinioStorageProvider` usa o cliente S3 compatível apontado pelas variáveis
`S3_*` existentes. Ele cria o bucket se necessário e bloqueia acesso público
no bucket. Chaves são geradas no servidor, com prefixo `originals/` e UUID;
nunca aceitam caminho fornecido pelo cliente.

O controller recebe o arquivo multipart, valida tipo/tamanho/configuração,
escreve no storage e só então persiste os metadados. Se a persistência falhar,
o objeto enviado é removido de forma compensatória. Se o upload falhar, nenhum
material é criado.

## API administrativa

Todas as rotas exigem sessão ativa, CSRF e middleware `admin`.

| Método | Rota | Responsabilidade |
| --- | --- | --- |
| GET | `/upload-settings` | Ler limites configurados. |
| PATCH | `/upload-settings/:type` | Alterar um limite em MB. |
| GET | `/modules/:moduleId/materials` | Listar materiais por posição. |
| POST | `/modules/:moduleId/materials` | Upload multipart e criação de material. |
| PATCH | `/modules/:moduleId/materials/:id` | Editar título ou descrição. |
| DELETE | `/modules/:moduleId/materials/:id` | Remover metadado e objeto privado. |

As respostas administrativas podem conter metadados, mas nunca uma URL de
objeto, URL assinada, conteúdo binário ou segredo de storage.

## Interface administrativa

A tela de detalhe de curso ganha uma seção de materiais por módulo. Um diálogo
de upload permite escolher arquivo, título e descrição; mostra as regras e o
limite atual da categoria após o arquivo ser selecionado. Lista materiais com
tipo, tamanho, status e ações administrativas de editar/remover.

O menu admin ganha `Configurações`, contendo os três limites. Não há rotas,
links ou requisições de materiais na área do aluno.

## Segurança e erros

- Originais e bucket são privados; nenhuma política pública é adicionada.
- Somente admin envia, altera ou remove materiais/configurações.
- O servidor determina chave, tipo, limite e posição; dados enviados pelo
  navegador não controlam esses valores.
- Falhas de storage não expõem endpoint, access key, secret ou storage key ao
  usuário; retornam erro genérico.
- Delete remove o objeto e o registro; caso o objeto já não exista, a remoção
  de metadados continua para recuperação administrativa.

## Verificação

Testes de API cobrem bucket privado, validação MIME/extensão/tamanho, rollback
compensatório, metadados sem URL, admin/guest/student e configurações. Testes
Web cobrem multipart, erro de upload, tamanhos/configurações e ausência de
qualquer rota de aluno. A conclusão exige testes, typecheck, lint e build em
API e Web.
