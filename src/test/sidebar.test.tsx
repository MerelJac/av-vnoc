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

import SidebarLayout from '@/app/components/team/Sidebar'

describe('SidebarLayout', () => {
  it('shows My Queue link for TIER1 role', () => {
    render(
      <SidebarLayout isSuperAdmin={false} vnocRole="TIER1">
        <div>content</div>
      </SidebarLayout>
    )
    expect(screen.getByText('My Queue')).toBeInTheDocument()
    expect(screen.getByText('All Alerts')).toBeInTheDocument()
  })

  it('shows Customers link only for MANAGER and above', () => {
    const { rerender } = render(
      <SidebarLayout isSuperAdmin={false} vnocRole="TIER1">
        <div />
      </SidebarLayout>
    )
    expect(screen.queryByRole('link', { name: /Customers/i })).not.toBeInTheDocument()

    rerender(
      <SidebarLayout isSuperAdmin={false} vnocRole="MANAGER">
        <div />
      </SidebarLayout>
    )
    expect(screen.getByRole('link', { name: /Customers/i })).toBeInTheDocument()
  })

  it('shows Platform Settings link only for superAdmin', () => {
    const { rerender } = render(
      <SidebarLayout isSuperAdmin={false} vnocRole="MANAGER">
        <div />
      </SidebarLayout>
    )
    expect(screen.queryByText('Platform Settings')).not.toBeInTheDocument()

    rerender(
      <SidebarLayout isSuperAdmin={true} vnocRole={null}>
        <div />
      </SidebarLayout>
    )
    expect(screen.getByText('Platform Settings')).toBeInTheDocument()
  })
})
