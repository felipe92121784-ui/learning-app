# PROJECT_SPEC.md

# Portal de Cursos e Materiais Técnicos

## 1. Visão do projeto

O projeto consiste em uma plataforma web privada para gerenciamento, distribuição e consulta de materiais técnicos organizados em cursos e módulos.

O principal caso de uso é a disponibilização de materiais relacionados a mecânica, eletrônica e eletrônica agrícola, incluindo diagramas de placas, esquemas técnicos, apostilas, manuais, imagens em alta resolução, arquivos ZIP, softwares e instaladores.

A plataforma possuirá dois ambientes principais:

* Painel administrativo;
* Portal do aluno.

O administrador terá controle granular sobre quais conteúdos cada aluno pode visualizar e quais conteúdos pode baixar.

A aplicação não deve ser tratada inicialmente como um LMS completo.

O foco do MVP é:

> Usuários + Cursos + Módulos + Materiais + Permissões + Visualização protegida + Download controlado.

---

# 2. Stack tecnológica

## Frontend

* React;
* TypeScript;
* Vite;
* TanStack Router;
* TanStack Query;
* Tailwind CSS;
* shadcn/ui.

A aplicação frontend será uma SPA.

Não será utilizado Next.js.

Não existe necessidade relevante de SSR, Server Components ou SEO para o escopo atual, pois a aplicação principal será privada e autenticada.

---

## Backend

* AdonisJS;
* TypeScript.

O backend será uma API independente.

Toda regra de negócio, autenticação, autorização e acesso aos materiais deve ser validada pelo backend.

---

## Banco de dados

* PostgreSQL.

Responsável por armazenar:

* Usuários;
* Cursos;
* Módulos;
* Materiais;
* Permissões;
* Metadados;
* Logs;
* Referências para arquivos.

Arquivos binários não devem ser armazenados diretamente no PostgreSQL.

---

## Object Storage

Inicialmente:

* MinIO.

Responsável por armazenar:

* PDFs originais;
* Imagens originais;
* Arquivos ZIP;
* Instaladores;
* Softwares;
* Páginas processadas de PDFs;
* Tiles de imagens;
* Outros artefatos derivados.

O storage deve ser privado.

A arquitetura deve utilizar uma abstração de storage para permitir migração futura para:

* AWS S3;
* Cloudflare R2;
* Outros serviços compatíveis com S3.

---

# 3. Arquitetura geral

```text
┌──────────────────────────────────────┐
│              React SPA               │
│                                      │
│ React + TypeScript + Vite            │
│ TanStack Router                      │
│ TanStack Query                       │
│ Tailwind CSS + shadcn/ui             │
└──────────────────┬───────────────────┘
                   │
                   │ HTTP / HTTPS
                   ▼
┌──────────────────────────────────────┐
│             AdonisJS API             │
│                                      │
│ Authentication                       │
│ Authorization                        │
│ Users                                │
│ Courses                              │
│ Modules                              │
│ Materials                            │
│ Access Control                       │
│ Storage                              │
│ Processing                           │
│ Audit                                │
└──────────────┬────────────┬──────────┘
               │            │
               ▼            ▼
        PostgreSQL         MinIO
```

O React nunca deve acessar diretamente recursos privados do MinIO sem autorização do backend.

---

# 4. Princípios arquiteturais

O projeto deve seguir alguns princípios fundamentais.

## Backend owns authorization

O frontend nunca é responsável pela decisão final de autorização.

O frontend pode esconder botões e páginas para melhorar a UX, porém toda ação deve ser revalidada pela API.

---

## Default deny

Na ausência de uma permissão explícita ou herdada que conceda acesso:

```text
DENY
```

Nenhum conteúdo fica acessível simplesmente porque não existe regra cadastrada.

---

## Originals remain private

Arquivos originais protegidos nunca devem possuir URLs públicas permanentes.

---

## Centralized permissions

Toda resolução de permissões deve utilizar uma implementação central.

