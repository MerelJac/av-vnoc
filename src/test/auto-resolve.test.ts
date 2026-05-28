import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    alert: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    device: {
      findUnique: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/sse-bus', () => ({
  emitSseEvent: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { emitSseEvent } from '@/lib/sse-bus'
import { runAutoResolveSweep } from '@/lib/correlation'

describe('runAutoResolveSweep', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves alerts where autoCloseAt has passed and device is back online', async () => {
    const pastTime = new Date(Date.now() - 120_000)
    vi.mocked(prisma.alert.findMany).mockResolvedValue([
      { id: 'alert-1', deviceId: 'device-1', autoCloseAt: pastTime } as any,
    ])
    vi.mocked(prisma.device.findUnique).mockResolvedValue({ status: 'online' } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as any)

    const result = await runAutoResolveSweep()

    expect(prisma.alert.update).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: { status: 'AUTO_RESOLVED', resolvedAt: expect.any(Date) },
    })
    expect(emitSseEvent).toHaveBeenCalledWith('alert_resolved', expect.objectContaining({ id: 'alert-1' }))
    expect(result.resolved).toBe(1)
  })

  it('skips alerts where device is still offline', async () => {
    const pastTime = new Date(Date.now() - 120_000)
    vi.mocked(prisma.alert.findMany).mockResolvedValue([
      { id: 'alert-2', deviceId: 'device-2', autoCloseAt: pastTime } as any,
    ])
    vi.mocked(prisma.device.findUnique).mockResolvedValue({ status: 'offline' } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as any)

    const result = await runAutoResolveSweep()

    expect(prisma.alert.update).not.toHaveBeenCalled()
    expect(result.resolved).toBe(0)
  })

  it('skips alerts with no associated device', async () => {
    const pastTime = new Date(Date.now() - 120_000)
    vi.mocked(prisma.alert.findMany).mockResolvedValue([
      { id: 'alert-3', deviceId: null, autoCloseAt: pastTime } as any,
    ])
    vi.mocked(prisma.device.findUnique).mockResolvedValue(null)

    const result = await runAutoResolveSweep()

    expect(prisma.alert.update).not.toHaveBeenCalled()
    expect(result.resolved).toBe(0)
  })
})
