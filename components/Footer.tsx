/**
 * Honesty footer. Non-negotiable constraint 6: always present, never dismissible.
 */
export function Footer() {
  return (
    <footer
      style={{
        flex: '0 0 auto',
        borderTop: '1px solid var(--border)',
        padding: '5px 16px',
        fontSize: 10,
        color: 'var(--text-lo)',
        letterSpacing: '0.04em',
        background: 'var(--bg-void)',
      }}
    >
      DRISHTI DEMONSTRATION BUILD · Synthetic IMU, simulated estimator outputs · No
      measured benchmark claims
    </footer>
  )
}
