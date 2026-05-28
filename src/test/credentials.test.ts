import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    platformCredential: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getCredential, getWebhookSecret, getConfig, updateConfig } from '@/lib/integrations/credentials'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getCredential', () => {
  it('returns the credential for a platform', async () => {
    vi.mocked(prisma.platformCredential.findUnique).mockResolvedValue({
      id: 'cred-1', platform: 'POLY_LENS', clientId: 'client-id',
      clientSecret: 'client-secret', apiKey: null, webhookSecret: 'wh-secret',
      config: null, createdAt: new Date(), updatedAt: new Date(),
    })
    const cred = await getCredential('POLY_LENS')
    expect(cred?.clientId).toBe('client-id')
    expect(prisma.platformCredential.findUnique).toHaveBeenCalledWith({ where: { platform: 'POLY_LENS' } })
  })

  it('returns null when credential not found', async () => {
    vi.mocked(prisma.platformCredential.findUnique).mockResolvedValue(null)
    const cred = await getCredential('POLY_LENS')
    expect(cred).toBeNull()
  })
})

describe('getWebhookSecret', () => {
  it('throws when no credential configured', async () => {
    vi.mocked(prisma.platformCredential.findUnique).mockResolvedValue(null)
    await expect(getWebhookSecret('POLY_LENS')).rejects.toThrow('POLY_LENS credentials not configured')
  })

  it('throws when webhookSecret is null', async () => {
    vi.mocked(prisma.platformCredential.findUnique).mockResolvedValue({
      id: 'c1', platform: 'POLY_LENS', clientId: null, clientSecret: null,
      apiKey: null, webhookSecret: null, config: null,
      createdAt: new Date(), updatedAt: new Date(),
    })
    await expect(getWebhookSecret('POLY_LENS')).rejects.toThrow('POLY_LENS webhook secret not configured')
  })

  it('returns the webhook secret when configured', async () => {
    vi.mocked(prisma.platformCredential.findUnique).mockResolvedValue({
      id: 'c1', platform: 'POLY_LENS', clientId: null, clientSecret: null,
      apiKey: null, webhookSecret: 'secret-xyz', config: null,
      createdAt: new Date(), updatedAt: new Date(),
    })
    const secret = await getWebhookSecret('POLY_LENS')
    expect(secret).toBe('secret-xyz')
  })
})

describe('getConfig', () => {
  it('returns the config object when credential has config', async () => {
    vi.mocked(prisma.platformCredential.findUnique).mockResolvedValue({
      id: 'c1', platform: 'POLY_LENS', clientId: null, clientSecret: null,
      apiKey: null, webhookSecret: null, config: { orgId: 'org-123' },
      createdAt: new Date(), updatedAt: new Date(),
    })
    const config = await getConfig('POLY_LENS')
    expect(config).toEqual({ orgId: 'org-123' })
  })

  it('returns empty object when credential is not found', async () => {
    vi.mocked(prisma.platformCredential.findUnique).mockResolvedValue(null)
    const config = await getConfig('POLY_LENS')
    expect(config).toEqual({})
  })

  it('returns empty object when config is null', async () => {
    vi.mocked(prisma.platformCredential.findUnique).mockResolvedValue({
      id: 'c1', platform: 'POLY_LENS', clientId: null, clientSecret: null,
      apiKey: null, webhookSecret: null, config: null,
      createdAt: new Date(), updatedAt: new Date(),
    })
    const config = await getConfig('POLY_LENS')
    expect(config).toEqual({})
  })
})

describe('updateConfig', () => {
  it('merges patch into existing config and upserts', async () => {
    vi.mocked(prisma.platformCredential.findUnique).mockResolvedValue({
      id: 'c1', platform: 'POLY_LENS', clientId: null, clientSecret: null,
      apiKey: null, webhookSecret: null, config: { existing: 'value' },
      createdAt: new Date(), updatedAt: new Date(),
    })
    vi.mocked(prisma.platformCredential.upsert).mockResolvedValue({
      id: 'c1', platform: 'POLY_LENS', clientId: null, clientSecret: null,
      apiKey: null, webhookSecret: null, config: { existing: 'value', newKey: 'newVal' },
      createdAt: new Date(), updatedAt: new Date(),
    })

    await updateConfig('POLY_LENS', { newKey: 'newVal' })

    expect(prisma.platformCredential.upsert).toHaveBeenCalledWith({
      where: { platform: 'POLY_LENS' },
      update: { config: { existing: 'value', newKey: 'newVal' } },
      create: { platform: 'POLY_LENS', config: { newKey: 'newVal' } },
    })
  })

  it('upserts with only patch when no existing credential', async () => {
    vi.mocked(prisma.platformCredential.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.platformCredential.upsert).mockResolvedValue({
      id: 'c2', platform: 'POLY_LENS', clientId: null, clientSecret: null,
      apiKey: null, webhookSecret: null, config: { brand: 'new' },
      createdAt: new Date(), updatedAt: new Date(),
    })

    await updateConfig('POLY_LENS', { brand: 'new' })

    expect(prisma.platformCredential.upsert).toHaveBeenCalledWith({
      where: { platform: 'POLY_LENS' },
      update: { config: { brand: 'new' } },
      create: { platform: 'POLY_LENS', config: { brand: 'new' } },
    })
  })
})
