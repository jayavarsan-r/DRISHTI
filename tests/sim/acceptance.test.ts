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

  it('makes no network calls and loads no remote fonts or assets', () => {
    for (const f of src()) {
      const t = stripComments(readFileSync(f, 'utf8'))
      expect(t, f).not.toMatch(/\bfetch\s*\(/)
      expect(t, f).not.toMatch(/new WebSocket/)
      expect(t, f).not.toMatch(/next\/font\/google/)
      expect(t, f).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
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
