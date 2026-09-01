import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'components/field')
const files = () => readdirSync(DIR).filter((f) => /\.tsx?$/.test(f))
const read = (f: string) => readFileSync(join(DIR, f), 'utf8')

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * The phone is a view onto the authoritative simulation, never a second copy of
 * it. These are the structural facts that keep it that way: it may read the
 * static road geometry both screens share, and nothing else out of lib/sim.
 */
describe('field navigation UI provenance', () => {
  it('has field components to audit', () => {
    expect(files().length).toBeGreaterThan(5)
  })

  it('imports no simulation module except the shared road geometry', () => {
    for (const f of files()) {
      const imports = [...read(f).matchAll(/from\s+['"](@\/lib\/sim\/[^'"]+)['"]/g)].map(
        (m) => m[1]
      )
      for (const i of imports) {
        expect(i, `${f} imports ${i}`).toBe('@/lib/sim/road')
      }
    }
  })

  it('never instantiates or drives the engine', () => {
    for (const f of files()) {
      const t = stripComments(read(f))
      expect(t, f).not.toMatch(/new\s+Engine\b/)
      expect(t, f).not.toMatch(/\.step\s*\(|generateTruth|createEngine/)
    }
  })

  it('keeps real phone sensors out of the simulated vehicle marker', () => {
    /*
     * The map draws the simulation's pose alone. If the handset's own
     * accelerometer, gyro or orientation ever appeared in here, the vehicle
     * would be responding to the phone being tilted — the exact confusion
     * between real and simulated the whole screen is built to avoid.
     */
    const t = stripComments(read('NavMap.tsx'))
    expect(t).not.toMatch(/accel|gyro|orientation|DeviceMotion|DeviceOrientation/i)
  })

  it('takes the vehicle pose only from the mission state message', () => {
    const t = stripComments(read('NavMap.tsx'))
    // pose is read off the streamed state...
    expect(t).toMatch(/m\.veh\.(x|y|psi)/)
    // ...and never advanced by a clock of its own
    expect(t).not.toMatch(/Date\.now|performance\.now|setInterval/)
  })
})
