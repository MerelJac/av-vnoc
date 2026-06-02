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
      count: vi.fn(),
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
    appConfig: {
      findUnique: vi.fn(),
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
    vi.mocked(prisma.device.findUnique).mockResolvedValue({
      id: 'device-1',
      roomId: 'room-1',
      room: { id: 'room-1', siteId: 'site-1', site: { id: 'site-1', customerId: 'customer-1', customer: { id: 'customer-1', name: 'Acme' } } },
    } as any)
    vi.mocked(prisma.alert.count).mockResolvedValue(0)
    vi.mocked(prisma.alertGroup.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.alertGroup.create).mockResolvedValue({ id: 'group-1' } as any)
    vi.mocked(prisma.alert.create).mockResolvedValue({
      id: 'new-alert-1',
      roomId: 'room-1',
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

describe('processAlert - Pass 3: Pattern grouping', () => {
  beforeEach(() => vi.clearAllMocks())

  const setupMocks = (recentRoomAlertCount: number) => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.device.findUnique).mockResolvedValue({
      id: 'device-1',
      roomId: 'room-1',
      room: {
        id: 'room-1',
        siteId: 'site-1',
        site: {
          id: 'site-1',
          customerId: 'customer-1',
          customer: { id: 'customer-1', name: 'Acme' },
        },
      },
    } as any)
    vi.mocked(prisma.alert.create).mockResolvedValue({ id: 'new-alert-1', roomId: 'room-1', title: 'Device offline', severity: 'HIGH', description: null } as any)
    vi.mocked(prisma.alert.count).mockResolvedValue(recentRoomAlertCount)
    vi.mocked(prisma.alertGroup.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.alertGroup.create).mockResolvedValue({ id: 'group-1' } as any)
    vi.mocked(prisma.alertGroup.count).mockResolvedValue(0)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)
    vi.mocked(prisma.ticket.create).mockResolvedValue({ id: 'ticket-1', title: 'Device offline', priority: 'P2' } as any)
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as any)
  }

  it('creates DEVICE_FAULT group when only 1 device alert in room', async () => {
    setupMocks(0) // no other recent alerts in room

    await processAlert(makeAlert())

    const createCalls = vi.mocked(prisma.alertGroup.create).mock.calls
    expect(createCalls[0][0].data.type).toBe('DEVICE_FAULT')
  })

  it('creates ROOM_OUTAGE group when 2+ devices alert in same room', async () => {
    setupMocks(1) // one other recent alert in room

    await processAlert(makeAlert())

    const createCalls = vi.mocked(prisma.alertGroup.create).mock.calls
    expect(createCalls[0][0].data.type).toBe('ROOM_OUTAGE')
  })
})

