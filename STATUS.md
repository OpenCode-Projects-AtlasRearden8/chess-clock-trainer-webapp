# STATUS.md

## What was built

**Chess Clock Trainer** — an offline, single-file web app for chess *clock skills* (not chess itself). Pure HTML/JS/CSS, zero dependencies, runs straight from `file://`. No engine, no chess.com or any other service, no network.

- **Chess clock** (`index.html`, Clock tab): two-side clock with Fischer increment (goes to the player who just moved). Start/pause/reset, `Space`/`P`/`R` keyboard controls, tap the active side to hand over, flag detection with a win-on-time banner.
- **Per-move par counters** (Drills→built into the clock): set a par time per move; each side tracks move count, current-move elapsed, cumulative average, and drift — labeled *ahead of par / on pace / behind par* with a ±0.5 s tolerance (color-coded).
- **Time-trouble wake-ups**: WebAudio beeps (no audio files) at a configurable wake threshold (default 30 s) and a steady heartbeat in critical territory (default 10 s), plus pulsing ring visuals on the low clock.
- **Blink-and-think endgame chair** (Drills tab): paced drill — short **Blink** window for the gut first idea, longer **Think** window to calculate, beeps on phase switches, configurable durations and rounds.
- **Setup profiles** (Profiles tab): save/load/delete clock presets (minutes, increment, par, wake/critical thresholds) in `localStorage` (`cct.profiles.v1`), plus persisted general settings (`cct.settings.v1`). Sanitizing/clamping on load, resilient to corrupt stored JSON.

## How to run it

Open `index.html` directly in a browser (double-click works; `file://` is fully supported).

```bash
# optional, if node is available:
npm test
```

## Verification results

- `tests/run-tests.mjs` — **31/31 pass.** Covers par math (move averages, drift, status thresholds, tolerance override, invalid-input handling, fractional-move flooring) and profile storage (save/list/get/update/delete, id assignment, clamping, junk rejection, corrupt-JSON recovery, cross-store persistence).
- `tests/smoke-app.mjs` — **pass.** Headless smoke test of full app wiring via a minimal DOM shim: start/pause/reset ticking, time decrement, par toggle, settings clamping + persistence, profile save/load/delete, blink-chair phase cycling, flag banner on time-out. Running it caught and fixed a real bug (blink chair rendered "READY" instead of "BLINK" on start).
- `npm test` runs both suites. No network access needed or used at any point.

## Known gaps

- Covers common time controls with game points already deducted (no delay/Bronstein modes).
- Par counters measure *thinking time per move played on the trainer clock* — they can't verify that you used the time well.
- Wake-up beeps require a user gesture first (browser autoplay rules); the first click/keypress initializes audio, so pre-move beeps won't fire before you touch the page.
- Increment is Fischer-style only; applied to the player who just moved.
- No i18n, no light theme, no PWA manifest/install prompt (still fully usable — it's one file).
- Blink chair is time-only pacing (no board/piece integration, by design, to avoid overlapping with chess-puzzle-drills).
