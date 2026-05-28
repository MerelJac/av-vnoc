import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}))

import SidebarLayout from '@/app/components/team/Sidebar'

const DEFAULT_PROPS = {
  customers: [],
  totalCustomers: 0,
  myQueueCount: 0,
  userInitials: 'MJ',
  userName: 'Merel Jacobs',
}

describe('SidebarLayout', () => {
  it('shows My Queue link for TIER1 role', () => {
    render(
      <SidebarLayout {...DEFAULT_PROPS} isSuperAdmin={false} vnocRole="TIER1">
        <div>content</div>
      </SidebarLayout>
    )
    expect(screen.getByText('My Queue')).toBeInTheDocument()
    expect(screen.getByText('All Alerts')).toBeInTheDocument()
  })

  it('shows Platform Settings link only for superAdmin', () => {
    const { rerender } = render(
      <SidebarLayout {...DEFAULT_PROPS} isSuperAdmin={false} vnocRole="MANAGER">
        <div />
      </SidebarLayout>
    )
    expect(screen.queryByText('Platform Settings')).not.toBeInTheDocument()

    rerender(
      <SidebarLayout {...DEFAULT_PROPS} isSuperAdmin={true} vnocRole={null}>
        <div />
      </SidebarLayout>
    )
    expect(screen.getByText('Platform Settings')).toBeInTheDocument()
  })
})