describe('processAlert - Ticket auto-creation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a P1 ticket with 1h SLA for CRITICAL alert', async () => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.device.findUnique).mockResolvedValue({
      id: 'device-1',
      roomId: 'room-1',
      room: { id: 'room-1', siteId: 'site-1', site: { id: 'site-1', customerId: 'customer-1', customer: { id: 'customer-1', name: 'Acme' } } },
    } as any)
    vi.mocked(prisma.alert.create).mockResolvedValue({ id: 'alert-1', roomId: 'room-1', title: 'Critical alert', severity: 'CRITICAL', description: null } as any)
    vi.mocked(prisma.alert.count).mockResolvedValue(0)
    vi.mocked(prisma.alertGroup.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.alertGroup.create).mockResolvedValue({ id: 'group-1' } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)
    vi.mocked(prisma.ticket.create).mockResolvedValue({ id: 'ticket-1', title: 'Critical alert', priority: 'P1' } as any)
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as any)

    const before = Date.now()
    await processAlert(makeAlert({ severity: 'CRITICAL' as AlertSeverity }))
    const after = Date.now()

    const ticketCall = vi.mocked(prisma.ticket.create).mock.calls[0][0]
    expect(ticketCall.data.priority).toBe('P1')

    const slaMs = (ticketCall.data.slaDeadline as Date).getTime()
    expect(slaMs).toBeGreaterThanOrEqual(before + 3_600_000 - 100)
    expect(slaMs).toBeLessThanOrEqual(after + 3_600_000 + 100)
  })

  it('derives priority and SLA deadline from AppConfig overrides', async () => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.device.findUnique).mockResolvedValue({
      id: 'device-1',
      roomId: 'room-1',
      room: { id: 'room-1', siteId: 'site-1', site: { id: 'site-1', customerId: 'customer-1', customer: { id: 'customer-1', name: 'Acme' } } },
    } as any)
    vi.mocked(prisma.alert.create).mockResolvedValue({ id: 'alert-1', roomId: 'room-1', title: 'Critical alert', severity: 'CRITICAL', description: null } as any)
    vi.mocked(prisma.alert.count).mockResolvedValue(0)
    vi.mocked(prisma.alertGroup.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.alertGroup.create).mockResolvedValue({ id: 'group-1' } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)
    vi.mocked(prisma.ticket.create).mockResolvedValue({ id: 'ticket-1', title: 'Critical alert', priority: 'P2' } as any)
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as any)

    // CRITICAL → P2 (override), P2 SLA = 5 minutes (override)
    vi.mocked(prisma.appConfig.findUnique).mockImplementation((args: any) => {
      if (args.where.key === 'sla') {
        return Promise.resolve({ key: 'sla', value: { P1: 60, P2: 5, P3: 480, P4: 1440, autoResolveHours: 24 } }) as any
      }
      if (args.where.key === 'routing') {
        return Promise.resolve({ key: 'routing', value: { severityToPriority: { CRITICAL: 'P2', HIGH: 'P2', MEDIUM: 'P3', LOW: 'P4', INFO: 'P4' } } }) as any
      }
      return Promise.resolve(null) as any
    })

    const before = Date.now()
    await processAlert(makeAlert({ severity: 'CRITICAL' as AlertSeverity }))
    const after = Date.now()

    const ticketCall = vi.mocked(prisma.ticket.create).mock.calls[0][0]
    expect(ticketCall.data.priority).toBe('P2')

    const slaMs = (ticketCall.data.slaDeadline as Date).getTime()
    expect(slaMs).toBeGreaterThanOrEqual(before + 5 * 60_000 - 100)
    expect(slaMs).toBeLessThanOrEqual(after + 5 * 60_000 + 100)
  })

  it('emits alert_created and ticket_opened SSE events', async () => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.device.findUnique).mockResolvedValue({
      id: 'device-1',
      roomId: 'room-1',
      room: { id: 'room-1', siteId: 'site-1', site: { id: 'site-1', customerId: 'customer-1', customer: { id: 'customer-1', name: 'Acme' } } },
    } as any)
    vi.mocked(prisma.alert.create).mockResolvedValue({ id: 'alert-1', roomId: 'room-1', title: 'Test', severity: 'HIGH', description: null } as any)
    vi.mocked(prisma.alert.count).mockResolvedValue(0)
    vi.mocked(prisma.alertGroup.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.alertGroup.create).mockResolvedValue({ id: 'group-1' } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)
    vi.mocked(prisma.ticket.create).mockResolvedValue({ id: 'ticket-1', title: 'Test', priority: 'P2' } as any)
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as any)

    await processAlert(makeAlert())

    expect(emitSseEvent).toHaveBeenCalledWith('alert_created', expect.objectContaining({ id: 'alert-1' }))
    expect(emitSseEvent).toHaveBeenCalledWith('ticket_opened', expect.objectContaining({ id: 'ticket-1' }))
  })
})

describe('processAlert - suppression for unassigned devices', () => {
  beforeEach(() => vi.clearAllMocks())

  it('suppresses (no alert/ticket/SSE) when the device is unknown', async () => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.device.findUnique).mockResolvedValue(null)

    const result = await processAlert(makeAlert())

    expect(result.action).toBe('suppressed')
    expect(prisma.alert.create).not.toHaveBeenCalled()
    expect(prisma.ticket.create).not.toHaveBeenCalled()
    expect(emitSseEvent).not.toHaveBeenCalled()
  })

  it('suppresses when the device exists but is not assigned to a room', async () => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.device.findUnique).mockResolvedValue({ id: 'device-1', roomId: null, room: null } as any)

    const result = await processAlert(makeAlert())

    expect(result.action).toBe('suppressed')
    expect(prisma.alert.create).not.toHaveBeenCalled()
    expect(prisma.ticket.create).not.toHaveBeenCalled()
  })
})
