import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing auth
vi.mock('@/lib/prisma', () => ({
  prisma: {
    profile: {
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'

describe('NextAuth jwt callback', () => {
  const jwtCallback = authOptions.callbacks!.jwt as Function

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores vnocRole in token when user signs in', async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      firstName: 'Test',
      lastName: 'User',
      phone: null,
      avatarUrl: null,
      vnocRole: 'TIER2',
      updatedAt: new Date(),
    })

    const result = await jwtCallback({
      token: {},
      user: { id: 'user-1', email: 'test@test.com', isSuperAdmin: false },
    })

    expect(result.vnocRole).toBe('TIER2')
    expect(prisma.profile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { vnocRole: true },
    })
  })

  it('stores null vnocRole when user has no profile', async () => {
    vi.mocked(prisma.profile.findUnique).mockResolvedValue(null)

    const result = await jwtCallback({
      token: {},
      user: { id: 'user-2', email: 'other@test.com', isSuperAdmin: false },
    })

    expect(result.vnocRole).toBeNull()
  })

  it('does not query profile when user is not present (token refresh)', async () => {
    const result = await jwtCallback({
      token: { id: 'user-1', isSuperAdmin: false, vnocRole: 'TIER1' },
    })

    expect(prisma.profile.findUnique).not.toHaveBeenCalled()
    expect(result.vnocRole).toBe('TIER1')
  })
})