Não duplicar regras de autorização em controllers diferentes.

---

## Storage independence

Código de domínio não deve depender diretamente do MinIO.

---

## Content-first

A experiência de consulta dos materiais técnicos é uma das partes mais importantes do produto.

---

## YAGNI

Não transformar a aplicação em um LMS completo antes que exista necessidade real.

---

# 5. Tipos de usuário

Inicialmente existirão:

```text
ADMIN
STUDENT
```

---

# 6. ADMIN

O administrador poderá:

* Criar usuários;
* Editar usuários;
* Bloquear usuários;
* Criar cursos;
* Editar cursos;
* Arquivar cursos;
* Criar módulos;
* Editar módulos;
* Reordenar módulos;
* Criar materiais;
* Fazer upload;
* Reordenar materiais;
* Definir permissões;
* Revogar permissões;
* Criar acessos temporários;
* Autorizar visualização;
* Bloquear visualização;
* Autorizar downloads;
* Bloquear downloads.

Inicialmente haverá um administrador principal.

A arquitetura não deve impedir múltiplos administradores futuramente.

---

# 7. STUDENT

O aluno poderá:

* Fazer login;
* Visualizar cursos autorizados;
* Navegar pelos módulos autorizados;
* Consultar materiais autorizados;
* Visualizar PDFs;
* Visualizar imagens;
* Utilizar ferramentas de zoom;
* Utilizar lupa;
* Baixar materiais quando autorizado;
* Consultar sua conta.

---

# 8. Hierarquia principal

A estrutura de conteúdo será:

```text
Course
  │
  └── Module
        │
        └── Material
```

Um curso possui vários módulos.

Um módulo pertence a um curso.

Um módulo possui vários materiais.

Um material pertence a um módulo.

---

# 9. Course

Campos conceituais:

```text
id
title
description
cover_storage_key
status
created_at
updated_at
```

Status iniciais:

```text
DRAFT
PUBLISHED
ARCHIVED
```

---

# 10. Module

Campos conceituais:

```text
id
course_id
title
description
position
created_at
updated_at
```

`position` controla a ordenação dos módulos.

---

# 11. Material

Campos conceituais:

```text
id
module_id
title
description
type
storage_key
original_filename
mime_type
size
position
processing_status
created_at
updated_at
```

Tipos iniciais:

```text
PDF
IMAGE
FILE
```

`FILE` representa arquivos como:

* ZIP;
* EXE;
* Instaladores;
* Programas;
* Utilitários;
* Outros arquivos destinados a download.

Não assumir que PDFs e imagens nunca podem ser baixados.

A autorização de download é independente do tipo do material.

---

# 12. Users

Campos conceituais:

```text
id
name
email
password_hash
role
status
created_at
updated_at
```

Roles:

```text
ADMIN
STUDENT
```

Status:

```text
ACTIVE
BLOCKED
```

Senhas nunca devem ser armazenadas em texto puro.

---

# 13. Sistema de permissões

O sistema terá permissões hierárquicas com regras positivas e negativas.

Existem duas capacidades principais:

```text
VIEW
DOWNLOAD
```

Cada capacidade poderá possuir:

```text
ALLOW
DENY
INHERIT
```

As permissões podem existir em:

```text
COURSE
MODULE
MATERIAL
```

---

# 14. Herança

Permissões aplicadas sobre um COURSE são herdadas pelos MODULES e MATERIALS daquele curso.

Permissões aplicadas sobre um MODULE são herdadas pelos MATERIALS daquele módulo.

Permissões aplicadas diretamente sobre um MATERIAL possuem maior especificidade.

Regra fundamental:

> A regra válida mais específica aplicável ao recurso sobrescreve a regra herdada.

---

# 15. Exemplo de herança

```text
Course A
├── VIEW: ALLOW
└── DOWNLOAD: DENY

    Module 1
    └── herdado

    Module 2
    └── VIEW: DENY

    Module 3
    └── herdado

        Material X
        └── DOWNLOAD: ALLOW
```

