# DRISHTI

GNSS-denied vehicle navigation demonstration for Smart India Hackathon 2026,
problem SIH26168 (ISRO).

> **This is a simulation.** The vehicle, road network, and every IMU sample are
> synthetic and generated at runtime from a seeded PRNG. No field data, no
> recorded dataset, no measured benchmark.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

Production:

```bash
npm run build && npm start
```

Runs entirely offline after load — no `fetch`, no CDN, no map tiles, no fonts
fetched at runtime. Verified with all non-localhost requests blocked.

The optional field link adds a **LAN-only** WebSocket to a phone. Still no
internet dependency; see below.

## Field unit — phone as a live sensor node

The phone becomes a real telemetry node and remote control; the laptop stays
Mission Control. **The phone's sensors are real. The navigation scenario they
trigger is simulated.** Both sides label this everywhere.

### It must be https. This is not optional.

`DeviceMotionEvent` and `DeviceOrientationEvent` are **secure-context only** in
Android Chrome and iOS Safari. A phone opening `http://<lan-ip>/field` receives
**no sensor events at all, silently** — no error, just zeros. `http://localhost`
would be a secure context, but the phone cannot reach the laptop that way.

```bash
npm run cert     # self-signed cert covering this machine's LAN address
npm run link     # Next + WebSocket relay on ONE port
```

The console prints the exact phone URL. On the phone, open it, tap **Advanced →
Proceed** past the certificate warning (that grants the secure context), then
**Enable sensor access**.

If a certificate is impractical, allow the origin in Android Chrome under
`chrome://flags/#unsafely-treat-insecure-origin-as-secure` instead.

`/field` detects all of this at runtime and tells you which case you are in
rather than showing zeros that look like readings.

### Port

Defaults to 3000; override with `PORT`. (Docker often holds 3000 — `PORT=3443
npm run link` works.)

### What is real on the link

Real: the WebSocket, phone accelerometer/gyroscope/orientation, measured sample
rate, packet counts, round-trip latency from a heartbeat echo, and every button
press. Simulated: everything downstream — trajectory, GNSS, dead reckoning, map
matching, integrity.

**Phone orientation drives a visualisation only.** It never reaches the
estimator, and the simulated vehicle's heading is unaffected by it. There is a
test that fails the build if that ever changes.

Note that a run driven by phone commands is no longer the seeded judge demo —
pressing RESET returns to seed 26168.

## Use it

Press **RUN JUDGE DEMO**. The scripted scenario runs ~117 s:

| t | Event |
|---|---|
| 5 s | Alignment complete |
| 15 s | GNSS denied — blackout begins |
| 18 s | Pothole — shock detected, speed estimate down-weighted |
| 38 s | Spoofed fix injected — rejected by the χ² gate |
| 45 s | GNSS restored — 2.5 s blend, no position snap |
| ~117 s | Mission complete |

**RESET** re-seeds to 26168 and reproduces the run exactly. **NEW RUN** takes a
fresh seed and displays it.

### Keyboard

`Space` run/pause · `R` reset · `J` presentation · `T` technical · `F` fullscreen
· `G` cycle GNSS · `P` pothole · `S` phone slip · `A`/`M`/`N` toggle AI speed /
map / NHC

## What it shows

Three estimators consume the same synthetic IMU stream:

- **Naive INS** — double-integrates world-frame acceleration, no bias
  correction, no constraints.
- **ESKF + NHC baseline** — bias-corrected gyro, lateral velocity forced to
  zero, ZUPT when stationary, forward speed from *integrating* acceleration.
- **DRISHTI** — identical to the baseline except forward speed comes from a
  per-window *estimate*, plus map correction.

That one difference is the thesis: an accelerometer bias becomes a velocity ramp
under integration and then a position error growing with the square of time. A
per-window estimate has bounded error, so position error grows linearly at
worst. Toggle **AI SPEED** off and DRISHTI becomes the baseline exactly, because
the speed model is the only difference between them.

## Tests

```bash
npm test
```

70 tests over `lib/sim` plus an acceptance audit that fails the build if the UI
ever claims accuracy, validation, or a measured result, if the link layer ever
hardcodes a host instead of deriving it from the page origin, or if phone
orientation ever reaches the estimator.

## Docs

- `docs/superpowers/specs/2026-08-31-drishti-design.md` — design spec, including
  four amendments where the original equations were corrected
- `docs/superpowers/plans/2026-08-31-drishti.md` — implementation plan
