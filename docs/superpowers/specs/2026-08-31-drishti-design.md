# DRISHTI — Design Spec

**Date:** 2026-08-31
**Problem:** SIH 2026 · SIH26168 (ISRO) — GNSS-denied vehicle navigation
**Status:** Approved, ready for implementation plan

---

## 1. Purpose

A single-page Next.js application that demonstrates a GNSS-denied vehicle
navigation engine to a panel of judges.

The success condition is a sentence, not a feature list:

> A judge presses one button, watches three navigation systems track the same
> vehicle, sees GNSS cut out, and within eight seconds it is visually
> undeniable that naive inertial navigation collapses while DRISHTI stays
> constrained to the road — and the app can then explain, panel by panel,
> exactly why.

This is a demonstration instrument, not a product. Every number displayed is
computed by the simulation at runtime. No result figure, drift percentage,
confidence value, NIS output, or accuracy claim is hard-coded into the UI.

### The line the UI must earn

Everything in this build exists so that this can be said honestly while
pointing at the screen:

> "We don't integrate noisy acceleration twice and hope. We estimate the
> vehicle's speed per window, bound it with a Kalman filter and the fact that
> cars can't slide sideways, let the road constrain what's left, and show you
> our uncertainty the whole time — including when it grows."

---

## 2. Resolved decisions

Two questions in the source brief were underspecified. Both are now settled.

### 2.1 Route length vs. scenario duration

The brief specified a ~1.4 km route *and* a 60 s demo script. These do not
reconcile: with the given speed profile (0→14 m/s over 8 s, cruise 14 m/s,
decelerate to 6 m/s through turns, one 4 s stop) sixty seconds covers roughly
650 m — the vehicle would finish mid-route with half the drawn road never
driven. Closing the gap by raising cruise speed would require ~75 km/h through
90-degree turns, which is less plausible than a short route.

**Decision: keep the full 1.4 km route and extend the scenario to ~110 s.**
Scripted events fire at the t-values from the brief (blackout t=15, shock
t=18, baseline failure ~t=25, spoof t=38, restore t=45, fusion t=48). The
vehicle then continues to the route end and `MISSION COMPLETE` fires at
approximately t=110. The event timeline strip spans the full scenario, not 60 s.

### 2.2 Build scope

**Decision: build cut-line items 1 through 17** — the complete simulation core,
both UI modes, and every panel including the two items the brief marked
"only if genuinely idle" (evidence slide-over, edge engine panel).

---

## 3. Architecture

### 3.1 The render split

110 s x 100 Hz x 3 trajectories is ~33,000 points. Reconciling that through
React every frame will not hold 60 fps. Three approaches were considered:

| Approach | Verdict |
|---|---|
| React state at 100 Hz | Rejected. Reconciles 33k SVG points 100x/s. |
| Canvas 2D instead of SVG | Rejected. Loses crisp text labels, CSS custom properties, per-element styling; the brief specifies SVG. |
| Imperative SVG + throttled React | **Chosen.** |

The chosen split:

- The engine steps physics at a **fixed 100 Hz accumulator**, decoupled from
  render rate.
- Trajectory points are **decimated to 20 Hz for drawing** (~2,200 points per
  line over 110 s — smooth at demo zoom, cheap to update) and written directly
  to `polyline.points` and ellipse transforms **via refs inside the rAF
  callback**. React never reconciles trajectory geometry.
- Numeric panels subscribe through `useSyncExternalStore` to a snapshot the
  engine publishes at **~20 Hz** — faster than a human reads a number, 5x
  cheaper than the physics rate.
- Discrete changes (state transitions, event log entries, banners) notify
  subscribers immediately rather than waiting for the next snapshot tick.

### 3.2 Determinism under variable frame rate

The requirement "press RESET and watch twice, get identical numbers" is load
bearing for the demo. It is guaranteed by four rules:

1. **All RNG draws happen inside `step()`**, never in the rAF callback. N steps
   always produce the same sequence regardless of how they were batched across
   frames.
