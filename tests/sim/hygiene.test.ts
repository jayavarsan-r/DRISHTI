import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SIM = join(process.cwd(), 'lib/sim')
const files = () => readdirSync(SIM).filter((f) => f.endsWith('.ts'))

describe('lib/sim hygiene', () => {
  it('actually has modules to check', () => {
    // guards the two assertions below from passing vacuously on an empty dir
    expect(files().length).toBeGreaterThan(0)
  })

  it('never calls Math.random', () => {
    for (const f of files()) {
      expect(readFileSync(join(SIM, f), 'utf8')).not.toContain('Math.random')
    }
  })

  it('imports no React', () => {
    for (const f of files()) {
      expect(readFileSync(join(SIM, f), 'utf8')).not.toMatch(/from ['"]react/)
    }
  })
})
