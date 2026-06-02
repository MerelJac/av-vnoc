import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { VnocRole } from '@prisma/client'

const ActionSchema = z.object({
  type: z.enum(['NOTE', 'REBOOT', 'FIRMWARE_PUSH', 'ESCALATE', 'STATUS_CHANGE', 'CONFIG_RESTORE', 'PORTAL_LAUNCH']),
  body: z.string().optional(),
  newStatus: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
})

function canPerformAction(actionType: string, isSuperAdmin: boolean, vnocRole: VnocRole | null): boolean {
  const tier1Actions = new Set(['NOTE', 'REBOOT', 'STATUS_CHANGE', 'PORTAL_LAUNCH'])
  if (tier1Actions.has(actionType)) return true
  if (actionType === 'ESCALATE') return isSuperAdmin || vnocRole === 'TIER2' || vnocRole === 'MANAGER'
  return isSuperAdmin
}

describe('ticket action schema', () => {
  it('accepts a valid NOTE action', () => {
    expect(ActionSchema.safeParse({ type: 'NOTE', body: 'Checked device logs' }).success).toBe(true)
  })
  it('rejects unknown action type', () => {
    expect(ActionSchema.safeParse({ type: 'UNKNOWN_ACTION' }).success).toBe(false)
  })
  it('accepts a STATUS_CHANGE with newStatus', () => {
    expect(ActionSchema.safeParse({ type: 'STATUS_CHANGE', newStatus: 'IN_PROGRESS' }).success).toBe(true)
  })
  it('accepts a PORTAL_LAUNCH action', () => {
    expect(ActionSchema.safeParse({ type: 'PORTAL_LAUNCH', body: 'Poly Lens · device deep-link' }).success).toBe(true)
  })
})

describe('canPerformAction', () => {
  it('allows TIER1 to add notes', () => {
    expect(canPerformAction('NOTE', false, 'TIER1')).toBe(true)
  })
  it('allows TIER1 to reboot', () => {
    expect(canPerformAction('REBOOT', false, 'TIER1')).toBe(true)
  })
  it('does not allow TIER1 to escalate', () => {
    expect(canPerformAction('ESCALATE', false, 'TIER1')).toBe(false)
  })
  it('allows TIER2 to escalate', () => {
    expect(canPerformAction('ESCALATE', false, 'TIER2')).toBe(true)
  })
  it('allows superAdmin to do anything', () => {
    expect(canPerformAction('ESCALATE', true, null)).toBe(true)
    expect(canPerformAction('FIRMWARE_PUSH', true, null)).toBe(true)
  })
  it('allows TIER1 to launch a portal', () => {
    expect(canPerformAction('PORTAL_LAUNCH', false, 'TIER1')).toBe(true)
  })
})