Resultado:

```text
Course A             VIEW       YES
Module 1             VIEW       YES
Module 2             VIEW       NO
Module 3             VIEW       YES
Material X           VIEW       YES
Material X           DOWNLOAD   YES
outros materiais     DOWNLOAD   NO
```

---

# 16. Exceções negativas

DENY deve ser suportado.

Exemplo:

```text
COURSE
VIEW = ALLOW

MODULE 3
VIEW = DENY
```

O aluno possui acesso ao curso, exceto ao módulo 3.

Outro exemplo:

```text
COURSE
DOWNLOAD = ALLOW

MATERIAL X
DOWNLOAD = DENY
```

O aluno pode baixar os materiais daquele curso, exceto o Material X.

---

# 17. Permissões temporárias

Permissões podem possuir:

```text
starts_at
expires_at
```

Exemplo:

```text
Student João

Module 1
VIEW = ALLOW

starts_at:
2026-09-02

expires_at:
2026-09-05
```

Isso permite:

* Teste grátis;
* Demonstração;
* Liberação promocional;
* Acesso temporário.

Permissões sem expiração permanecem válidas até serem removidas ou revogadas.

---

# 18. AccessRule

Modelo conceitual inicial:

```text
id
user_id

resource_type
resource_id

view_effect
download_effect

starts_at
expires_at

created_by

created_at
updated_at
```

`resource_type`:

```text
COURSE
MODULE
MATERIAL
```

Effects:

```text
ALLOW
DENY
INHERIT
```

A estrutura física definitiva do banco pode ser refinada durante a modelagem.

A semântica descrita aqui deve ser preservada.

---

# 19. Resolução de autorização

Para determinar acesso a um Material:

```text
Request
   │
   ▼
Authenticated?
   │
   ▼
User ACTIVE?
   │
   ▼
Load Material
   │
   ▼
Load Module
   │
   ▼
Load Course
   │
   ▼
Load valid AccessRules
   │
   ▼
Resolve COURSE
   │
   ▼
Resolve MODULE
   │
   ▼
Resolve MATERIAL
   │
   ▼
Most specific rule wins
   │
   ▼
ALLOW / DENY
```

VIEW e DOWNLOAD devem ser resolvidos independentemente.

Exemplos conceituais:

```text
canView(user, material)

canDownload(user, material)
```

---

# 20. AccessControlService

Criar um serviço central responsável pela autorização.

Responsabilidades conceituais:

```text
canView()
canDownload()
resolveAccess()
```

Toda funcionalidade que entregue conteúdo protegido deve depender desse serviço.

Não implementar algoritmos diferentes de autorização em vários controllers.

---

# 21. Proteção dos materiais

Não existe maneira absoluta de impedir que conteúdo exibido no navegador seja copiado.

Um usuário ainda pode:

* Fazer screenshot;
* Fotografar a tela;
* Capturar requisições;
* Utilizar ferramentas externas;
* Utilizar técnicas avançadas de extração.

O objetivo da plataforma é:

> Dificultar significativamente a obtenção não autorizada do arquivo original e tornar vazamentos rastreáveis.

Não tratar a solução como DRM inviolável.

---

# 22. Storage privado

Nunca utilizar arquivos privados através de URLs públicas permanentes.

Evitar:

```text
https://storage.example.com/manual.pdf
```

Preferir identificadores internos:

```text
materials/{uuid}/original
```

O nome original existe como metadata no banco.

---

# 23. PDF protegido

Quando:

```text
canView = true
canDownload = false
```

preferencialmente não enviar o PDF original para o navegador.

Pipeline:

```text
PDF Original
     │
     ▼
Private MinIO
     │
     ▼
Processing
     │
     ├── Page 001
     ├── Page 002
     ├── Page 003
     └── ...
           │
           ▼
      Protected Viewer
```

O frontend constrói uma experiência semelhante a um leitor de PDF utilizando representações processadas.

