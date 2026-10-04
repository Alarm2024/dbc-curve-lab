import BN from 'bn.js';
import * as dbc from '@meteora-ag/dynamic-bonding-curve-sdk';

// The lab. Every number comes from Meteora's own DBC SDK math (the same
// functions the SDK uses to quote swaps): segment deltas, next-sqrt-price on
// input, migration threshold price, and the base-fee scheduler. This file only
// walks the curve and adds things up. Nothing here builds or signs a transaction.

const {
  getDeltaAmountBaseUnsigned,
  getDeltaAmountQuoteUnsigned,
  getNextSqrtPriceFromInput,
  getMigrationThresholdPrice,
  getPriceFromSqrtPrice,
  getBaseFeeNumeratorByPeriod,
  Rounding,
  BaseFeeMode,
} = dbc;

export interface CurvePoint {
  sqrtPrice: BN;
  liquidity: BN;
}

/** The parts of a DBC config the lab reads (ConfigParameters and the on-chain PoolConfig both carry them). */
export interface CurveConfig {
  sqrtStartPrice: BN;
  migrationQuoteThreshold: BN;
  curve: CurvePoint[];
  baseDecimals: number;
  quoteDecimals: number;
  totalBaseSupply: BN; // pre-migration supply, base units
  baseFee: { cliffFeeNumerator: BN; numberOfPeriod: number; periodFrequency: BN; reductionFactor: BN; mode: number };
}

export interface Step {
  raisedPct: number; // share of the migration threshold paid in so far
  quoteIn: number; // this step, quote units (after fee)
  baseOut: number; // this step, base units
  avgPrice: number; // quote per base for this step
  priceAfter: number; // spot price after the step
}

export interface FeePoint {
  seconds: number;
  feeBps: number;
}

export interface Report {
  startPrice: number;
  migrationPrice: number;
  priceMultiple: number;
  migrationQuote: number; // quote units needed to graduate (net of fees)
  startMarketCap: number; // quote units, on total pre-migration supply
  migrationMarketCap: number;
  baseSoldOnCurve: number; // base units sold before migration
  supplySoldPct: number;
  segments: { quote: number; fromPrice: number; toPrice: number }[];
  ladder: Step[];
  firstBuyerVsLast: number; // last step's average price ÷ first step's
  fees: FeePoint[];
  sniper: { amountQuote: number; feeAtOpen: number; feeAfterSchedule: number; scheduleSeconds: number };
  notes: string[];
}

const toNum = (b: BN, decimals: number): number => Number(b.toString()) / 10 ** decimals;

function price(sqrt: BN, c: CurveConfig): number {
  return Number(getPriceFromSqrtPrice(sqrt, c.baseDecimals, c.quoteDecimals).toString());
}

/** Active segments: (lower, upper, liquidity). Segment i runs from the previous point (or the start price) to point i. */
export function segments(c: CurveConfig): { lower: BN; upper: BN; liquidity: BN }[] {
  const out: { lower: BN; upper: BN; liquidity: BN }[] = [];
  let lower = c.sqrtStartPrice;
  for (const p of c.curve) {
    if (p.sqrtPrice.isZero() || p.liquidity.isZero()) break; // on-chain arrays are zero-padded
    if (p.sqrtPrice.lte(lower)) continue;
    out.push({ lower, upper: p.sqrtPrice, liquidity: p.liquidity });
    lower = p.sqrtPrice;
  }
  return out;
}

/** Buy with `quoteIn` (net of fee) from `sqrt`; returns the new sqrt price and base out. Crosses segments like the program does. */
export function buy(c: CurveConfig, sqrt: BN, quoteIn: BN): { sqrt: BN; baseOut: BN; quoteUsed: BN } {
  let left = quoteIn.clone();
  let cur = sqrt.clone();
  let baseOut = new BN(0);
  for (const s of segments(c)) {
    if (left.isZero()) break;
    if (cur.gte(s.upper)) continue;
    const from = BN.max(cur, s.lower);
    const room = getDeltaAmountQuoteUnsigned(from, s.upper, s.liquidity, Rounding.Up);
    if (left.gte(room)) {
      baseOut = baseOut.add(getDeltaAmountBaseUnsigned(from, s.upper, s.liquidity, Rounding.Down));
      left = left.sub(room);
      cur = s.upper;
    } else {
      const next = getNextSqrtPriceFromInput(from, s.liquidity, left, false);
      baseOut = baseOut.add(getDeltaAmountBaseUnsigned(from, next, s.liquidity, Rounding.Down));
      left = new BN(0);
      cur = next;
    }
  }
  return { sqrt: cur, baseOut, quoteUsed: quoteIn.sub(left) };
}

