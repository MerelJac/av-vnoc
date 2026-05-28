import { describe, it, expect } from 'vitest'
import { VnocRole } from '@prisma/client'

function canAccessCustomers(isSuperAdmin: boolean, vnocRole: VnocRole | null): boolean {
  return isSuperAdmin || vnocRole === 'MANAGER' || vnocRole === 'TIER2'
}

describe('role access helpers', () => {
  it('superAdmin can access customers', () => {
    expect(canAccessCustomers(true, null)).toBe(true)
  })

  it('MANAGER can access customers', () => {
    expect(canAccessCustomers(false, 'MANAGER')).toBe(true)
  })

  it('TIER1 cannot access customers', () => {
    expect(canAccessCustomers(false, 'TIER1')).toBe(false)
  })

  it('user with no role cannot access customers', () => {
    expect(canAccessCustomers(false, null)).toBe(false)
  })
})
