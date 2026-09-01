/**
 * DRISHTI custom server: Next.js and the field-link WebSocket relay share one
 * port, so the phone needs exactly one URL and one certificate exception.
 *
 * Serves https when certs/ exists (required — device motion and orientation are
 * secure-context-only on mobile browsers), and falls back to http otherwise so
 * the laptop-only demo still runs.
 *
 * The relay is deliberately dumb. It routes by role and keeps counters; it holds
 * no navigation state and runs no simulation. All simulation lives in the
 * browser's engine exactly as before.
 */
import { createServer as createHttp } from 'node:http'
import { createServer as createHttps } from 'node:https'
import { readFileSync, existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { parse } from 'node:url'
import next from 'next'
import { WebSocketServer } from 'ws'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT ?? 3000)
const LINK_PATH = '/ws'

const haveCerts = existsSync('certs/key.pem') && existsSync('certs/cert.pem')
const app = next({ dev })
const handle = app.getRequestHandler()

function lanAddresses() {
  const out = []
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address)
  }
  return out
}

await app.prepare()

const requestHandler = (req, res) => handle(req, res, parse(req.url, true))

const server = haveCerts
  ? createHttps(
      { key: readFileSync('certs/key.pem'), cert: readFileSync('certs/cert.pem') },
      requestHandler
    )
  : createHttp(requestHandler)

// ---------------------------------------------------------------- relay

const wss = new WebSocketServer({ noServer: true })

/** @type {Map<import('ws').WebSocket, {role:string,nodeId:string,rx:number,tx:number,since:number}>} */
const peers = new Map()

function peersWithRole(role) {
  return [...peers.entries()].filter(([, m]) => m.role === role)
}

function sendTo(role, payload) {
  const raw = JSON.stringify(payload)
  for (const [sock, meta] of peersWithRole(role)) {
    if (sock.readyState === 1) {
      sock.send(raw)
      meta.tx++
    }
  }
}

function announce(role, nodeId, connected) {
  // tell the opposite role that its peer appeared or vanished
  const other = role === 'field' ? 'control' : 'field'
  sendTo(other, { type: 'peer_status', role, nodeId, connected })
}

/*
 * Only the field-link path is ours. Everything else on this port belongs to
 * Next — in development that includes the HMR socket, and destroying it breaks
 * hot reload and logs a connection error into the browser console.
 */
const nextUpgrade = app.getUpgradeHandler()

server.on('upgrade', (req, socket, head) => {
  const { pathname } = parse(req.url ?? '', true)
  if (pathname === LINK_PATH) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    return
  }
  nextUpgrade(req, socket, head)
})

wss.on('connection', (ws, req) => {
  const { query } = parse(req.url ?? '', true)
  const role = query.role === 'field' ? 'field' : 'control'
  const nodeId = typeof query.nodeId === 'string' ? query.nodeId : 'FIELD-UNIT-01'

  const meta = { role, nodeId, rx: 0, tx: 0, since: Date.now() }
  peers.set(ws, meta)
  console.log(`[link] ${role} connected (${nodeId}) — ${peers.size} peer(s)`)

  announce(role, nodeId, true)

  // A field unit joining an already-running control needs to know it is seen,
  // and vice versa: replay the current peer set to the newcomer.
  for (const [, other] of peers) {
    if (other !== meta) {
      ws.send(JSON.stringify({
        type: 'peer_status', role: other.role, nodeId: other.nodeId, connected: true,
      }))
    }
  }

  ws.on('message', (raw) => {
    meta.rx++
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    switch (msg.type) {
      case 'heartbeat':
        // echo the client's own timestamp so round-trip time is truly measured
        ws.send(JSON.stringify({
          type: 'heartbeat_ack', timestamp: msg.timestamp, serverTime: Date.now(),
        }))
        meta.tx++
        break

      case 'sensor':
      case 'command':
        sendTo('control', msg)
        break

      case 'event':
      case 'mission':
      case 'command_ack':
        sendTo('field', msg)
        break

      case 'hello':
        break
    }
  })

  ws.on('close', () => {
    peers.delete(ws)
    console.log(`[link] ${role} disconnected (${nodeId}) — ${peers.size} peer(s)`)
    announce(role, nodeId, false)
  })

  ws.on('error', () => {})
})

server.listen(port, '0.0.0.0', () => {
  const scheme = haveCerts ? 'https' : 'http'
  console.log(`\n  DRISHTI — ${scheme.toUpperCase()} + field link on port ${port}\n`)
  console.log(`  Mission Control   ${scheme}://localhost:${port}`)
  for (const ip of lanAddresses()) {
    console.log(`  Field Unit        ${scheme}://${ip}:${port}/field`)
  }
  if (!haveCerts) {
    console.log('\n  ⚠  No certificate found — serving plain HTTP.')
    console.log('     Phone motion sensors WILL NOT WORK over http on a LAN IP.')
    console.log('     Run: npm run cert')
  }
  console.log('')
})
