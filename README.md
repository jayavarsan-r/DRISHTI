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

67 tests over `lib/sim` plus an acceptance audit that fails the build if the UI
ever claims accuracy, validation, or a measured result.

## Docs

- `docs/superpowers/specs/2026-08-31-drishti-design.md` — design spec, including
  four amendments where the original equations were corrected
- `docs/superpowers/plans/2026-08-31-drishti.md` — implementation plan
