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

describe('processAlert - Pass 2: Alert persistence with autoCloseAt', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a new alert with autoCloseAt 60s after receivedAt', async () => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.device.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.alert.count).mockResolvedValue(0)
    vi.mocked(prisma.alertGroup.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.alertGroup.create).mockResolvedValue({ id: 'group-1' } as any)
    vi.mocked(prisma.alert.create).mockResolvedValue({
      id: 'new-alert-1',
      roomId: null,
      title: 'Device offline: Poly X50',
      severity: 'HIGH',
    } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)
    vi.mocked(prisma.ticket.create).mockResolvedValue({ id: 'ticket-1', title: 'Device offline', priority: 'P2' } as any)
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as any)

    const receivedAt = new Date('2026-05-27T10:00:00Z')
    await processAlert(makeAlert({ receivedAt }))

    const createCall = vi.mocked(prisma.alert.create).mock.calls[0][0]
    const autoCloseAt = createCall.data.autoCloseAt as Date
    expect(autoCloseAt.getTime()).toBe(receivedAt.getTime() + 60_000)
  })
})
