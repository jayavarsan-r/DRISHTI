'use client'

import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { PHYSICS_HZ } from '@/lib/sim/constants'

export default function Page() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header t={0} rateHz={PHYSICS_HZ} running={false} flashing={false} />
      <main style={{ flex: 1, minHeight: 0, padding: 12 }}>
        <div className="panel" style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <span className="label">Trajectory canvas — Task 12</span>
        </div>
      </main>
      <Footer />
    </div>
  )
}
