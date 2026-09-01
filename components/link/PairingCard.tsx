'use client'

import { useEffect, useState } from 'react'
import { Panel } from '../panels/Panel'

/**
 * Pairing instructions. The URL is derived from the page origin, so it already
 * carries the right scheme, LAN address and port — a judge cannot mistype it,
 * and it is never localhost, which the phone could not reach.
 */
export function PairingCard() {
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [insecure, setInsecure] = useState(false)

  useEffect(() => {
    const u = `${window.location.origin}/field`
    setUrl(u)
    setInsecure(window.location.protocol !== 'https:')
  }, [])

  const isLoopback = /localhost|127\.0\.0\.1/.test(url)

  return (
    <Panel
      title="Connect field unit"
      provenance="Phone and laptop must be on the same network · the phone cannot reach localhost"
    >
      <div
        className="mono"
        style={{
          fontSize: 12,
          padding: '8px 10px',
          background: 'var(--bg-raised)',
          border: '1px solid var(--border-hot)',
          borderRadius: 3,
          wordBreak: 'break-all',
          color: 'var(--accent)',
        }}
      >
        {url || '…'}
      </div>

      <button
        onClick={() => {
          navigator.clipboard?.writeText(url).then(
            () => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            },
            () => undefined
          )
        }}
        style={{
          marginTop: 7,
          width: '100%',
          padding: '7px 0',
          background: 'var(--bg-raised)',
          border: '1px solid var(--border)',
          borderRadius: 3,
          color: 'var(--text-mid)',
          fontSize: 10,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
        }}
      >
        {copied ? 'Copied' : 'Copy URL'}
      </button>

      {isLoopback && (
        <div className="provenance" style={{ marginTop: 8, color: 'var(--warn)' }}>
          You are on localhost. Open Mission Control via this machine&apos;s LAN address so the
          phone has a reachable URL.
        </div>
      )}

      {insecure && (
        <div className="provenance" style={{ marginTop: 8, color: 'var(--danger)' }}>
          Served over http. Phone motion sensors are secure-context only and will deliver
          nothing. Run <span className="mono">npm run cert</span>, then{' '}
          <span className="mono">npm run link</span>.
        </div>
      )}
    </Panel>
  )
}
