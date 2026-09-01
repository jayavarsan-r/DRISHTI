/**
 * Generates a self-signed certificate covering this machine's LAN address.
 *
 * Device motion and orientation events are secure-context-only in Android
 * Chrome and iOS Safari. A phone opening http://<lan-ip>/field receives NO
 * sensor events at all — so the field unit needs https over the LAN, and that
 * needs a certificate whose subjectAltName contains the actual IP (Chrome
 * ignores the legacy CN field entirely).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'

function lanAddresses() {
  const out = []
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address)
    }
  }
  return out
}

const ips = lanAddresses()
if (ips.length === 0) {
  console.error('No non-internal IPv4 interface found. Connect to Wi-Fi first.')
  process.exit(1)
}

mkdirSync('certs', { recursive: true })

const alt = [
  'DNS:localhost',
  'IP:127.0.0.1',
  ...ips.map((ip) => `IP:${ip}`),
].join(',')

const conf = `[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = DRISHTI Field Link
[v3]
subjectAltName = ${alt}
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
`
writeFileSync('certs/openssl.cnf', conf)

execFileSync(
  'openssl',
  [
    'req', '-x509', '-nodes', '-newkey', 'rsa:2048',
    '-keyout', 'certs/key.pem',
    '-out', 'certs/cert.pem',
    '-days', '365',
    '-config', 'certs/openssl.cnf',
  ],
  { stdio: 'inherit' }
)

console.log('\nCertificate written to certs/')
console.log('Covers:', alt)
console.log('\nField unit URL(s):')
for (const ip of ips) console.log(`  https://${ip}:3000/field`)
console.log('\nThe phone will warn the certificate is untrusted. Tap Advanced,')
console.log('then Proceed. That grants a secure context, which is what the')
console.log('motion sensors require.')
