import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'events'

function createBus() {
  const bus = new EventEmitter()
  bus.setMaxListeners(100)
  return bus
}

describe('SSE event bus', () => {
  it('emits and receives events', () => {
    const bus = createBus()
    const received: unknown[] = []

    bus.on('event', (e) => received.push(e))
    bus.emit('event', { type: 'alert_created', data: { id: 'a1' } })

    expect(received).toHaveLength(1)
    expect((received[0] as { type: string }).type).toBe('alert_created')
  })

  it('allows multiple listeners', () => {
    const bus = createBus()
    let count = 0
    bus.on('event', () => count++)
    bus.on('event', () => count++)
    bus.emit('event', {})
    expect(count).toBe(2)
  })

  it('listener can be removed', () => {
    const bus = createBus()
    let count = 0
    const handler = () => count++
    bus.on('event', handler)
    bus.off('event', handler)
    bus.emit('event', {})
    expect(count).toBe(0)
  })
})
