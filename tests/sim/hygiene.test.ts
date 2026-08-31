import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SIM = join(process.cwd(), 'lib/sim')
const files = () => readdirSync(SIM).filter((f) => f.endsWith('.ts'))

/**
 * Comments legitimately discuss Math.random (explaining why it is banned), so a
 * naive substring match produces false positives. Strip comments first, then
 * look for an actual member access on Math.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('lib/sim hygiene', () => {
  it('actually has modules to check', () => {
    expect(files().length).toBeGreaterThan(0)
  })

  it('never calls Math.random', () => {
    for (const f of files()) {
      const code = stripComments(readFileSync(join(SIM, f), 'utf8'))
      // catches Math.random(...) and Math['random'](...)
      expect(code).not.toMatch(/Math\s*(\.\s*random|\[\s*['"`]random)/)
    }
  })

  it('imports no React', () => {
    for (const f of files()) {
      expect(readFileSync(join(SIM, f), 'utf8')).not.toMatch(/from ['"]react/)
    }
  })

  it('the Math.random check actually detects a violation', () => {
    // guards against the strip/regex silently matching nothing
    const bad = stripComments('const x = Math.random()\n// Math.random in a comment\n')
    expect(bad).toMatch(/Math\s*(\.\s*random|\[\s*['"`]random)/)
    const onlyComment = stripComments('// Math.random is banned here\n')
    expect(onlyComment).not.toMatch(/Math\s*(\.\s*random|\[\s*['"`]random)/)
  })
})
