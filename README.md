# Chess Clock Trainer

An offline, single-file web app for practicing chess **clock skills** — not chess. No engine, no chess.com dependency, no network. Everything lives in one `index.html` you can open straight from your file system.

Built by [Asdale Dynamics, LLC](https://dylanasdale.github.io) as part of its line of friendly, local-first tools.

## What's inside

**The clock** (Clock tab)
- Classic two-side chess clock with optional Fischer increment (goes to the player who just moved)
- Tap the active side, press `Space`, or click **Start** to begin; `P` pauses, `R` resets

**Pace drills**
- **Per-move par counters** — set a par time per move (e.g. 15 s). Every completed move is timed; the clock shows your average and drift, calling you *ahead of par*, *on pace*, or *behind par* (±0.5 s tolerance)
- **Time-trouble wake-ups** — configurable beep thresholds: a wake-up beep shortly before brute-o'clock (default 30 s) and a steady heartbeat once you're in critical territory (default 10 s), plus pulsing ring visuals
- **Sound on/off** toggle for quiet training

**Blink-and-think endgame chair** (Drills tab)
- A paced drill for endgame away from a board: a short **Blink** window for your gut first idea (king activity, the candidate move), then a longer **Think** window to calculate. Beeps mark the switches, for as many rounds as you want.

**Setup profiles** (Profiles tab)
- Save clock presets (minutes, increment, par, wake-up thresholds) into `localStorage`
- Load them next session with one click; nothing is ever sent anywhere
- Everything stays on your device. localStorage only, no accounts, no tracking.

## Run it

```bash
# just open it — no server, no build step:
open index.html          # macOS
# or double-click index.html in your file manager
```

Works from `file://`. Pure HTML/JS/CSS, zero dependencies.

## Tests

```bash
node tests/run-tests.mjs
```

31 tests cover the par math (averages, drift, ahead/on-pace/behind thresholds, tolerance rules) and profile storage (save/load/update/delete, clamping, junk rejection, corrupt-JSON recovery).

## Privacy

- No network calls, no engine, no third-party services
- Profiles and settings stored only in your browser's `localStorage`
- No secrets, keys, or personal data anywhere in the code

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Asdale Dynamics, LLC.