Isso impede o download trivial:

```text
DevTools
→ Network
→ manual.pdf
→ Save As
```

porque o arquivo PDF original não precisa ser entregue durante a visualização protegida.

---

# 24. PDF com download autorizado

Quando:

```text
canDownload = true
```

Fluxo:

```text
React
   │
   ▼
Request download
   │
   ▼
AdonisJS
   │
   ▼
canDownload()
   │
   ▼
ALLOW
   │
   ▼
Temporary signed URL / stream
   │
   ▼
Original file
```

URLs temporárias devem possuir validade curta.

---

# 25. Imagens técnicas

As imagens poderão possuir resoluções muito altas.

Exemplos:

* Diagramas;
* Placas eletrônicas;
* Esquemas;
* Mapas de componentes;
* Circuitos.

Precisamos permitir que o usuário navegue da visão geral até pequenos componentes.

---

# 26. Tiled Images

Utilizar abordagem de imagem multi-resolution / tiled image.

Pipeline:

```text
Original Image
      │
      ▼
Private MinIO
      │
      ▼
Image Processing
      │
      ▼
Resolution Pyramid
      │
      ├── Level 0
      ├── Level 1
      ├── Level 2
      └── Level N
             │
             ▼
            Tiles
```

O frontend solicita somente os tiles necessários para:

* Zoom atual;
* Região visível;
* Resolução necessária.

Benefícios:

* Performance;
* Menor consumo de banda;
* Zoom extremo;
* Não entrega direta do original.

---

# 27. Image Viewer

O viewer deve suportar:

* Pan;
* Mouse wheel zoom;
* Botões de zoom;
* Pinch-to-zoom;
* Fullscreen;
* Reset;
* Fit;
* Alta ampliação;
* Lupa.

Considerar biblioteca especializada em tiled images.

A biblioteca deverá ser avaliada considerando:

* React;
* Tiles;
* Performance;
* Touch;
* Licença;
* Manutenção;
* Customização.

Não implementar manualmente uma engine completa de tiled images sem necessidade.

---

# 28. Lupa

O viewer deve permitir modo lupa.

Objetivo:

inspecionar uma pequena região em ampliação maior sem necessariamente modificar completamente o viewport atual.

Especialmente útil para:

* Código de componentes;
* Pequenos textos;
* Trilhas;
* Referências;
* Identificação de componentes eletrônicos.

---

# 29. Watermark

Materiais protegidos devem suportar watermark personalizada.

Possíveis informações:

```text
Nome
E-mail/login
User ID
Data/hora
```

Exemplo:

```text
JOÃO SILVA
joao@example.com
02/09/2026 13:30
```

Preferencialmente a watermark deve fazer parte do conteúdo derivado entregue ao usuário.

Não depender exclusivamente de overlay HTML removível pelo DevTools.

---

# 30. Watermark e cache

Evitar gerar permanentemente uma cópia completa de todos os materiais para cada usuário se isso causar crescimento excessivo do storage.

Avaliar durante implementação:

* geração dinâmica;
* cache temporário;
* cache por usuário;
* watermark aplicada durante serving;
* watermark incorporada em derivados.

Equilibrar:

```text
Security
Performance
CPU
Storage
Latency
```

---

# 31. Criptografia

Não implementar criptografia client-side customizada como mecanismo principal de proteção.

Estratégias como:

```text
Encrypted file
+
Key sent to JavaScript
```

não impedem usuários avançados de recuperar o conteúdo.

Utilizar:

* HTTPS/TLS;
* Storage privado;
* Autorização;
* Conteúdo derivado;
* Tiles;
* URLs temporárias;
* Watermark;
* Logs.

---

# 32. Upload

Fluxo conceitual:

```text
Admin
   │
   ▼
Select file
   │
   ▼
React
   │
   ▼
AdonisJS
   │
   ▼
Validate
   │
   ▼
Private MinIO
   │
   ▼
Save metadata
   │
   ▼
Process if necessary
```

