import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getEffectiveAccess,
  listAccessRules,
  upsertAccessRule,
} from './access-rules-api'
import type { AccessRule } from './access-rules-types'

const viewRule = {
  id: 4,
  userId: 12,
  resourceType: 'MODULE',
  resourceId: 7,
  capability: 'VIEW',
  effect: 'ALLOW',
  startsAt: '2026-09-06T12:00:00.000Z',
  expiresAt: null,
  createdAt: '2026-09-06T12:00:00.000Z',
  updatedAt: '2026-09-06T12:00:00.000Z',
} satisfies AccessRule

function mockApi(body: unknown) {
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
  const fetchMock = vi.fn().mockResolvedValue(Response.json(body))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('access-rules API', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('reads only the selected direct-rule target', async () => {
    const fetchMock = mockApi({ data: [viewRule] })

    await expect(
      listAccessRules({
        userId: 12,
        resource: { type: 'MODULE', id: 7 },
      }),
    ).resolves.toEqual([viewRule])

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/access-rules?userId=12&resourceType=MODULE&resourceId=7',
    )
  })

  it('serializes one capability rule and reads its safe effective decision', async () => {
    const fetchMock = mockApi({ data: viewRule })

    await expect(
      upsertAccessRule({
        userId: 12,
        resourceType: 'MODULE',
        resourceId: 7,
        capability: 'VIEW',
        effect: 'ALLOW',
        startsAt: '2026-09-06T12:00:00.000Z',
        expiresAt: null,
      }),
    ).resolves.toEqual(viewRule)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({
        userId: 12,
        resourceType: 'MODULE',
        resourceId: 7,
        capability: 'VIEW',
        effect: 'ALLOW',
        startsAt: '2026-09-06T12:00:00.000Z',
        expiresAt: null,
      }),
    })

    fetchMock.mockResolvedValueOnce(
      Response.json({
        data: {
          view: {
            allowed: true,
            decision: 'ALLOW',
            source: 'MODULE',
            ruleId: 4,
          },
          download: {
            allowed: false,
            decision: 'DENY',
            source: 'DEFAULT',
            ruleId: null,
          },
        },
      }),
    )
    await expect(
      getEffectiveAccess({
        userId: 12,
        resource: { type: 'MODULE', id: 7 },
      }),
    ).resolves.toEqual({
      view: { allowed: true, decision: 'ALLOW', source: 'MODULE', ruleId: 4 },
      download: {
        allowed: false,
        decision: 'DENY',
        source: 'DEFAULT',
        ruleId: null,
      },
    })
  })
})
