import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

vi.mock('@/lib/integrations/credentials', () => ({
  getCredential: vi.fn(),
  getWebhookSecret: vi.fn(),
  updateConfig: vi.fn(),
}))

import { getCredential } from '@/lib/integrations/credentials'
import { createYealinkAdapter } from '@/lib/integrations/yealink'

const mockCred = {
  id: 'c2', platform: 'YEALINK_YMCS' as const,
  clientId: null, clientSecret: null,
  apiKey: 'yk-api-key', webhookSecret: 'yk-wh-secret',
  config: null, createdAt: new Date(), updatedAt: new Date(),
}

describe('normalizeWebhookPayload', () => {
  beforeEach(() => {
    vi.mocked(getCredential).mockResolvedValue(mockCred)
  })

  it('normalizes a device offline event', async () => {
    const adapter = await createYealinkAdapter()
    const raw = {
      eventId: 'yk-evt-001',
      eventType: 'device.offline',
      device: { deviceId: 'yk-device-1', deviceName: 'Yealink CP960', status: 'offline' },
      occurredAt: '2026-05-27T10:00:00Z',
    }
    const result = adapter.normalizeWebhookPayload(raw)
    expect(result).not.toBeNull()
    expect(result?.platform).toBe('YEALINK_YMCS')
    expect(result?.platformAlertId).toBe('yk-evt-001')
    expect(result?.platformDeviceId).toBe('yk-device-1')
    expect(result?.severity).toBe('HIGH')
  })

  it('returns null for non-alert events', async () => {
    const adapter = await createYealinkAdapter()
    const raw = {
      eventId: 'yk-evt-002',
      eventType: 'device.registered',
      device: { deviceId: 'yk-device-1', status: 'online' },
      occurredAt: '2026-05-27T10:01:00Z',
    }
    expect(adapter.normalizeWebhookPayload(raw)).toBeNull()
  })
})

describe('verifyWebhookSignature', () => {
  it('returns true for valid signature', async () => {
    vi.mocked(getCredential).mockResolvedValue(mockCred)
    const adapter = await createYealinkAdapter()
    const payload = JSON.stringify({ eventType: 'device.offline' })
    const sig = crypto.createHmac('sha256', 'yk-wh-secret').update(payload).digest('hex')
    expect(adapter.verifyWebhookSignature(payload, sig)).toBe(true)
  })

  it('returns false for invalid signature', async () => {
    vi.mocked(getCredential).mockResolvedValue(mockCred)
    const adapter = await createYealinkAdapter()
    expect(adapter.verifyWebhookSignature('payload', 'bad')).toBe(false)
  })
})