2. **The demo script is keyed to sim time**, never `performance.now()`.
3. **Frame delta is clamped** (max ~8 steps per frame) to prevent a spiral of
   death after a tab stall. On a slow machine this makes sim time lag wall
   time; it does **not** change the state sequence, so final numbers are
   still identical.
4. **`RESET` discards the engine** and constructs a new one from
   `DEFAULT_SEED = 26168`. No state survives a reset.

A `NEW RUN` control generates a fresh seed and displays it.

### 3.3 Module layout

`lib/sim/` is pure TypeScript with zero React imports, so it is unit-testable
and defensible independently of the UI.

```
lib/sim/
  rng.ts          mulberry32 + Box-Muller gaussian + AR(1) helper
  road.ts         SEGMENTS polylines in a local metric frame
  truth.ts        arc-length parametrisation + speed profile (incl. 4 s stop)
  imu.ts          synthetic gyro/accel + bias + vibration + shock + R_mount
  speedModel.ts   AR(1)-corrupted speed estimate + confidence, shock reaction
  estimators.ts   naiveINS / eskfNHC / drishti — three pure steppers
  uncertainty.ts  sigma_psi / sigma_along / sigma_cross propagation
  mapMatch.ts     top-3 hypotheses, proportional correction, never snaps
  gnss.ts         NOMINAL / DEGRADED / DENIED / SPOOFED, 1 Hz fixes
  integrity.ts    NIS + chi-square gate
  scenario.ts     the ~110 s judge script as data, keyed to sim time
  engine.ts       orchestrator: accumulator, snapshot publication, event log
  types.ts        shared types
components/       one component tree, density driven by uiMode
```

`engine.ts` is the only module aware of all the others. Each estimator receives
the same IMU sample and returns its own state, which is what makes the ablation
toggles honest — they change which terms run in the stepper, not what is drawn.

### 3.4 One tree, two modes

`uiMode: 'presentation' | 'technical'` drives density from a single component
tree. Panels hidden in presentation mode are the same components, unmounted or
collapsed. Two separate screens are explicitly not built.

---

## 4. Simulation contracts

### 4.1 Ground truth and sensors

Route: ~1.4 km containing a straight opening (~300 m), a 90-degree left turn, a
gentle curve (~200 m radius), a 4-way intersection where a **parallel service
road runs 18 m alongside the main road for 250 m** (this is what makes the map
hypothesis panel produce a genuine split), a 90-degree right turn, and a final
straight.

Speed profile: accelerate 0→14 m/s over 8 s, cruise, decelerate to 6 m/s
through turns, and **one full 4 s stop at the intersection** — this is what
makes ZUPT demonstrable. Truth is emitted at 100 Hz as
`{t, x, y, psi, v, omega, a_long}`.

IMU synthesis models what a dash-mounted phone measures:

```
gyro_z  = omega + bg + randomWalk + gaussian(0, 0.004)
accel_x = a_long      + ba_x + gaussian(0, 0.06) + vibration + shock
accel_y = v * omega   + ba_y + gaussian(0, 0.06) + vibration + shock
accel_z = 9.81        + ba_z + gaussian(0, 0.09) + vibration + shock
```

with constant gyro bias `bg` (default 0.6 deg/s, drives heading drift),
constant accel bias `ba` (default 0.05 m/s^2 per axis, drives naive INS
divergence), an engine vibration harmonic `0.12 * sin(2*pi*32*t)`, a 0.9 g
shock impulse decaying over 180 ms fired by the POTHOLE control, and a mount
rotation `R_mount` (default yaw +7 deg, pitch +2 deg) changeable mid-run by the
PHONE SLIP control.

**No specific final drift magnitude is assumed or asserted.** These parameters
are chosen so divergence is visible; the resulting error emerges from the
equations and is never tuned toward a predetermined number. Whatever the
simulator produces is what the UI shows.

### 4.2 Three estimators, one IMU stream

**A. Naive INS** — no bias correction, no constraints:

```
psi += gyro_z*dt ;  v_n += (R(psi)*accel_body - g)*dt ;  p_n += v_n*dt
```

**B. ESKF + NHC baseline** — gyro heading, forward speed from integrated
longitudinal acceleration, lateral velocity forced to zero, ZUPT when
stationary:

```
psi += (gyro_z - bg_hat)*dt
v   += (accel_x - ba_hat)*dt
if (stationary) { v = 0; bg_hat += 0.02*gyro_z; }
p.x += v*cos(psi)*dt ;  p.y += v*sin(psi)*dt
```

**C. DRISHTI** — identical to B except forward speed comes from the speed model
rather than integration, plus NHC + ZUPT + map correction.

This difference is the entire thesis: **speed is estimated per window, not
integrated, so its error stays bounded instead of accumulating.**

### 4.3 Speed model

Models what a trained 1-D CNN would realistically produce. It does **not**
return truth:

```
v_hat = v_true + ar1Noise(sigma=0.35 m/s, rho=0.9) + 0.02*v_true
if (shockActive) { sigma_v *= 4; confidence -= 0.35; }
confidence = 1/(1+sigma_v)
```

The demonstrable point is that the classifier *detects* the shock and the
filter *down-weights* the estimate — not that the estimate is magically
unaffected.

### 4.4 Uncertainty — two variances, propagated separately

```
sigma_psi^2   += (gyro_noise^2 + bg_uncertainty^2) * dt^2
sigma_along^2 += sigma_v^2 * dt^2
sigma_cross^2 += (v * sigma_psi)^2 * dt^2
```

A GNSS fix collapses both toward GNSS accuracy. **A map match collapses
cross-track only, never along-track.**

That last constraint is the single most credible behaviour in the build. The
uncertainty ellipse must visibly become a long thin cigar pointing down the
road during blackout. This is verified by eye before the UI work proceeds.

#### 4.4.1 Amendment — coherent vs. incoherent error growth

**Implemented behaviour deviates from the literal equations above, because the
literal equations cannot produce the behaviour this same section requires.**

`sigma_along^2 += sigma_v^2 * dt^2` treats each timestep's speed error as
independent. Accumulated as a random walk over a 30 s blackout at 100 Hz that
yields roughly one centimetre of along-track uncertainty — the ellipse would
*shrink* under map matching rather than grow, contradicting both the cigar
requirement and the project's stated commitment to showing uncertainty
"including when it grows".

Two of the error sources are not white noise:

- The speed model is AR(1) with rho = 0.9 at 100 Hz, so its error has a
  correlation time tau = dt/(1-rho) = 0.1 s. Errors within a correlation time
  do not average out.
- The speed model carries a 2% systematic scale error, which is a bias, not
  noise. It integrates coherently.

Each axis therefore accumulates two contributions, combined in quadrature:

```
coherent    standard deviation grows linearly:  sigma += bias_rate * dt
incoherent  variance grows linearly:            var   += 2 * sigma_v^2 * tau * dt
```

with `bias_rate = 0.02 * |v|` along-track (speed scale error) and
`bias_rate = |v| * sigma_psi` cross-track (heading error integrating into
lateral offset). Heading variance grows as `(gyro_noise^2 + bg_uncertainty^2) * dt`,
the standard angle-random-walk form.

Measured result over a 30 s blackout at 14 m/s with 1 Hz map matches:
along-track 1.5 -> 9.3 m, cross-track held near 1.0 m, axis ratio ~8. The
0.02 * 14 * 27.5 = 7.7 m dominant term is the speed scale error, as expected.

The map-match constraint is unaffected: `collapseCrossTrack` still touches only
the cross-track variance, and the test asserts exact equality of `sigmaAlong`
across the call.

### 4.5 Map matching — top-K hypotheses

```
score = w1*exp(-perpDist^2/(2*sigma_cross^2)) + w2*cos(headingDiff)
      + w3*transitionPlausibility
```

