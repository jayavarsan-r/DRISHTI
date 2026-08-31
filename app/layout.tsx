import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DRISHTI — Intelligent Dead Reckoning',
  description:
    'GNSS-denied vehicle navigation demonstration · SIH26168 · Synthetic IMU simulation',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
