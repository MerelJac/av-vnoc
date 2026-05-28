import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    alert: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    alertGroup: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    device: {
      findUnique: vi.fn(),
    },
    ticket: {
      create: vi.fn(),
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
import { processAlert } from '@/lib/correlation'
import type { Platform, AlertSeverity } from '@prisma/client'

const makeAlert = (overrides = {}) => ({
  platform: 'POLY_LENS' as Platform,
  platformAlertId: 'alert-001',
  platformDeviceId: 'device-001',
  severity: 'HIGH' as AlertSeverity,
  title: 'Device offline: Poly X50',
  rawPayload: {},
  receivedAt: new Date('2026-05-27T10:00:00Z'),
  ...overrides,
})

describe('processAlert - Pass 1: Dedup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns deduped when an ACTIVE alert with same platformAlertId exists', async () => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue({
      id: 'existing-alert-1',
      platform: 'POLY_LENS',
      platformAlertId: 'alert-001',
      status: 'ACTIVE',
    } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)

    const result = await processAlert(makeAlert())

    expect(result.action).toBe('deduped')
    expect(result.alertId).toBe('existing-alert-1')
    expect(prisma.alert.create).not.toHaveBeenCalled()
    expect(prisma.ticket.create).not.toHaveBeenCalled()
  })

  it('updates receivedAt on the existing alert when deduped', async () => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue({
      id: 'existing-alert-1',
      platform: 'POLY_LENS',
      platformAlertId: 'alert-001',
      status: 'ACTIVE',
    } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)

    await processAlert(makeAlert())

    expect(prisma.alert.update).toHaveBeenCalledWith({
      where: { id: 'existing-alert-1' },
      data: { receivedAt: expect.any(Date) },
    })
  })
})
