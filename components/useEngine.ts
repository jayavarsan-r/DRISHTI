'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { Engine } from '@/lib/sim/engine'
import type { Snapshot } from '@/lib/sim/types'

type FrameCb = (e: Engine) => void

interface Ctx {
  engine: Engine
  registerFrame: (cb: FrameCb) => () => void
}

export const EngineContext = createContext<Ctx | null>(null)

export function useEngineCtx(): Ctx {
  const c = useContext(EngineContext)
  if (!c) throw new Error('useEngine must be used inside <EngineProvider>')
  return c
}

export function useEngine(): Engine {
  return useEngineCtx().engine
}

/**
 * Numeric panels subscribe here. The engine publishes at SNAPSHOT_HZ (20 Hz),
 * which is faster than a human reads a number and five times cheaper than the
 * physics rate. getSnapshot returns a cached object, so React does not loop.
 */
export function useSnapshot(): Snapshot {
  const { engine } = useEngineCtx()
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot)
}

/**
 * Per-frame callback, run immediately after engine.advance().
 *
 * This is how trajectory geometry reaches the DOM: the canvas writes points
 * attributes and transforms directly onto element refs here, so React never
 * reconciles the ~2200 points per trail.
 */
export function useFrame(cb: FrameCb): void {
  const { registerFrame } = useEngineCtx()
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => registerFrame((e) => ref.current(e)), [registerFrame])
}

/** Creates the single Engine instance and drives the only rAF loop in the app. */
export function useEngineProviderValue(): Ctx {
  const [engine] = useState(() => new Engine())
  const callbacks = useRef(new Set<FrameCb>())

  const [registerFrame] = useState(() => (cb: FrameCb) => {
    callbacks.current.add(cb)
    return () => {
      callbacks.current.delete(cb)
    }
  })

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dtMs = now - last
      last = now
      engine.advance(dtMs)
      for (const cb of callbacks.current) cb(engine)
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engine])

  return { engine, registerFrame }
}