---

# 33. Processing Status

Estados sugeridos:

```text
UPLOADING
PROCESSING
READY
FAILED
```

Materiais incompletos não devem ficar disponíveis aos alunos.

---

# 34. Processamento por tipo

## PDF

```text
Upload
→ Original
→ Processing
→ Pages
→ READY
```

## IMAGE

```text
Upload
→ Original
→ Processing
→ Resolution Pyramid
→ Tiles
→ READY
```

## FILE

```text
Upload
→ Original
→ READY
```

---

# 35. Processamento assíncrono

PDFs grandes e imagens enormes não devem bloquear requests HTTP por longos períodos.

A arquitetura deve permitir:

```text
AdonisJS API
     │
     ▼
Job Queue
     │
     ▼
Worker
     │
     ▼
Processing
     │
     ├── PostgreSQL
     └── MinIO
```

A tecnologia da fila poderá ser definida durante implementação.

Não adicionar infraestrutura desnecessária antes da necessidade real, mas não acoplar processamento pesado aos controllers.

---

# 36. MaterialProcessingService

Responsável por coordenar:

```text
PDF
→ pages

IMAGE
→ pyramid
→ tiles
```

Também gerencia:

* Status;
* Falhas;
* Derivados;
* Reprocessamento.

---

# 37. Downloads

Endpoint conceitual:

```text
GET /materials/:id/download
```

Fluxo:

```text
authenticate
→ load material
→ canDownload
→ ALLOW?
→ temporary access
→ audit
```

Caso não autorizado:

```text
403 Forbidden
```

Nunca confiar no fato de o botão de download estar escondido no frontend.

---

# 38. Visualização

Endpoint conceitual:

```text
GET /materials/:id/view
```

Esse endpoint não significa necessariamente retornar o arquivo.

Pode retornar:

```text
material
viewerType
capabilities
manifest
```

Exemplo conceitual:

```json
{
  "viewerType": "TILED_IMAGE",
  "capabilities": {
    "canView": true,
    "canDownload": false,
    "watermark": true
  }
}
```

Não retornar informações internas desnecessárias do storage.

---

# 39. Manifest

PDF processado pode possuir:

```text
pages
dimensions
available resolutions
```

Imagem tiled pode possuir:

```text
width
height
tileSize
levels
```

O formato definitivo deve ser definido durante implementação.

---

# 40. URLs protegidas

Tiles, páginas processadas e originais não devem utilizar URLs públicas permanentes.

Utilizar conforme necessário:

* Endpoints autenticados;
* Tokens temporários;
* Signed URLs de curta duração.

Copiar uma URL não deve conceder acesso permanente ao material.

---

# 41. Logs

Registrar eventos relevantes.

Inicialmente:

```text
LOGIN
VIEW_MATERIAL
DOWNLOAD_MATERIAL
FAILED_ACCESS
PERMISSION_CHANGED
```

Possíveis informações:

```text
user_id
material_id
action
timestamp
ip
user_agent
```

---

# 42. Segurança mínima

Implementar:

* Password hashing seguro;
* Rate limiting em autenticação;
* Input validation;
* Authorization server-side;
* Storage privado;
* MIME validation;
* Upload size limits;
* Filename sanitization;
* Proteção contra path traversal;
* CORS correto;
* Cookies/tokens seguros;
* Logs relevantes.

Nunca confiar somente na extensão do arquivo.

---

# 43. Frontend

A aplicação React terá duas áreas principais:

```text
/admin
/app
```

---

# 44. Stack frontend

```text
React
TypeScript
Vite
TanStack Router
TanStack Query
Tailwind CSS
shadcn/ui
```

Evitar adicionar soluções globais de estado sem necessidade.

---

# 45. TanStack Router

Utilizar TanStack Router como sistema oficial de roteamento.

Preferencialmente utilizar file-based routing.

Benefícios importantes para este projeto:

* Type-safe routing;
* Params tipados;
* Search params tipados;
* Nested layouts;
* Route guards;
* Loaders;
* Prefetching;
* Code splitting.

---

# 46. Estrutura conceitual das rotas

```text
src/routes/

__root.tsx

login.tsx

_admin.tsx
_admin/
├── index.tsx
├── users/
├── courses/
├── materials/
└── settings/

_app.tsx
_app/
├── index.tsx
├── courses/
├── materials/
└── account/
```

---

# 47. Rotas conceituais

```text
/login

/admin
/admin/users
/admin/users/:userId
/admin/courses
/admin/courses/:courseId
/admin/courses/:courseId/modules/:moduleId
/admin/materials
/admin/settings

/app
/app/courses
/app/courses/:courseId
/app/courses/:courseId/modules/:moduleId
/app/materials/:materialId
/app/account
```

A estrutura pode ser refinada durante implementação.

---

# 48. Layout administrativo

`_admin` representa o layout administrativo.

Responsabilidades:

* Sidebar;
* Header;
* Navegação administrativa;
* Verificação de autenticação;
* Verificação de role.

Conceitualmente:

```text
authenticated
AND
role === ADMIN
```

Isso melhora a UX, mas não substitui autorização no backend.

---

# 49. Layout do aluno

`_app` representa o portal do aluno.

Responsabilidades:

* Layout do portal;
* Navegação;
* Usuário autenticado;
* Cursos disponíveis;
* Conta.

---

# 50. TanStack Query

Utilizar TanStack Query para estado proveniente da API.

Exemplos conceituais:

```text
useCurrentUser()
useUsers()
useCourses()
useCourse()
useModules()
useMaterial()
useAccessRules()
```

Responsável por:

* Cache;
* Fetching;
* Loading;
* Error;
* Mutations;
* Invalidations;
* Refetch.

Evitar copiar dados da API para stores globais sem necessidade.

---

# 51. Estado local

Utilizar estado React para estados de UI.

Exemplos:

* Modal;
* Sidebar;
* Zoom;
* Lupa;
* Item selecionado;
* Tabs;
* Formulários.

Não adicionar Redux ou solução semelhante sem necessidade comprovada.

---

# 52. Organização sugerida do frontend

```text
src/
├── routes/
├── components/
│   ├── ui/
│   ├── layout/
│   └── common/
│
├── features/
│   ├── auth/
│   ├── users/
│   ├── courses/
│   ├── modules/
│   ├── materials/
│   ├── permissions/
│   └── viewer/
│
├── hooks/
├── lib/
├── services/
├── types/
└── main.tsx
```

Preferir organização por feature/domínio.

---

# 53. API Client

Criar cliente centralizado para comunicação com AdonisJS.

Fluxo:

```text
React Component
      │
      ▼
TanStack Query
      │
      ▼
API Client
      │
      ▼
AdonisJS
```

Não espalhar:

* Base URL;
* Headers;
* Tratamento de auth;
* Tratamento comum de erro;

pela aplicação.

---

# 54. Autenticação frontend

Preferencialmente utilizar sessão baseada em cookie HTTP-only caso a estratégia de deploy permita.

Evitar armazenamento permanente de tokens sensíveis em:

```text
localStorage
```

O frontend consulta a sessão atual através da API.

---

# 55. Protected Routes

TanStack Router pode impedir navegação inadequada.

Exemplo:

```text
/login
   │
   ▼
Authentication
   │
   ▼
Current User
   │
   ├── ADMIN
   │     ↓
   │   /admin
   │
   └── STUDENT
         ↓
       /app
```

Novamente:

> Route guards são UX. AdonisJS continua sendo a autoridade de segurança.

---

# 56. Admin

Principais áreas:

```text
Dashboard
Users
Courses
Materials
Permissions
Settings
```

---

# 57. Permission Editor

O frontend precisa representar claramente:

```text
Course
├── Module
│   ├── Material
│   ├── Material
│   └── Material
└── Module
```