/** Base fee in bps after `seconds`, from the config's scheduler. */
export function baseFeeBps(c: CurveConfig, seconds: number): number {
  const f = c.baseFee;
  if (f.mode !== BaseFeeMode.FeeSchedulerLinear && f.mode !== BaseFeeMode.FeeSchedulerExponential) return NaN;
  const freq = Number(f.periodFrequency.toString()) || 1;
  const period = Math.min(f.numberOfPeriod, Math.floor(seconds / freq));
  const num = getBaseFeeNumeratorByPeriod(f.cliffFeeNumerator, f.numberOfPeriod, new BN(period), f.reductionFactor, f.mode);
  return Number(num.toString()) / 1e5; // numerator over 1e9 → bps
}

export function analyze(c: CurveConfig, steps = 20): Report {
  const qd = c.quoteDecimals;
  const bd = c.baseDecimals;
  const migrationSqrt = getMigrationThresholdPrice(c.migrationQuoteThreshold, c.sqrtStartPrice, c.curve);
  const startPrice = price(c.sqrtStartPrice, c);
  const migrationPrice = price(migrationSqrt, c);
  const supply = toNum(c.totalBaseSupply, bd);

  const segs = segments(c).map((s) => {
    const upper = BN.min(s.upper, migrationSqrt);
    const quote = upper.gt(s.lower) ? toNum(getDeltaAmountQuoteUnsigned(s.lower, upper, s.liquidity, Rounding.Up), qd) : 0;
    return { quote, fromPrice: price(s.lower, c), toPrice: price(upper, c) };
  }).filter((s) => s.quote > 0);

  const ladder: Step[] = [];
  let sqrt = c.sqrtStartPrice;
  let baseTotal = new BN(0);
  const stepQuote = c.migrationQuoteThreshold.divn(steps);
  for (let i = 1; i <= steps; i++) {
    const amount = i === steps ? c.migrationQuoteThreshold.sub(stepQuote.muln(steps - 1)) : stepQuote;
    const r = buy(c, sqrt, amount);
    sqrt = r.sqrt;
    baseTotal = baseTotal.add(r.baseOut);
    const q = toNum(r.quoteUsed, qd);
    const b = toNum(r.baseOut, bd);
    ladder.push({ raisedPct: (i / steps) * 100, quoteIn: q, baseOut: b, avgPrice: b > 0 ? q / b : NaN, priceAfter: price(sqrt, c) });
  }

  const f = c.baseFee;
  const scheduleSeconds = f.numberOfPeriod * (Number(f.periodFrequency.toString()) || 0);
  const marks = [0, 5, 10, 30, 60, 120, 300, 600, 1800, 3600].filter((s) => s <= Math.max(60, scheduleSeconds * 1.2));
  const fees = marks.map((s) => ({ seconds: s, feeBps: baseFeeBps(c, s) }));
  const sniperAmount = toNum(c.migrationQuoteThreshold, qd) / 100;
  const atOpen = baseFeeBps(c, 0);
  const after = baseFeeBps(c, scheduleSeconds);

  const notes: string[] = [];
  notes.push('Base fee only. A dynamic (volatility) fee, if enabled, is added on top during fast moves and is not modelled here.');
  notes.push('Ladder steps are net of fees: the quote that reaches the curve.');

  const first = ladder[0]?.avgPrice ?? NaN;
  const last = ladder[ladder.length - 1]?.avgPrice ?? NaN;
  return {
    startPrice,
    migrationPrice,
    priceMultiple: migrationPrice / startPrice,
    migrationQuote: toNum(c.migrationQuoteThreshold, qd),
    startMarketCap: startPrice * supply,
    migrationMarketCap: migrationPrice * supply,
    baseSoldOnCurve: toNum(baseTotal, bd),
    supplySoldPct: (toNum(baseTotal, bd) / supply) * 100,
    segments: segs,
    ladder,
    firstBuyerVsLast: last / first,
    fees,
    sniper: { amountQuote: sniperAmount, feeAtOpen: (sniperAmount * atOpen) / 1e4, feeAfterSchedule: (sniperAmount * after) / 1e4, scheduleSeconds },
    notes,
  };
}

/** From the SDK's ConfigParameters (what buildCurve* returns). */
export function fromConfigParameters(p: dbc.ConfigParameters, quoteDecimals: number): CurveConfig {
  const bf = p.poolFees.baseFee;
  return {
    sqrtStartPrice: p.sqrtStartPrice,
    migrationQuoteThreshold: p.migrationQuoteThreshold,
    curve: p.curve.map((x) => ({ sqrtPrice: x.sqrtPrice, liquidity: x.liquidity })),
    baseDecimals: p.tokenDecimal,
    quoteDecimals,
    totalBaseSupply: p.tokenSupply ? p.tokenSupply.preMigrationTokenSupply : new BN(0),
    baseFee: { cliffFeeNumerator: bf.cliffFeeNumerator, numberOfPeriod: bf.firstFactor, periodFrequency: bf.secondFactor, reductionFactor: bf.thirdFactor, mode: bf.baseFeeMode },
  };
}
