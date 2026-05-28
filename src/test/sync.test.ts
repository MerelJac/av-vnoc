import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    device: { upsert: vi.fn() },
  },
}))
vi.mock('@/lib/integrations/poly-lens', () => ({
  createPolyLensAdapter: vi.fn(),
}))
vi.mock('@/lib/integrations/yealink', () => ({
  createYealinkAdapter: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { createPolyLensAdapter } from '@/lib/integrations/poly-lens'
import { createYealinkAdapter } from '@/lib/integrations/yealink'
import { syncAllDevices } from '@/lib/integrations/sync'

describe('syncAllDevices', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts each device returned by adapters', async () => {
    const mockPolyDevice = {
      platform: 'POLY_LENS' as const,
      platformId: 'poly-1',
      name: 'Poly X50',
      status: 'online' as const,
      rawPayload: {},
    }
    const mockYealinkDevice = {
      platform: 'YEALINK_YMCS' as const,
      platformId: 'yk-1',
      name: 'Yealink CP960',
      status: 'offline' as const,
      rawPayload: {},
    }

    vi.mocked(createPolyLensAdapter).mockResolvedValue({
      syncDevices: vi.fn().mockResolvedValue([mockPolyDevice]),
      fetchRecentAlerts: vi.fn(),
      normalizeWebhookPayload: vi.fn(),
      verifyWebhookSignature: vi.fn(),
      rebootDevice: vi.fn(),
    })
    vi.mocked(createYealinkAdapter).mockResolvedValue({
      syncDevices: vi.fn().mockResolvedValue([mockYealinkDevice]),
      fetchRecentAlerts: vi.fn(),
      normalizeWebhookPayload: vi.fn(),
      verifyWebhookSignature: vi.fn(),
      rebootDevice: vi.fn(),
    })

    vi.mocked(prisma.device.upsert).mockResolvedValue({} as any)

    await syncAllDevices()

    expect(prisma.device.upsert).toHaveBeenCalledTimes(2)
  })
})
