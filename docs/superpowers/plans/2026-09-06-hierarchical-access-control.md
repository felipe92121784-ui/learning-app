# Permissões hierárquicas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que ADMIN gerencie regras individuais de VIEW/DOWNLOAD com herança Course→Module→Material e default deny.

**Architecture:** `AccessRule` persiste regras polimórficas individuais. `AccessControlService` é a única fonte de decisão, percorrendo o recurso mais específico até o curso e aplicando a primeira regra explícita válida. API e Web administrativos apenas administram/explicam regras; não entregam conteúdo.

**Tech Stack:** AdonisJS, Lucid/PostgreSQL, VineJS, Japa, React, TanStack Query/Router, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-hierarchical-access-control-design.md`

## Global Constraints

- Regras são somente por aluno individual; não adicionar grupos/turmas.
- Tipos COURSE/MODULE/MATERIAL; capacidades VIEW/DOWNLOAD; efeitos ALLOW/DENY/INHERIT.
- Uma regra por usuário/recurso/capacidade; ausência ou INHERIT inválido resulta default DENY.
- Regra válida usa UTC: `startsAt <= now < expiresAt`.
- Especificidade: MATERIAL, depois MODULE, depois COURSE.
- API decide somente por `AccessControlService`; nenhum controller duplica herança.
- Todas as rotas de regra exigem sessão, CSRF, auth e ADMIN.
- Não criar viewer, download, URL assinada, conteúdo de storage ou rota/UI de aluno.
- Git está inválido; não criar commits/worktrees. Validar com testes, tipos, lint e build.

---

### Task 1: Modelo, migrations e resolvedor central

**Files:**
- Create: `api/database/migrations/*_create_access_rules_table.ts`
- Create: `api/app/models/access_rule.ts`
- Create: `api/app/services/access_control_service.ts`
- Modify: `api/app/models/user.ts`, `api/app/models/course.ts`, `api/app/models/course_module.ts`, `api/app/models/material.ts`
- Test: `api/tests/unit/access_control_service.spec.ts`, `api/tests/functional/access_rules.spec.ts`

**Interfaces:**
- Produces `AccessRule` and `AccessControlService.resolve({ userId, resourceType, resourceId, capability, now })`.
- `resolve` returns `{ allowed: boolean, decision: 'ALLOW' | 'DENY', source: 'COURSE' | 'MODULE' | 'MATERIAL' | 'DEFAULT', ruleId: number | null }`.

- [ ] **Step 1: Write failing resolution tests**

```ts
test('uses the most specific valid explicit rule and otherwise defaults to deny', async ({ assert }) => {
  await rule({ resourceType: 'COURSE', resourceId: course.id, capability: 'VIEW', effect: 'ALLOW' })
  await rule({ resourceType: 'MODULE', resourceId: module.id, capability: 'VIEW', effect: 'DENY' })
  assert.deepInclude(await access.resolve({ userId: student.id, resourceType: 'MATERIAL', resourceId: material.id, capability: 'VIEW', now }), { allowed: false, source: 'MODULE' })
})

test('ignores inherit, future and expired rules and resolves VIEW independently from DOWNLOAD', async ({ assert }) => {
  // create INHERIT, startsAt > now and expiresAt <= now; assert default DENY.
  // then ALLOW only DOWNLOAD and assert VIEW remains DENY.
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd api && npm test -- unit --files=tests/unit/access_control_service.spec.ts`

Expected: FAIL because AccessRule and AccessControlService do not exist.

- [ ] **Step 3: Implement schema, model and deterministic resolution**

```ts
export const ACCESS_RESOURCE_TYPES = ['COURSE', 'MODULE', 'MATERIAL'] as const
export const ACCESS_CAPABILITIES = ['VIEW', 'DOWNLOAD'] as const
export const ACCESS_EFFECTS = ['ALLOW', 'DENY', 'INHERIT'] as const

async resolve(input: ResolveAccessInput): Promise<AccessDecision> {
  const chain = await this.resourceChain(input.resourceType, input.resourceId)
  for (const resource of chain) {
    const rule = await AccessRule.query().where({ userId: input.userId, resourceType: resource.type, resourceId: resource.id, capability: input.capability }).first()
    if (rule && isValidAt(rule, input.now) && rule.effect !== 'INHERIT') return decisionFrom(rule)
  }
  return { allowed: false, decision: 'DENY', source: 'DEFAULT', ruleId: null }
}
```

Migration: enum/check constraints, unique `(user_id, resource_type, resource_id, capability)`, date check `expires_at > starts_at` when both present. Resolve resource chain by loading Module→Course and Material→Module→Course; reject nonexistent resource. Validate student status/role in rule-management service, not resolver.

- [ ] **Step 4: Run Task 1 verification**

Run: `cd api && npm test -- unit --files=tests/unit/access_control_service.spec.ts --files=tests/functional/access_rules.spec.ts && npm run typecheck && npm run lint`

Expected: hierarchy, time window, default deny and independent capability tests pass.

---

### Task 2: API administrativa de regras e decisão efetiva

**Files:**
- Create: `api/app/controllers/access_rules_controller.ts`
- Create: `api/app/validators/access_rule.ts`
- Create: `api/app/transformers/access_rule_transformer.ts`
- Modify: `api/start/routes.ts`
- Modify: `api/tests/functional/access_rules.spec.ts`

**Interfaces:**
- Consumes Task 1 service/model.
- Produces GET, PUT, DELETE rules and GET effective endpoints from spec.

- [ ] **Step 1: Write failing auth/CRUD tests**

```ts
test('admin upserts a time-bounded module VIEW rule and receives only safe metadata', async ({ client, assert }) => {
  const response = await csrfAdmin(client).put('/api/v1/access-rules').json({ userId: student.id, resourceType: 'MODULE', resourceId: module.id, capability: 'VIEW', effect: 'ALLOW', startsAt, expiresAt })
  response.assertStatus(200)
  assert.notProperty(response.body().data, 'storageKey')
})

test('student and guest cannot administer or inspect effective access', async ({ client }) => {
  ;(await client.get('/api/v1/access-rules/effective?userId=1&resourceType=COURSE&resourceId=1')).assertStatus(302)
  ;(await studentClient.get('/api/v1/access-rules')).assertStatus(403)
})
```

- [ ] **Step 2: Run focused API tests and verify RED**

Run: `cd api && npm test -- functional --files=tests/functional/access_rules.spec.ts`

Expected: FAIL because routes/controller/validator do not exist.

- [ ] **Step 3: Implement guarded endpoints**

```ts
router.group(() => {
  router.get('access-rules', [controllers.AccessRules, 'index'])
  router.put('access-rules', [controllers.AccessRules, 'upsert'])
  router.delete('access-rules/:id', [controllers.AccessRules, 'destroy'])
  router.get('access-rules/effective', [controllers.AccessRules, 'effective'])
}).use(middleware.auth({ guards: ['web'] })).use(middleware.admin())
```

Use Vine to validate enum values, positive IDs, ISO UTC datetimes and ordered dates. `upsert` verifies USER is STUDENT and target exists, updates/creates one unique rule. `effective` invokes only AccessControlService once per capability. Serialize safe direct-rule fields and effective source/decision; never query material storage/derivatives.

- [ ] **Step 4: Run Task 2 verification**

Run: `cd api && npm test -- functional --files=tests/functional/access_rules.spec.ts && npm run typecheck && npm run lint && npm run build`

Expected: CRUD, windows, roles, CSRF and safe effective responses pass.

---

### Task 3: Feature Web de regras e decisão efetiva

**Files:**
- Create: `web/src/features/access-rules/access-rules-types.ts`
- Create: `web/src/features/access-rules/access-rules-api.ts`
- Create: `web/src/features/access-rules/access-rules-queries.ts`
- Create: `web/src/features/access-rules/access-rule-form.tsx`
- Create: `web/src/features/access-rules/effective-access-summary.tsx`
- Test: adjacent `*.test.ts` / `*.test.tsx`

**Interfaces:**
- Consumes Task 2 safe envelopes.
- Produces hooks/components that receive a selected `userId`, resource type/id.

- [ ] **Step 1: Write failing API/form tests**

```tsx
it('sends independent VIEW and DOWNLOAD rule payloads with optional UTC dates', async () => {
  render(<AccessRuleForm userId={12} resource={{ type: 'MODULE', id: 7 }} />)
  await userEvent.selectOptions(screen.getByLabelText(/visualização/i), 'ALLOW')
  await userEvent.selectOptions(screen.getByLabelText(/download/i), 'DENY')
  await userEvent.click(screen.getByRole('button', { name: /salvar permissões/i }))
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/access-rules'), expect.objectContaining({ method: 'PUT' }))
})
```

- [ ] **Step 2: Run focused Web tests and verify RED**

Run: `cd web && npm test -- src/features/access-rules --reporter=dot`

Expected: FAIL because feature files do not exist.

- [ ] **Step 3: Implement API/cache/shadcn components**

Use existing `apiClient`, TanStack Query invalidation and shadcn controls. Render effects as `Permitir`, `Negar`, `Herdar`; expose start/end inputs in UTC ISO format and validate end after start locally. The effective summary renders source/decision per capability; it never renders a link, URL, content or storage field.

- [ ] **Step 4: Run Task 3 verification**

Run: `cd web && npm test -- src/features/access-rules --reporter=dot && npm run typecheck && npm run lint`

Expected: feature tests, types and lint pass.

---

### Task 4: Integração administrativa e regressão

**Files:**
- Modify: `web/src/routes/_admin/admin/courses/$courseId.tsx`
- Modify: `web/src/routes/_admin/admin/courses/-courses-routes.test.tsx`
- Modify: `web/src/routeTree.gen.ts` only through generator if required
- Test: route tests plus API final test suite

**Interfaces:**
- Consumes Task 3 components and inherited admin guard.
- Produces an admin-only permission section for course, each module and material context.

- [ ] **Step 1: Write failing admin route tests**

```tsx
it('renders permission controls for an admin course without introducing a student permission route', async () => {
  renderAdminCourses('/admin/courses/9')
  expect(await screen.findByRole('button', { name: /gerenciar permissões/i })).toBeTruthy()
  expect(router.routeTree.toString()).not.toContain('/app/access-rules')
})
```

- [ ] **Step 2: Run route test and verify RED**

Run: `cd web && npm test -- src/routes/_admin/admin/courses/-courses-routes.test.tsx --reporter=dot`

Expected: FAIL because integration is absent.

- [ ] **Step 3: Integrate without student surface**

Add a shadcn Dialog launched from course/module/material admin context. It selects an existing student, composes `AccessRuleForm` and `EffectiveAccessSummary`, and closes only after successful save. Keep existing upload/module/material workflows intact. Do not add navigation, route, query or control below student layouts.

- [ ] **Step 4: Run full acceptance verification**

Run: `cd web && npm test && npm run typecheck && npm run lint && npm run build && cd ../api && npm test && npm run typecheck && npm run lint && npm run build`

Expected: all checks pass; no student endpoint/UI or content delivery exists.

## Self-review

- Task 1 covers persistent rule constraints and the only hierarchy resolver.
- Task 2 covers ADMIN/CSRF API and safe effective explanations.
- Task 3 covers typed Web clients/forms and independent capabilities.
- Task 4 composes controls only under admin and verifies student isolation.
