'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LINK_PATH,
  PROTOCOL_VERSION,
  decode,
  encode,
  type LinkMessage,
  type LinkState,
  type Role,
} from './protocol'

export interface LinkStats {
  state: LinkState
  /** packets this client has sent */
  tx: number
  /** packets this client has received */
  rx: number
  /** receive rate, measured over a 1 s window */
  rxPerSec: number
  /** true round-trip time from the heartbeat echo, ms. null until measured. */
  latencyMs: number | null
  /** whether the opposite role is currently attached to the relay */
  peerConnected: boolean
  peerNodeId: string | null
  reconnects: number
  /** ms since this connection was established */
  uptimeMs: number
  url: string
}

const HEARTBEAT_MS = 2000
const BACKOFF_MIN = 500
const BACKOFF_MAX = 8000

/** Derives the link URL from the page origin, so it follows http/https and LAN IP. */
export function linkUrl(role: Role, nodeId: string): string {
  if (typeof window === 'undefined') return ''
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${LINK_PATH}?role=${role}&nodeId=${encodeURIComponent(nodeId)}`
}

/**
 * WebSocket client with real reconnection.
 *
 * Connection state is never asserted — it is read from the socket. Latency is
 * measured by echoing our own timestamp through the relay, never estimated.
 */
export function useLink({
  role,
  nodeId,
  onMessage,
  enabled = true,
}: {
  role: Role
  nodeId: string
  onMessage?: (m: LinkMessage) => void
  enabled?: boolean
}) {
  const [stats, setStats] = useState<LinkStats>({
    state: 'DISCONNECTED',
    tx: 0,
    rx: 0,
    rxPerSec: 0,
    latencyMs: null,
    peerConnected: false,
    peerNodeId: null,
    reconnects: 0,
    uptimeMs: 0,
    url: '',
  })

  const sockRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const counters = useRef({ tx: 0, rx: 0, reconnects: 0, connectedAt: 0 })
  const rxWindow = useRef<number[]>([])
  const latency = useRef<number | null>(null)
  const peer = useRef<{ connected: boolean; nodeId: string | null }>({
    connected: false,
    nodeId: null,
  })
  const backoff = useRef(BACKOFF_MIN)
  const closed = useRef(false)

  const send = useCallback((m: LinkMessage) => {
    const s = sockRef.current
    if (s && s.readyState === WebSocket.OPEN) {
      s.send(encode(m))
      counters.current.tx++
      return true
    }
    return false
  }, [])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    closed.current = false
    let hbTimer: ReturnType<typeof setInterval> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const url = linkUrl(role, nodeId)

    const connect = () => {
      if (closed.current) return
      setStats((s) => ({
        ...s,
        state: counters.current.reconnects > 0 ? 'RECONNECTING' : 'CONNECTING',
        url,
      }))

      let ws: WebSocket
      try {
        ws = new WebSocket(url)
      } catch {
        setStats((s) => ({ ...s, state: 'ERROR' }))
        schedule()
        return
      }
      sockRef.current = ws

      ws.onopen = () => {
        backoff.current = BACKOFF_MIN
        counters.current.connectedAt = Date.now()
        send({ type: 'hello', version: PROTOCOL_VERSION, role, nodeId })
        setStats((s) => ({ ...s, state: 'CONNECTED' }))

        hbTimer = setInterval(() => {
          send({ type: 'heartbeat', nodeId, timestamp: Date.now() })
        }, HEARTBEAT_MS)
      }

      ws.onmessage = (ev) => {
        counters.current.rx++
        rxWindow.current.push(Date.now())

        const m = decode(String(ev.data))
        if (!m) return

        if (m.type === 'heartbeat_ack') {
          latency.current = Date.now() - m.timestamp
          return
        }
        if (m.type === 'peer_status') {
          peer.current = { connected: m.connected, nodeId: m.nodeId }
          return
        }
        onMessageRef.current?.(m)
      }

      const drop = () => {
        if (hbTimer) {
          clearInterval(hbTimer)
          hbTimer = null
        }
        if (sockRef.current === ws) sockRef.current = null
        peer.current = { connected: false, nodeId: null }
        if (!closed.current) {
          setStats((s) => ({ ...s, state: 'RECONNECTING' }))
          schedule()
        }
      }

      ws.onclose = drop
      ws.onerror = () => {
        setStats((s) => ({ ...s, state: 'ERROR' }))
      }
    }

    const schedule = () => {
      if (closed.current || retryTimer) return
      counters.current.reconnects++
      retryTimer = setTimeout(() => {
        retryTimer = null
        connect()
      }, backoff.current)
      backoff.current = Math.min(backoff.current * 2, BACKOFF_MAX)
    }

    connect()

    // Stats tick. Kept off the message path so a fast sensor stream cannot
    // drive React renders.
    const statsTimer = setInterval(() => {
      const now = Date.now()
      rxWindow.current = rxWindow.current.filter((t) => now - t < 1000)
      setStats((s) => ({
        ...s,
        tx: counters.current.tx,
        rx: counters.current.rx,
        rxPerSec: rxWindow.current.length,
        latencyMs: latency.current,
        peerConnected: peer.current.connected,
        peerNodeId: peer.current.nodeId,
        reconnects: Math.max(0, counters.current.reconnects),
        uptimeMs:
          sockRef.current?.readyState === WebSocket.OPEN
            ? now - counters.current.connectedAt
            : 0,
        url,
      }))
    }, 250)

    return () => {
      closed.current = true
      if (hbTimer) clearInterval(hbTimer)
      if (retryTimer) clearTimeout(retryTimer)
      clearInterval(statsTimer)
      sockRef.current?.close()
      sockRef.current = null
    }
  }, [role, nodeId, enabled, send])

  return { stats, send }
}
