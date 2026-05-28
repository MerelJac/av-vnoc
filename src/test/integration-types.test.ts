import { describe, it, expect } from 'vitest'
import { isNormalizedAlert, isNormalizedDevice } from '@/lib/integrations/types'

describe('isNormalizedAlert', () => {
  it('returns true for a valid alert shape', () => {
    const alert = {
      platform: 'POLY_LENS' as const,
      platformAlertId: 'alert-123',
      platformDeviceId: 'device-456',
      severity: 'HIGH' as const,
      title: 'Device offline',
      rawPayload: {},
      receivedAt: new Date(),
    }
    expect(isNormalizedAlert(alert)).toBe(true)
  })

  it('returns false when required field is missing', () => {
    expect(isNormalizedAlert({ platform: 'POLY_LENS' })).toBe(false)
  })
})

describe('isNormalizedDevice', () => {
  it('returns true for a valid device shape', () => {
    const device = {
      platform: 'POLY_LENS' as const,
      platformId: 'device-1',
      name: 'Poly Studio X50',
      status: 'online' as const,
      rawPayload: {},
    }
    expect(isNormalizedDevice(device)).toBe(true)
  })
})
