import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSSE } from '@/hooks/useSSE'

class MockEventSource {
  url: string
  listeners: Map<string, ((e: MessageEvent) => void)[]> = new Map()
  readyState = 1

  constructor(url: string) { this.url = url }

  addEventListener(type: string, handler: (e: MessageEvent) => void) {
    const existing = this.listeners.get(type) ?? []
    this.listeners.set(type, [...existing, handler])
  }

  removeEventListener(type: string, handler: (e: MessageEvent) => void) {
    const existing = this.listeners.get(type) ?? []
    this.listeners.set(type, existing.filter((h) => h !== handler))
  }

  close() { this.readyState = 2 }

  dispatchSSEEvent(type: string, data: unknown) {
    const handlers = this.listeners.get(type) ?? []
    handlers.forEach((h) => h({ data: JSON.stringify(data) } as MessageEvent))
  }
}

let mockES: MockEventSource

class ConstructableMockEventSource {
  url: string
  listeners: Map<string, ((e: MessageEvent) => void)[]> = new Map()
  readyState = 1

  constructor(url: string) {
    this.url = url
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockES = this as any
  }

  addEventListener(type: string, handler: (e: MessageEvent) => void) {
    const existing = this.listeners.get(type) ?? []
    this.listeners.set(type, [...existing, handler])
  }

  removeEventListener(type: string, handler: (e: MessageEvent) => void) {
    const existing = this.listeners.get(type) ?? []
    this.listeners.set(type, existing.filter((h) => h !== handler))
  }

  close() { this.readyState = 2 }

  dispatchSSEEvent(type: string, data: unknown) {
    const handlers = this.listeners.get(type) ?? []
    handlers.forEach((h) => h({ data: JSON.stringify(data) } as MessageEvent))
  }
}

vi.stubGlobal('EventSource', ConstructableMockEventSource)

describe('useSSE', () => {
  afterEach(() => vi.clearAllMocks())

  it('calls the handler when a matching event is received', async () => {
    const handler = vi.fn()
    renderHook(() => useSSE('alert_created', handler))

    act(() => {
      mockES.dispatchSSEEvent('alert_created', { id: 'a1', title: 'Test' })
    })

    expect(handler).toHaveBeenCalledWith({ id: 'a1', title: 'Test' })
  })

  it('does not call handler for different event types', () => {
    const handler = vi.fn()
    renderHook(() => useSSE('ticket_updated', handler))

    act(() => {
      mockES.dispatchSSEEvent('alert_created', { id: 'a1' })
    })

    expect(handler).not.toHaveBeenCalled()
  })
})
