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
vi.mock('@/lib/integrations/logitech-sync', () => ({
  createLogiSyncAdapter: vi.fn(),
}))
vi.mock('@/lib/integrations/utelogy', () => ({
  createUtelogyAdapter: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { createPolyLensAdapter } from '@/lib/integrations/poly-lens'
import { createYealinkAdapter } from '@/lib/integrations/yealink'
import { createLogiSyncAdapter } from '@/lib/integrations/logitech-sync'
import { createUtelogyAdapter } from '@/lib/integrations/utelogy'
import { syncAllDevices } from '@/lib/integrations/sync'

const makeAdapter = (devices: unknown[]) => ({
  syncDevices: vi.fn().mockResolvedValue(devices),
  fetchRecentAlerts: vi.fn(),
  normalizeWebhookPayload: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  rebootDevice: vi.fn(),
})

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

    vi.mocked(createLogiSyncAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createUtelogyAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(prisma.device.upsert).mockResolvedValue({} as any)

    await syncAllDevices()

    expect(prisma.device.upsert).toHaveBeenCalledTimes(2)
  })

  it('syncs Utelogy devices and records its init failures independently', async () => {
    vi.mocked(createPolyLensAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createYealinkAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createLogiSyncAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createUtelogyAdapter).mockResolvedValue(
      makeAdapter([
        {
          platform: 'UTELOGY' as const,
          platformId: 'ute-1',
          name: 'Boardroom Codec',
          status: 'online' as const,
          rawPayload: {},
        },
      ]) as any
    )
    vi.mocked(prisma.device.upsert).mockResolvedValue({} as any)

    const result = await syncAllDevices()

    expect(createUtelogyAdapter).toHaveBeenCalledOnce()
    expect(result.synced).toBe(1)

    vi.clearAllMocks()
    vi.mocked(createPolyLensAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createYealinkAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createLogiSyncAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createUtelogyAdapter).mockRejectedValue(new Error('bad baseUrl'))

    const failed = await syncAllDevices()
    expect(failed.errors.some((e) => e.includes('Utelogy'))).toBe(true)
  })

  it('syncs Logitech Sync devices alongside the other adapters', async () => {
    vi.mocked(createPolyLensAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createYealinkAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createUtelogyAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createLogiSyncAdapter).mockResolvedValue(
      makeAdapter([
        {
          platform: 'LOGITECH_SYNC' as const,
          platformId: 'logi-1',
          name: 'Rally Bar',
          status: 'online' as const,
          rawPayload: {},
        },
      ]) as any
    )
    vi.mocked(prisma.device.upsert).mockResolvedValue({} as any)

    const result = await syncAllDevices()

    expect(createLogiSyncAdapter).toHaveBeenCalledOnce()
    expect(prisma.device.upsert).toHaveBeenCalledTimes(1)
    expect(result.synced).toBe(1)
  })

  it('records Logitech init failure in errors without blocking other adapters', async () => {
    vi.mocked(createPolyLensAdapter).mockResolvedValue(
      makeAdapter([
        { platform: 'POLY_LENS' as const, platformId: 'p1', name: 'X50', status: 'online' as const, rawPayload: {} },
      ]) as any
    )
    vi.mocked(createYealinkAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createLogiSyncAdapter).mockRejectedValue(new Error('cert missing'))
    vi.mocked(createUtelogyAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(prisma.device.upsert).mockResolvedValue({} as any)

    const result = await syncAllDevices()

    expect(result.synced).toBe(1)
    expect(result.errors.some((e) => e.includes('LogitechSync'))).toBe(true)
  })
})
