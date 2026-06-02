import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing auth
vi.mock('@/lib/prisma', () => ({
  prisma: {
    profile: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}))

const { compareMock } = vi.hoisted(() => ({ compareMock: vi.fn() }))
vi.mock('bcryptjs', () => ({
  default: { compare: compareMock },
  compare: compareMock,
}))

import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'

function getAuthorize(): Function {
  // NextAuth's CredentialsProvider keeps the user-supplied authorize on
  // `.options.authorize`; the top-level `.authorize` is a default `() => null` stub.
  const provider = authOptions.providers[0] as unknown as {
    authorize?: Function
    options?: { authorize?: Function }
  }
  return (provider.options?.authorize ?? provider.authorize) as Function
}

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

describe('CredentialsProvider authorize', () => {
  const authorize = getAuthorize()

  beforeEach(() => {
    vi.clearAllMocks()
    compareMock.mockResolvedValue(true)
  })

  it('blocks login when the user is inactive', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u-1', email: 'x@y.com', password: 'hashed', active: false,
    } as never)

    const result = await authorize({ email: 'x@y.com', password: 'pw' })
    expect(result).toBeNull()
    expect(compareMock).not.toHaveBeenCalled()
  })

  it('allows login when the user is active and password matches', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u-1', email: 'x@y.com', password: 'hashed', active: true,
    } as never)

    const result = await authorize({ email: 'x@y.com', password: 'pw' })
    expect(result).toMatchObject({ id: 'u-1' })
  })
})