Scores normalise to probabilities over K=3 candidates. **The estimate never
snaps to the winner.** Correction is applied proportional to `p_winner` and
inversely to `sigma_cross`, so a low-confidence match barely moves the
estimate. The full candidate list is exposed to the UI.

### 4.6 GNSS and integrity

1 Hz fix = `truth + gaussian(0, hdop*2.5)`. Modes: `NOMINAL` (hdop 1.2),
`DEGRADED` (hdop 6.0 at 0.5 Hz), `DENIED` (no fixes), `SPOOFED` (offset 420 m
at normal rate).

Chi-square gate:

```
nu = z_gnss - p_pred ;  S = P_pred + R_gnss ;  NIS = nu' * inv(S) * nu
reject if NIS > 9.21        // chi-square, 2 DoF, 99%
```

Returns `{NIS, threshold, accepted, reason}`. The UI shows the actual computed
NIS — small for real fixes, enormous for the spoof. It is never faked.

### 4.7 State machine

```
BOOT -> ALIGNING -> GNSS_ACTIVE <-> GNSS_DEGRADED
                         |               |
                     DR_ACTIVE <---------+
                         |
                    REACQUIRING -> GNSS_ACTIVE
```

- `ALIGNING` runs 6 s solving mount yaw/pitch/roll with a climbing confidence
  bar, and ends automatically.
- `-> DR_ACTIVE` on the blackout control or 3 consecutive missing fixes. The
  header flashes red once; the canvas vignette shifts faintly red.
- `-> REACQUIRING` on the first returning fix. **Position does not jump.** The
  estimate blends over 2.5 s with ease-out and a `BLENDING` progress chip. A
  visible snap here is a demo failure.
- `MOUNT_CHANGE` from the phone-slip control inflates `sigma_psi`, shows
  re-alignment progress, and resolves in ~4 s.

### 4.8 Ablation

The three toggles change estimator behaviour, not presentation:

- **AI SPEED off** — DRISHTI's forward speed falls back to integrated
  `accel_x`, inheriting the accel bias and degrading toward the ESKF baseline
  within seconds.
- **MAP off** — no cross-track collapse; the ellipse fattens sideways
  immediately.
- **NHC off** — lateral velocity is no longer forced to zero.

---

## 5. Honesty constraints

An ISRO navigation expert will look for exactly these. They are requirements,
not preferences.

1. A persistent, non-dismissible header block: `RUNTIME / SIMULATION ·
   SYNTHETIC IMU` (amber) and `TARGET RUNTIME / Android on-device / edge C++`
   (muted).
2. The learned speed estimator is labelled **`SPEED MODEL (SIMULATED)`**
   everywhere it appears. It is a modelled stand-in for a TCN that has not been
   trained. It is never labelled "trained model" and no training accuracy is
   ever shown.
3. A `DATA SOURCE` selector with `SYNTHETIC SIMULATOR` (active), `IO-VNBD
   REPLAY` (disabled), `FIELD REPLAY` (disabled). Disabled options show
   `RESULTS PENDING — DATASET INGESTION` on hover.
4. Every metric panel carries a one-line provenance caption in `--text-lo`,
   e.g. `Computed from synthetic IMU at 100 Hz`, `Derived from filter
   covariance`.
5. The 10% ISRO threshold is labelled `TARGET` — never `ACHIEVED`, never
   `VALIDATED`.
6. A permanent 10px footer: `DRISHTI DEMONSTRATION BUILD · Synthetic IMU,
   simulated estimator outputs · No measured benchmark claims`.
7. No screen displays "accuracy", "validated", "proven", or a table of measured
   benchmark results.

### 5.1 The error/distance figure is not clamped

The error-over-distance metric may exceed the 10% TARGET line during a deep
blackout. It is displayed unclamped. If the honest output sits above TARGET for
part of a run, that is a talking point about uncertainty growth, not a bug to
be hidden.

### 5.2 Numeric literal carve-out

The acceptance criterion "no numeric literal in a metric slot" has exactly one
carve-out: the chi-square threshold `9.21` and the `10%` TARGET reference are
constants **of the method**, not results. Both are defined as named constants
in `lib/sim/` and rendered from there, so the grep stays clean.

