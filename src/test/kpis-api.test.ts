import { describe, it, expect } from 'vitest'

function countSlaAtRisk(tickets: Array<{ slaDeadline: Date; status: string }>): number {
  const twoHoursFromNow = new Date(Date.now() + 2 * 3_600_000)
  return tickets.filter(
    (t) =>
      (t.status === 'OPEN' || t.status === 'IN_PROGRESS') &&
      t.slaDeadline <= twoHoursFromNow
  ).length
}

describe('countSlaAtRisk', () => {
  it('counts tickets whose deadline is within 2 hours', () => {
    const soonDeadline = new Date(Date.now() + 30 * 60_000)
    const laterDeadline = new Date(Date.now() + 5 * 3_600_000)
    const tickets = [
      { slaDeadline: soonDeadline, status: 'OPEN' },
      { slaDeadline: laterDeadline, status: 'OPEN' },
      { slaDeadline: soonDeadline, status: 'RESOLVED' }, // should not count
    ]
    expect(countSlaAtRisk(tickets)).toBe(1)
  })

  it('returns 0 when no tickets are at risk', () => {
    const safe = new Date(Date.now() + 10 * 3_600_000)
    expect(countSlaAtRisk([{ slaDeadline: safe, status: 'OPEN' }])).toBe(0)
  })
})
