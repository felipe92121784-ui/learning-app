# Roadmap do MVP protegido

## Decisão de entrega

O MVP nunca entrega original privado para visualização sem autorização de
download. PDFs e imagens serão suportados desde a primeira versão do viewer,
usando derivados privados e protegidos. Downloads de originais são um fluxo
separado e exigem `DOWNLOAD = ALLOW`.

## Ordem das fases

### Fase 1 — Administração de usuários

CRUD de alunos pelo administrador, ativação/bloqueio e telas administrativas.
Critério: admin cria aluno ativo e aluno bloqueado não consegue manter sessão.

### Fase 2 — Catálogo administrativo

CRUD de cursos e módulos, status de curso e ordenação persistida. Ainda não
expõe conteúdo ao aluno. Critério: admin organiza Course → Module.

### Fase 3 — Storage e materiais privados

`StorageService` com provider MinIO, bucket privado, upload validado e
metadados de Material. Originais nunca recebem URL pública. Critério: admin
envia PDF, imagem e arquivo genérico; todos ficam privados.

### Fase 4 — Processamento protegido de PDF e imagem

Fila/worker mínimo processa PDF em páginas rasterizadas e imagens em derivados
de consulta. O contrato inclui status de processamento e permite introduzir
tiles/múltiplas resoluções posteriormente sem mudar a API de viewer. Critério:
PDF e imagem prontos têm derivados privados; o original não aparece nas
respostas de visualização.

### Fase 5 — Permissões hierárquicas

`AccessRule` e `AccessControlService`: COURSE/MODULE/MATERIAL, VIEW e
DOWNLOAD independentes, ALLOW/DENY/INHERIT, regra mais específica e janelas de
validade. Default deny. Critério: testes cobrem herança, deny específico e
expiração para ambos os recursos.

### Fase 6 — Entrega e viewers protegidos

Endpoints usam exclusivamente `AccessControlService`. Viewer PDF consulta
páginas derivadas; viewer de imagem consulta derivado adequado e já prevê
zoom/pan. Download gera URL MinIO temporária somente após autorização. Critério:
sem DOWNLOAD, rede não recebe o original; com DOWNLOAD, link temporário
funciona; acessos são registrados.

### Fase 7 — Portal do aluno

Catálogo e navegação filtrados por VIEW, com viewer integrado. Critério: aluno
vê apenas Course/Module/Material autorizados e não alcança recursos negados
por URL manual.

### Fase 8 — Proteção e experiência avançadas

Tiles para imagens grandes, watermark por usuário, lupa/touch/fullscreen,
observabilidade e UAT de segurança. Critério: consulta fluida de documentos
técnicos grandes e trilha auditável de acessos/downloads.

## Regras permanentes

- API decide autorização; Web apenas melhora UX.
- Todo conteúdo e derivado de storage é privado.
- O viewer não é DRM, mas não expõe o original sem permissão.
- Não implementar vídeos, LMS, pagamentos ou outras funcionalidades fora do
MVP antes das fases acima.