Para cada nível, permitir configurar:

```text
VIEW
DOWNLOAD
EXPIRATION
```

A UI deve diferenciar claramente:

```text
ALLOW
DENY
INHERITED
TEMPORARY
```

Evitar que o administrador configure permissões erradas sem perceber.

---

# 58. Student Portal

O aluno deve receber somente conteúdos relevantes à sua conta.

A API deve filtrar conteúdos com base em autorização.

Não depender exclusivamente do React para esconder conteúdos.

Tentativa direta de acessar material sem autorização deve ser rejeitada pelo backend.

---

# 59. Viewer

Viewer é um domínio importante do frontend.

Estrutura conceitual:

```text
features/viewer/

├── components/
├── pdf/
├── image/
├── controls/
├── watermark/
└── hooks/
```

Evitar transformar toda lógica de visualização em um único componente gigante.

---

# 60. Viewer Controls

Controles esperados:

```text
Zoom +
Zoom -
Reset
Fit
Fullscreen
Lupa
Pan
```

Para PDF:

```text
Previous Page
Next Page
Page Number
Fit Width
Fit Page
```

---

# 61. Responsividade

Suportar:

* Desktop;
* Notebook;
* Tablet;
* Smartphone.

Desktop e tablet possuem prioridade especial para materiais técnicos.

Touch deve suportar:

* Pinch;
* Pan;
* Controles adequados.

---

# 62. Backend

Organização conceitual:

```text
Controllers
      │
      ▼
Services / Use Cases
      │
      ▼
Policies / Access Control
      │
      ▼
Models / Repositories
      │
      ▼
Infrastructure
```

Controllers não devem concentrar regras complexas de negócio.

---

# 63. Serviços importantes

Inicialmente considerar:

```text
StorageService
AccessControlService
MaterialService
MaterialProcessingService
CourseService
UserService
```

---

# 64. StorageService

Interface conceitual:

```text
upload()
delete()
read()
exists()
getTemporaryAccess()
```

Implementação inicial:

```text
StorageService
      │
      ▼
MinioStorageProvider
```

Futuramente:

```text
StorageService
      │
      ▼
S3StorageProvider
```

---

# 65. API

Organizar endpoints por domínio.

Exemplo conceitual:

```text
/auth

/users

/courses
/courses/:id/modules

/modules/:id/materials

/materials/:id/view
/materials/:id/download

/access-rules
```

Não considerar esses endpoints como contrato definitivo.

O agente deve manter uma API REST consistente.

---

# 66. Exclusão

Ao excluir um Material considerar:

* Banco;
* Original;
* Páginas processadas;
* Tiles;
* Cache.

Avaliar soft delete para evitar perda administrativa acidental.

---

# 67. MVP

## Authentication

* Login;
* Logout;
* ADMIN;
* STUDENT.

## Users

* Create;
* Edit;
* Activate;
* Block.

## Courses

* CRUD;
* Cover;
* Status.

## Modules

* CRUD;
* Ordering.

## Materials

* Upload;
* PDF;
* IMAGE;
* FILE;
* Ordering;
* Processing status.

## Permissions

* COURSE;
* MODULE;
* MATERIAL;
* ALLOW;
* DENY;
* INHERIT;
* VIEW;
* DOWNLOAD;
* starts_at;
* expires_at;
* Hierarchy;
* Overrides.

## Storage

* MinIO;
* Private bucket;
* Storage abstraction.

## Viewer

* Protected PDF;
* Tiled image viewer;
* Zoom;
* Pan;
* Fullscreen;
* Lupa;
* Touch.

## Protection

* Private originals;
* Derived content;
* Watermark;
* Temporary downloads;
* Access logs.

---

# 68. Fora do MVP

Não implementar inicialmente:

* Vídeos;
* Video streaming;
* Pagamentos;
* Certificados;
* Provas;
* Notas;
* Fórum;
* Chat;
* Gamificação;
* Marketplace;
* Aplicativo mobile nativo.

