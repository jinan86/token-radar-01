// Token Radar — model radar-2.
//
// One sealed DefiLlama snapshot in, one ranked board out. The board ranks every
// rankable pre-token protocol in the snapshot: the 40-protocol watchlist is the
// floor, never the ceiling, and the early radar adds every other pre-token
// protocol below the floor (158 more here), so the board holds 198 rows.
//
// A protocol is pre-token when its record carries no token at all: no market
// cap, no CoinGecko id, no symbol. Saying it "records no token" is the claim;
// the snapshot is DefiLlama's record, not proof it has none. Live-token
// protocols are kept apart and shown with their market caps, never mixed into
// the ranking.
//
// Implied value is derived only from the snapshot's own figures — no protocol
// name is ever special-cased and no row is hand-picked:
//
//   sector multiple  = the median FDV/TVL of the live-token protocols in the
//                      same category (at least 3 of them), else the median
//                      across all live-token protocols, clamped to [0.05, 1.20].
//                      This is the market's own price for a dollar of TVL in
//                      that sector, read from the snapshot itself.
//   base             = tvl_usd x sector multiple
//   growth           = clamp(change_7d, -60, 120) per cent
//   growthMult       = 1 + (growth / 100) x 0.5
//   maturity         = 0.6 + min(age_days, 1095) / 1095 x 0.4
//                      (age unknown: 365 days; age is days since DefiLlama
//                      first listed the protocol — how long it has run
//                      with no token on record)
//   breadth          = 1 + 0.03 x min(chains - 1, 5)   (1.00–1.15)
//   implied          = max(1, round(base x growthMult x maturity x breadth))
//
// The radar score (0–100, display only — rank is by implied value) combines
// the same inputs on a log scale so a reader can compare rows at a glance:
// 50 points value (log implied value across the board), 25 momentum (clamped
// 7-day growth), 15 maturity, 10 chain breadth.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard and in the page's sandbox. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  sector_multiple_floor: number;
  sector_multiple_cap: number;
  sector_min_sample: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_per_chain: 0.03,
  breadth_max_chains: 5,
  sector_multiple_floor: 0.05,
  sector_multiple_cap: 1.2,
  sector_min_sample: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  score: number;
  model: {
    sector_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  score: number;
  watchlist: boolean;
  sector_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One sector's market multiple, for the methodology panel. */
export interface SectorRow {
  category: string;
  sample: number;
  multiple: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  median_implied_usd: number;
  sectors: SectorRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Median of a non-empty list. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Categories that mark a wrapped, staked or bridged product of a token that already trades. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Whole words that mark a wrapped or staked product. */
const WRAPPED_WORDS = /\b(wrapped|staked|staking)\b/i;
/** Exchange names a wrapped product begins with. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/**
 * Whether a protocol is a wrapped, staked or bridged product of a token that
 * already trades: WBTC is Bitcoin on Ethereum, Binance staked ETH is ETH in
 * Binance's staking product, and neither is a protocol still waiting on a
 * launch of its own. This is the watchlist rule itself, applied to the early
 * radar too: the same fields (category, name) decide, never a hand-kept list.
 */
export function isWrappedProduct(p: SnapshotProtocol): boolean {
  return (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) || WRAPPED_WORDS.test(p.name) || EXCHANGE_PREFIX.test(p.name) || VERSIONED.test(p.name);
}

/**
 * The sector multiples: for each category, the median FDV/TVL of its
 * live-token protocols (mcap and TVL both present), when at least
 * `sector_min_sample` of them exist; otherwise the overall live median.
 * Every multiple is clamped to the model's floor and cap. The map is the
 * market's own pricing, read from this snapshot — never a hand-kept table.
 */
export function sectorMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, number>; overall: number; table: SectorRow[] } {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0);
  const overall = Math.min(model.sector_multiple_cap, Math.max(model.sector_multiple_floor, median(live.map((p) => p.mcap_usd! / p.tvl_usd))));
  const byCategory = new Map<string, number>();
  const table: SectorRow[] = [];
  const cats = new Map<string, number[]>();
  for (const p of live) cats.set(p.category ?? 'Other', [...(cats.get(p.category ?? 'Other') ?? []), p.mcap_usd! / p.tvl_usd]);
  for (const [cat, ratios] of [...cats.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const m = ratios.length >= model.sector_min_sample
      ? Math.min(model.sector_multiple_cap, Math.max(model.sector_multiple_floor, median(ratios)))
      : overall;
    byCategory.set(cat, m);
    table.push({ category: cat, sample: ratios.length, multiple: round4(m) });
  }
  return { byCategory, overall, table };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  sectorMultiple: number,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);
  const breadthMult = 1 + model.breadth_per_chain * extraChains;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * sectorMultiple * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n and scores 0–100. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const { byCategory, overall } = sectorMultiples(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  // The watchlist is the floor: every slug it names. The early radar is every
  // other rankable pre-token protocol in the snapshot, whatever its TVL — the
  // radar exists to find future launches early, not to re-list the floor.
  // Wrapped, staked and bridged products of tokens that already trade are
  // left out of the early radar by the same rule that left them off the
  // watchlist: they are not protocols waiting on a launch of their own.
  const chosen = snapshot.protocols.filter((p) => watchlist.has(p.slug) || (isRankable(p) && !isWrappedProduct(p)));
  if (chosen.length === 0) throw new SnapshotError('no rankable pre-token protocol in the snapshot');

  const scored = chosen.map((p) => {
    const sector = byCategory.get(p.category ?? 'Other') ?? overall;
    const v = impliedValue(p, snapshot.as_of, sector, model);
    return { p, sector, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  // Radar score, display only: log value across the board (50), momentum (25),
  // maturity (15), breadth (10). Rank itself is always by implied value.
  const logs = scored.map((s) => Math.log10(Math.max(1, s.implied)));
  const lo = Math.min(...logs);
  const hi = Math.max(...logs);
  const span = Math.max(hi - lo, 1e-9);
  return scored.map((s, i) => {
    const valuePts = 50 * ((Math.log10(Math.max(1, s.implied)) - lo) / span);
    const momentumPts = 25 * ((Math.min(Math.max(s.growthPct, -60), 120) + 60) / 180);
    const ageForScore = s.age ?? model.unknown_age_days;
    const maturityPts = 15 * (Math.min(Math.max(ageForScore, 0), model.maturity_days) / model.maturity_days);
    const breadthPts = 10 * ((s.breadthMult - 1) / (model.breadth_per_chain * model.breadth_max_chains));
    const score = Math.round(Math.min(100, Math.max(0, valuePts + momentumPts + maturityPts + breadthPts)) * 10) / 10;
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      watchlist: watchlist.has(s.p.slug),
      age_days: s.age,
      implied_value_usd: s.implied,
      score,
      model: {
        sector_multiple: s.sector,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        breadth_multiplier: round4(s.breadthMult),
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** Typical gas for one transaction on the protocol's main chain. */
function gasFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'solana') return 'about $0.05 of gas';
  if (c === 'base' || c === 'arbitrum' || c === 'optimism' || c === 'ink' || c === 'abstract') return 'about $0.50 of gas';
  if (c === 'ethereum') return 'about $8 of gas';
  if (c === 'bitcoin' || c === 'tron' || c === 'binance') return 'about $2 of gas';
  return 'about $3 of gas';
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('index')) return `Buy $${capital} of the ${name} index on ${chain} and hold the receipt.`;
  if (c.includes('farm') || c.includes('aggregator')) return `Deposit $${capital} into ${name}'s top vault on ${chain} and keep the shares.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL
 * and age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week on ${chain}, such as a deposit, a borrow, a swap or a vote.`,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Once a week open ${p.name}'s own points or rewards page and note any quests or streaks it lists.`,
      cost: 'no fee to check',
      time: '10 minutes a week',
    },
    {
      text: `Before you withdraw, claim only from a link the protocol itself publishes, and never pay to claim.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    score: row.score,
    watchlist: row.watchlist,
    sector_multiple: row.model.sector_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const { table, overall } = sectorMultiples(snapshot, model);
  const early = board.filter((r) => !r.watchlist).length;
  const total = board.reduce((n, r) => n + r.implied_value_usd, 0);
  const sorted = [...board].map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const med = sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2]! : Math.round((sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: total,
    median_implied_usd: med,
    sectors: table,
    rows: board.map(radarRow),
    live,
  };
  void overall;
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
