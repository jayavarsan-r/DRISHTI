'use client'

/**
 * Methodology only. There are deliberately no numbers and no results table on
 * this panel — it explains how the thing works and what is and is not claimed.
 */
export function EvidenceSlideOver({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(5,9,15,0.6)',
        zIndex: 55,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          height: '100%',
          background: 'var(--bg-panel)',
          borderLeft: '1px solid var(--border-hot)',
          padding: 20,
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="panel-title" style={{ fontSize: 13 }}>
            Methodology
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-mid)',
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>

        <Section title="What this is">
          A simulation. The vehicle, the road network, and every IMU sample are
          synthetic and generated at runtime from a seeded PRNG. No field data and
          no recorded dataset is involved, and nothing on any screen is a measured
          benchmark.
        </Section>

        <Section title="The three estimators">
          All three consume the same synthetic IMU stream. <b>Naive INS</b> integrates
          world-frame acceleration twice with no bias correction and no constraints.
          The <b>ESKF + NHC baseline</b> corrects gyro bias, forces lateral velocity to
          zero because a car cannot slide sideways, applies zero-velocity updates
          when stationary, and obtains forward speed by integrating longitudinal
          acceleration. <b>DRISHTI</b> is identical to that baseline except that forward
          speed comes from a per-window estimate rather than from integration.
        </Section>

        <Section title="Why that difference matters">
          An accelerometer bias becomes a velocity ramp under integration, and then a
          position error that grows with the square of time. A per-window speed
          estimate has bounded error instead, so position error grows linearly at
          worst. The ablation toggles demonstrate this directly: with the speed model
          disabled, DRISHTI becomes the baseline, because the speed model is the only
          difference between them.
        </Section>

        <Section title="Speed model (simulated) — not trained">
          It is labelled SIMULATED everywhere it appears because it is a modelled
          stand-in for a temporal convolutional network that has not been trained. It
          does not return truth: its output carries correlated noise and a systematic
          scale error, and it reports reduced confidence when road shock corrupts its
          input so the filter can down-weight it.
        </Section>

        <Section title="Uncertainty is anisotropic">
          Along-track and cross-track uncertainty are propagated separately. A GNSS
          fix constrains both. A map match constrains only cross-track, because
          knowing which road you are on tells you nothing about how far along it you
          are. This is why the ellipse becomes a long thin cigar during a blackout
          rather than a growing circle.
        </Section>

        <Section title="Integrity">
          Every fix is tested by a chi-square gate on the normalised innovation
          squared against the filter's own covariance. The value displayed is always
          the computed one. A spoofed fix fails by orders of magnitude, and it fails
          for the same reason any inconsistent measurement would.
        </Section>

        <Section title="What is not claimed">
          Nothing here is offered as a measured result, a comparison against a
          published benchmark, or a claim about performance on real hardware. The 10%
          figure is labelled TARGET because it is the problem statement's threshold,
          not something this run demonstrates having met. The target runtime is
          Android on-device or edge C++; this demonstration runs in a browser.
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div className="label" style={{ fontSize: 9.5, color: 'var(--accent)' }}>
        {title}
      </div>
      <p
        style={{
          margin: '6px 0 0',
          fontSize: 11.5,
          lineHeight: 1.65,
          color: 'var(--text-mid)',
        }}
      >
        {children}
      </p>
    </div>
  )
}