---

# 69. Decisões arquiteturais definidas

As seguintes decisões não devem ser alteradas silenciosamente pelo agente:

1. Frontend em React.
2. Frontend como SPA.
3. Vite como build tool.
4. TypeScript.
5. TanStack Router como router.
6. TanStack Query para server state.
7. Tailwind CSS.
8. shadcn/ui.
9. Backend independente em AdonisJS.
10. PostgreSQL.
11. MinIO inicialmente.
12. Storage privado.
13. Storage abstraction.
14. Course → Module → Material.
15. Permissões hierárquicas.
16. ALLOW e DENY.
17. Regra mais específica sobrescreve herança.
18. VIEW e DOWNLOAD independentes.
19. Permissões podem expirar.
20. Default DENY.
21. Authorization pertence ao backend.
22. PDFs protegidos preferencialmente não entregam original.
23. Imagens grandes utilizam tiled/multi-resolution.
24. Watermark personalizada.
25. Downloads autorizados podem utilizar URLs temporárias.
26. Processamento pesado deve poder utilizar workers.
27. Não implementar DRM client-side customizado.
28. Vídeos estão fora do escopo atual.

---

# 70. Orientação para agentes

Antes de implementar qualquer funcionalidade:

1. Ler este documento.
2. Identificar o domínio afetado.
3. Preservar as regras de autorização.
4. Nunca expor arquivos originais protegidos acidentalmente.
5. Utilizar AccessControlService para decisões de acesso.
6. Não duplicar regras de permissionamento.
7. Não acoplar domínio ao MinIO.
8. Manter React e AdonisJS desacoplados.
9. Utilizar TanStack Query para server state.
10. Utilizar TanStack Router para routing.
11. Manter TypeScript fortemente tipado.
12. Não adicionar Redux sem necessidade.
13. Não adicionar funcionalidades de LMS fora do escopo.
14. Priorizar componentes e serviços pequenos e testáveis.
15. Questionar antes de alterar uma decisão arquitetural deste documento.

Quando existir conflito entre uma implementação conveniente e uma regra deste documento:

> A regra definida neste documento prevalece até que a arquitetura seja explicitamente revisada.

---

# 71. Resumo arquitetural

```text
                    USER
                      │
                      ▼
              ┌───────────────┐
              │   React SPA   │
              │               │
              │ TanStack      │
              │ Router        │
              │     +         │
              │ Query         │
              └───────┬───────┘
                      │
                      ▼
              ┌───────────────┐
              │   AdonisJS    │
              │               │
              │ Auth          │
              │ Permissions   │
              │ Courses       │
              │ Materials     │
              │ Processing    │
              └───────┬───────┘
                      │
             ┌────────┴─────────┐
             ▼                  ▼
       ┌────────────┐      ┌──────────┐
       │ PostgreSQL │      │  MinIO   │
       │            │      │          │
       │ Metadata   │      │ Originals│
       │ Users      │      │ Tiles    │
       │ Permissions│      │ Pages    │
       │ Logs       │      │ Files    │
       └────────────┘      └──────────┘
```

Fluxo administrativo:

```text
Admin
→ Users
→ Courses
→ Modules
→ Materials
→ Permissions
```

Fluxo do aluno:

```text
Student
→ Login
→ Authorized Courses
→ Authorized Modules
→ Authorized Materials
→ Protected Viewer / Authorized Download
```

Proteção:

```text
Authentication
        +
Hierarchical Authorization
        +
Private MinIO
        +
Derived PDF Pages
        +
Tiled Images
        +
Watermark
        +
Temporary Downloads
        +
Access Logs
```

O objetivo final é criar uma plataforma profissional de distribuição de materiais técnicos em que o administrador possui controle granular sobre visualização e download, enquanto os alunos possuem uma experiência rápida e especialmente adequada à consulta de documentos e diagramas técnicos de alta resolução.