---

## 6. Design system

Aerospace ground-station console. Dark, dense, instrument-like — an ISRO
navigation console that happens to contain a beautiful map, not a consumer
navigation app.

```
--bg-void      #05090F   page background
--bg-panel     #0B1420   panel fill
--bg-raised    #121E2E   inner cards, table rows
--border       #1E2E42   panel borders
--border-hot   #2B4A6B   active panel border

--text-hi      #E8F0F8   primary
--text-mid     #8FA3BC   labels
--text-lo      #56697F   captions, provenance

--truth        #22C55E   ground truth
--drishti      #38BDF8   DRISHTI
--naive        #F43F5E   naive INS
--accent       #22D3EE   active UI, focus
--warn         #F59E0B   simulation badge, degraded
--danger       #EF4444   GNSS denied, rejection
--ok           #22C55E   nominal
```

**All numerals are mono with `font-variant-numeric: tabular-nums`**, so values
do not jitter as they update. This is not cosmetic — jittering numbers read as
fake. Labels are 10px uppercase, 0.08em tracking. Presentation-mode metric
values are 34px; technical mode 24px.

1px borders, 4px max radius, no gradients except one radial vignette on the
canvas, no shadows except the floating control bar, 8px grid, 16px panel
padding, 12px panel gap.

### 6.1 Visual storytelling rule

Every animation must communicate a physical or algorithmic event. Permitted:
GNSS loss as a red state transition, covariance growth as an expanding ellipse,
a pothole as an IMU spike plus confidence drop, a spoofed fix as a rejection
flash, map ambiguity as ghost candidate roads, recovery as a smooth convergence
blend. Forbidden: floating particles, rotating 3-D objects, animated
backgrounds, decorative charts, perpetual motion with no meaning, easing on
things that are not physically moving.

**If an animation cannot be traced to a variable in `lib/sim/`, it is deleted.**

---

## 7. Stack and offline requirement

Next.js 15 App Router, TypeScript, Tailwind v4 with the palette as `@theme`
tokens. `framer-motion` for state transitions only. No map library, no backend,
no API keys. The road network is drawn as SVG from hard-coded coordinates.

**System font stacks only** (`-apple-system` / `ui-monospace`). `next/font/google`
self-hosts but still fetches at build time; system stacks give SF Pro and SF
Mono on macOS for zero network at any stage.

After initial page load: zero `fetch()`, zero WebSocket, zero external images,
zero CDN dependencies, zero map tiles, zero analytics. The demo must run
identically with Wi-Fi off.

---

## 8. Testing

Vitest against `lib/sim` only. Five tests that matter:

1. **Determinism** — same seed produces byte-identical final state across two
   full runs.
2. **No `Math.random`** — a grep over `lib/sim/` returns nothing.
3. **Anisotropic collapse** — a map match collapses cross-track variance while
   along-track variance keeps growing.
4. **Integrity gate** — chi-square accepts nominal fixes and rejects the 420 m
   spoof with a large NIS.
5. **Divergence** — naive INS error grows without bound while DRISHTI error
   stays bounded.

---

## 9. Acceptance criteria

- Cold load to interactive under 2 s.
- Zero network requests after load; verified with Wi-Fi off.
- 60 fps with all panels open.
- Every displayed number traceable to a variable in `lib/sim/` (subject to the
  section 5.2 carve-out).
- `Math.random()` appears nowhere in `lib/sim/`.
- Two consecutive RESET → RUN cycles produce identical final numbers.
- The runtime block and honesty footer are visible in every screenshot.
- One deployable Next.js app that runs in airplane mode.

---

## 10. Out of scope

No login, settings page, landing page, chatbot, 3-D vehicle, satellite
constellation, backend, database, theme switcher, or Android app. No results
table. No measured-performance claim anywhere. No live-lighting architecture
diagram — the decision strip and ablation toggles deliver the same message for
a fraction of the effort.
