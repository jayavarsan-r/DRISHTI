import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'DRISHTI Field Unit',
  description: 'Real phone sensor telemetry node · SIH26168',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#05090F',
}

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
