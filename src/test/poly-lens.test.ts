import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

vi.mock('@/lib/integrations/credentials', () => ({
  getCredential: vi.fn(),
  getWebhookSecret: vi.fn(),
  updateConfig: vi.fn(),
}))

import { getCredential } from '@/lib/integrations/credentials'
import { createPolyLensAdapter } from '@/lib/integrations/poly-lens'

const mockCred = {
  id: 'c1', platform: 'POLY_LENS' as const,
  clientId: 'cid', clientSecret: 'csecret',
  apiKey: null, webhookSecret: 'wh-secret',
  config: { accessToken: 'tok', tokenExpiresAt: Date.now() + 3600_000 },
  createdAt: new Date(), updatedAt: new Date(),
}

describe('normalizeWebhookPayload', () => {
  beforeEach(() => {
    vi.mocked(getCredential).mockResolvedValue(mockCred)
  })

  it('normalizes a device.status.changed offline event', async () => {
    const adapter = await createPolyLensAdapter()
    const raw = {
      eventType: 'device.status.changed',
      eventId: 'evt-001',
      device: { id: 'poly-device-1', displayName: 'Poly Studio X50', status: 'offline' },
      timestamp: '2026-05-27T10:00:00Z',
    }
    const result = adapter.normalizeWebhookPayload(raw)
    expect(result).not.toBeNull()
    expect(result?.platform).toBe('POLY_LENS')
    expect(result?.platformAlertId).toBe('evt-001')
    expect(result?.platformDeviceId).toBe('poly-device-1')
    expect(result?.severity).toBe('HIGH')
    expect(result?.title).toContain('offline')
  })

  it('returns null for non-alert events (device.config.changed)', async () => {
    const adapter = await createPolyLensAdapter()
    const raw = {
      eventType: 'device.config.changed',
      eventId: 'evt-002',
      device: { id: 'poly-device-1', displayName: 'X50', status: 'online' },
      timestamp: '2026-05-27T10:01:00Z',
    }
    expect(adapter.normalizeWebhookPayload(raw)).toBeNull()
  })
})

describe('verifyWebhookSignature', () => {
  it('returns true for a valid HMAC-SHA256 signature', async () => {
    vi.mocked(getCredential).mockResolvedValue(mockCred)
    const adapter = await createPolyLensAdapter()
    const payload = JSON.stringify({ eventType: 'device.status.changed' })
    const sig = crypto.createHmac('sha256', 'wh-secret').update(payload).digest('hex')
    expect(adapter.verifyWebhookSignature(payload, sig)).toBe(true)
  })

  it('returns false for an invalid signature', async () => {
    vi.mocked(getCredential).mockResolvedValue(mockCred)
    const adapter = await createPolyLensAdapter()
    expect(adapter.verifyWebhookSignature('payload', 'bad-sig')).toBe(false)
  })
})
