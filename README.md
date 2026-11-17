# Token Radar — Build the best token launch radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jinan86/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jinan86/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A program plus the dashboard it writes. It reads the sealed DefiLlama
snapshot (`/input/snapshot.json`, 758 protocols at or above $5M TVL, fetched
2026-11-14), ranks every rankable pre-token protocol by what its launch
would be worth, and shows each one with the steps to farm it.

Entry for [make.fun bounty `token-radar-01`](https://make.fun/bounty/token-radar-01)
— "Build the best token launch radar". $1,325 in prizes, 10 paid places.
Deadline 2026-12-14 10:00 UTC.

## What it does

- **Board:** 198 rows — the whole 40-protocol watchlist (TVL ≥ $50M, no
  token on record, not wrapped/staked/bridged) plus 158 more rankable
  pre-token protocols below the floor. Wrapped, staked and bridged
  products of tokens that already trade are left out of the early radar
  by the same rule that left them off the watchlist — WBTC is Bitcoin on
  Ethereum, not a protocol waiting on a launch. Live-token protocols are kept apart
  and shown with their market caps, never mixed into the ranking.
- **Model `radar-2`:** implied value is derived only from the snapshot's
  own figures, never from a hand-kept list of names:
  `implied = round(TVL × sector multiple × growth × maturity × breadth)`,
  where the **sector multiple** is the median FDV/TVL of the live-token
  protocols in the same category (≥3 of them, else the overall live median,
  clamped 0.05–1.20) — the market's own price for a dollar of TVL in that
  sector. Growth is the clamped 7-day TVL change; maturity is time since
  first listing with no token; breadth rewards multi-chain protocols.
  A 0–100 radar score (display only) combines the same inputs on a log scale.
- **Farm plans:** 7 concrete steps per protocol, derived from its category,
  chains, TVL and age — capital tier ($50–$250), chain-specific gas,
  weekly cadence, hold window (30–60 days), points-page checks, claim
  safety, and a farm log.
- **Dashboard:** static, no network, no framework. Sortable table (rank,
  name, TVL, 7d, age, score, implied value), filters (search, category,
  chain, min TVL, watchlist-only), pre-token / live-token tabs, top-5
  spotlight, a detail view for every protocol with the full model
  breakdown (recomputed in the page and checked against `board.json`),
  a methodology panel with every sector multiple, and a **model sandbox**
  that re-ranks the board live under different weights.

## Run it

Requires Node.js 22.18+.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input kit/input/snapshot.json
```

That writes `out/board.json`, `out/data.js`, `out/dashboard/`,
`out/screenshots/` and `out/dossier.json`. Open `out/dashboard/index.html`
in a browser (it reads `../data.js`, so serve or open the `out/` folder).

## Screenshots

` screenshots/` holds the three required views, each 1440×900 PNG:

1. `1-board.png` — the board
2. `2-detail.png` — a protocol's detail view
3. `3-filtered.png` — a filtered view

Taken in headless Chromium from the built dashboard (see PROGRESS.md).

## Layout

- `main.ts` — entrypoint: snapshot in, board + data + dashboard + screenshots + dossier out
- `lib/model.ts` — the radar-2 model, farm plans, snapshot parsing, gate self-check
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte from the kit
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`; 38,497 bytes total, under the 65,536-byte dossier text cap)
- `kit/` — the competition kit (requirements, starter, sealed snapshot)

## Honest caveats

- "Records no token" is DefiLlama's record, not proof a protocol has no
  token; no launch is predicted, and implied value is this entry's own
  estimate, never a price.
- The snapshot is frozen at 2026-11-14; the radar re-derives everything
  from whatever snapshot it is given, so a future snapshot re-ranks
  automatically — but it cannot see protocols that do not exist yet.

## License

MIT — see `LICENSE`.
