# Permissões hierárquicas — Design

## Objetivo

Permitir que ADMIN conceda, negue, herde e revogue permissões individuais de
alunos para `VIEW` e `DOWNLOAD` em Course, Module e Material. Toda decisão é
centralizada em `AccessControlService`; a ausência de decisão válida é sempre
negação. Esta fase não entrega arquivos, viewers, downloads ou catálogo ao
aluno.

## Escopo e decisões

- Regras são exclusivamente por usuário individual no MVP; não há grupos ou
  turmas.
- Recursos autorizáveis: `COURSE`, `MODULE` e `MATERIAL`.
- Capacidades independentes: `VIEW` e `DOWNLOAD`.
- Efeitos: `ALLOW`, `DENY` e `INHERIT`.
- Há no máximo uma regra por usuário, recurso e capacidade. Atualizar altera
  essa regra; revogar a remove.
- Janelas usam UTC e são válidas quando
  `starts_at <= agora < expires_at`. Sem início vale imediatamente; sem fim é
  permanente.
- ADMIN pode administrar regras. Não há endpoint de decisão para aluno nesta
  fase; Fases 6 e 7 consumirão o serviço central.

## Persistência

`access_rules` possui:

```text
id
user_id                 # FK users, somente STUDENT validado no serviço
resource_type           # COURSE | MODULE | MATERIAL
resource_id
capability              # VIEW | DOWNLOAD
effect                  # ALLOW | DENY | INHERIT
starts_at               # nullable UTC
expires_at              # nullable UTC
created_at
updated_at
```

Índice único: `(user_id, resource_type, resource_id, capability)`.

O banco valida os enums e, quando ambas datas existem,
`expires_at > starts_at`. A integridade do recurso polimórfico é validada no
serviço usando os modelos Course, CourseModule e Material; toda regra aponta
para recurso existente.

## Resolução centralizada

`AccessControlService` recebe `{ userId, resource, capability, now }` e retorna
um resultado explicável: `allowed`, `decision`, `source`, `ruleId` opcional.

Para Course, consulta a própria regra. Para Module: Module, depois Course. Para
Material: Material, depois Module e Course. A primeira regra válida e explícita
(`ALLOW` ou `DENY`) decide. `INHERIT`, regra futura ou expirada são ignoradas e
a busca continua. Sem regra explícita válida, retorna `DENY` com fonte
`DEFAULT`.

`VIEW` e `DOWNLOAD` nunca se implicam: ambos são calculados com chamadas
independentes ao serviço. Nenhum controller pode reproduzir a lógica de
herança.

## API administrativa

Todas as rotas usam sessão ativa, CSRF, `auth` e `admin`:

```text
GET    /api/v1/access-rules?userId=&resourceType=&resourceId=
PUT    /api/v1/access-rules
DELETE /api/v1/access-rules/:id
GET    /api/v1/access-rules/effective?userId=&resourceType=&resourceId=
```

`PUT` recebe um único contrato:

```json
{
  "userId": 12,
  "resourceType": "MODULE",
  "resourceId": 7,
  "capability": "VIEW",
  "effect": "ALLOW",
  "startsAt": "2026-09-06T12:00:00.000Z",
  "expiresAt": null
}
```

A resposta nunca expõe `storage_key`, URL, conteúdo binário, segredo ou
derivados. A consulta `effective` é administrativa e mostra a decisão e a
fonte por capacidade, para reduzir configurações incorretas.

## Interface administrativa

O admin ganha uma área de permissões no detalhe do curso, módulo e material.
Ela permite escolher aluno e configurar `VIEW` e `DOWNLOAD` separadamente,
com `Permitir`, `Negar` ou `Herdar`, mais janela opcional de início/fim.

O painel mostra a regra direta e a decisão efetiva/fonte. Não há menu, rota,
requisição ou componente de permissões na área do aluno.

## Testes e critérios de aceite

- Default deny para toda capacidade/recurso sem regra válida.
- Material > Module > Course; `DENY` específico substitui `ALLOW` herdado.
- `INHERIT`, início futuro e expiração não decidem e permitem continuar a
  herança.
- `VIEW` e `DOWNLOAD` são independentes.
- Índice único, datas inválidas e recurso/aluno inexistentes são rejeitados.
- Apenas ADMIN administra/inspeciona regras; aluno e anônimo são rejeitados.
- UI usa shadcn, mostra efeitos/decisão efetiva e não expõe conteúdo privado.
- Testes, typecheck, lint e build passam na API e Web.

## Fora de escopo

- Grupos, turmas, papéis adicionais, compartilhamento e regras globais.
- Endpoints de arquivo, viewer, download ou URL temporária.
- Filtragem do catálogo/portal de aluno e auditoria de acesso; pertencem às
  Fases 6 e 7.
