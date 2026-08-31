'use client'

import { EngineContext, useEngineProviderValue } from '@/components/useEngine'
import { AppShell } from '@/components/AppShell'

export default function Page() {
  const ctx = useEngineProviderValue()
  return (
    <EngineContext.Provider value={ctx}>
      <AppShell />
    </EngineContext.Provider>
  )
}
