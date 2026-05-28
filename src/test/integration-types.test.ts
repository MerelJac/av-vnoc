import { describe, it, expect } from 'vitest'
import { isNormalizedAlert, isNormalizedDevice } from '@/lib/integrations/types'

const validAlert = {
  platform: 'POLY_LENS' as const,
  platformAlertId: 'alert-123',
  platformDeviceId: 'device-456',
  severity: 'HIGH' as const,
  title: 'Device offline',
  rawPayload: {},
  receivedAt: new Date(),
}

describe('isNormalizedAlert', () => {
  it('returns true for a valid alert shape', () => {
    expect(isNormalizedAlert(validAlert)).toBe(true)
  })

  it('returns false when platform is missing', () => {
    const { platform: _p, ...rest } = validAlert
    expect(isNormalizedAlert(rest)).toBe(false)
  })

  it('returns false when platformAlertId is missing', () => {
    const { platformAlertId: _p, ...rest } = validAlert
    expect(isNormalizedAlert(rest)).toBe(false)
  })

  it('returns false when platformDeviceId is missing', () => {
    const { platformDeviceId: _p, ...rest } = validAlert
    expect(isNormalizedAlert(rest)).toBe(false)
  })

  it('returns false when severity is missing', () => {
    const { severity: _p, ...rest } = validAlert
    expect(isNormalizedAlert(rest)).toBe(false)
  })

  it('returns false when title is missing', () => {
    const { title: _p, ...rest } = validAlert
    expect(isNormalizedAlert(rest)).toBe(false)
  })

  it('returns false when receivedAt is missing', () => {
    const { receivedAt: _p, ...rest } = validAlert
    expect(isNormalizedAlert(rest)).toBe(false)
  })

  it('returns false for a non-object', () => {
    expect(isNormalizedAlert(null)).toBe(false)
    expect(isNormalizedAlert('string')).toBe(false)
  })
})

const validDevice = {
  platform: 'POLY_LENS' as const,
  platformId: 'device-1',
  name: 'Poly Studio X50',
  status: 'online' as const,
  rawPayload: {},
}

describe('isNormalizedDevice', () => {
  it('returns true for a valid device shape', () => {
    expect(isNormalizedDevice(validDevice)).toBe(true)
  })

  it('returns false when a required field is missing', () => {
    const { platformId: _p, ...rest } = validDevice
    expect(isNormalizedDevice(rest)).toBe(false)
  })

  it('returns false when status is an invalid value', () => {
    expect(isNormalizedDevice({ ...validDevice, status: 'degraded' })).toBe(false)
  })

  it('returns false for a non-object', () => {
    expect(isNormalizedDevice(null)).toBe(false)
    expect(isNormalizedDevice(42)).toBe(false)
  })
})
