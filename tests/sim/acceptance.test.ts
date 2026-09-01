import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const src = () => [...walk('app'), ...walk('components')].filter((f) => /\.tsx?$/.test(f))

/**
 * The field link is a deliberate, LAN-only WebSocket to a phone. The
 * no-network rule exists to prove the demonstration carries no INTERNET
 * dependency and runs on an isolated network — which is still true — so the
 * link layer is exempt from the socket ban but not from the external-host ban.
 */
const isLinkLayer = (f: string) =>
  f.includes('/link/') || f.includes('/field/') || f.endsWith('FieldUnit.tsx')

const simUi = () => src().filter((f) => !isLinkLayer(f))

/** Comments discuss these words legitimately; only rendered copy is audited. */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('acceptance', () => {
  it('has UI source to audit', () => {
    expect(src().length).toBeGreaterThan(5)
  })

  it('makes no forbidden claims anywhere in the UI', () => {
    for (const f of src()) {
      const t = stripComments(readFileSync(f, 'utf8'))
      expect(t, f).not.toMatch(/\bvalidated\b/i)
      expect(t, f).not.toMatch(/\bproven\b/i)
      expect(t, f).not.toMatch(/\baccuracy\b/i)
      expect(t, f).not.toMatch(/trained model/i)
    }
  })

  it('never labels the target as achieved', () => {
    for (const f of src()) {
      expect(stripComments(readFileSync(f, 'utf8')), f).not.toMatch(/ACHIEVED/i)
    }
  })

  it('the simulation UI makes no network calls at all', () => {
    for (const f of simUi()) {
      const t = stripComments(readFileSync(f, 'utf8'))
      expect(t, f).not.toMatch(/\bfetch\s*\(/)
      expect(t, f).not.toMatch(/new WebSocket/)
    }
  })

  it('nothing anywhere loads a remote font or external host', () => {
    for (const f of src()) {
      const t = stripComments(readFileSync(f, 'utf8'))
      expect(t, f).not.toMatch(/next\/font\/google/)
      expect(t, f).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
    }
  })

  it('the field link derives its address from the page origin, never a hardcoded host', () => {
    const link = readFileSync('lib/link/useLink.ts', 'utf8')
    expect(link).toContain('window.location.host')
    // no literal IPs or ws:// hosts baked in
    expect(stripComments(link)).not.toMatch(/wss?:\/\/[0-9a-z]/i)
  })

  it('phone orientation never reaches the estimator', () => {
    // The field unit is a sensor node and a remote control, not the vehicle.
    // Its orientation may drive visualisation only.
    const mission = readFileSync('lib/link/useMissionLink.ts', 'utf8')
    expect(mission).not.toMatch(/aidHeading|applyDelta|blendTo|\.state\.psi\s*=/)
    for (const f of readdirSync('lib/sim')) {
      const t = readFileSync(join('lib/sim', f), 'utf8')
      expect(t, `lib/sim/${f} must not import the link layer`).not.toMatch(/lib\/link|\.\.\/link/)
    }
  })

  it('labels the speed model as SIMULATED in every surface that names it', () => {
    // Per-line matching would fail on flowing prose that refers back to the
    // model; the constraint is that each surface where it APPEARS carries the
    // tag, so the check is per file.
    for (const f of src()) {
      const t = stripComments(readFileSync(f, 'utf8'))
      if (!/speed model/i.test(t)) continue
      expect(t, `${f} names the speed model without labelling it SIMULATED`).toMatch(
        /SIMULATED/i
      )
    }
  })

  it('keeps the honesty footer and runtime block in the tree', () => {
    const footer = readFileSync('components/Footer.tsx', 'utf8')
    expect(footer).toContain('No')
    expect(footer).toContain('measured benchmark claims')
    const header = readFileSync('components/Header.tsx', 'utf8')
    expect(header).toContain('SIMULATION · SYNTHETIC IMU')
    expect(header).toContain('Android on-device / edge C++')
    expect(header).toContain('RESULTS PENDING')
  })

  it('renders the chi-square threshold and TARGET from lib/sim constants', () => {
    // guards against a literal 9.21 or 10% creeping into a metric slot
    const rail = readFileSync('components/rail/MetricRail.tsx', 'utf8')
    expect(rail).toContain('TARGET_ERROR_FRACTION')
    const integrity = readFileSync('components/panels/GnssIntegrityPanel.tsx', 'utf8')
    expect(integrity).toContain('CHI2_2DOF_99')
    expect(stripComments(integrity)).not.toMatch(/9\.21/)
  })
})
