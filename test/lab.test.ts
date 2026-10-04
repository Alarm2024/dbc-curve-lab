import { test } from 'node:test';
import assert from 'node:assert/strict';
import BN from 'bn.js';
import * as dbc from '@meteora-ag/dynamic-bonding-curve-sdk';
import { analyze, buy, baseFeeBps, fromConfigParameters, segments } from '../src/lab.ts';
import { buildConfig, loadPresets, type Preset } from '../src/presets.ts';

// These tests check the lab against Meteora's own SDK: the curve the SDK builds
// from a preset must give back the preset's numbers, and walking the full
// threshold must end exactly at the SDK's migration price. Presets are example
// designs, not market data.

const presets = loadPresets();
const close = (a: number, b: number, rel = 1e-6) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-30);

for (const p of presets) {
  const c = fromConfigParameters(buildConfig(p), p.quoteDecimals);
  const r = analyze(c);

  test(`${p.name}: market caps and multiple match the preset`, () => {
    assert.ok(close(r.startMarketCap, p.initialMarketCap, 1e-4), `start ${r.startMarketCap} vs ${p.initialMarketCap}`);
    assert.ok(close(r.migrationMarketCap, p.migrationMarketCap, 1e-4), `migration ${r.migrationMarketCap} vs ${p.migrationMarketCap}`);
    assert.ok(close(r.priceMultiple, p.migrationMarketCap / p.initialMarketCap, 1e-4));
  });

  test(`${p.name}: paying the whole threshold ends at the SDK's migration price`, () => {
    const last = r.ladder[r.ladder.length - 1]!;
    assert.ok(close(last.priceAfter, r.migrationPrice, 1e-9), `${last.priceAfter} vs ${r.migrationPrice}`);
    const paid = r.ladder.reduce((s, x) => s + x.quoteIn, 0);
    assert.ok(close(paid, r.migrationQuote, 1e-9));
    for (let i = 1; i < r.ladder.length; i++) assert.ok(r.ladder[i]!.priceAfter > r.ladder[i - 1]!.priceAfter, 'price rises with every buy');
    assert.ok(r.supplySoldPct > 0 && r.supplySoldPct < 100);
  });

  test(`${p.name}: fee scheduler starts and ends where the preset says`, () => {
    assert.equal(Math.round(baseFeeBps(c, 0)), p.fee.startingFeeBps);
    assert.ok(Math.abs(baseFeeBps(c, p.fee.totalDuration) - p.fee.endingFeeBps) <= 1, `${baseFeeBps(c, p.fee.totalDuration)} vs ${p.fee.endingFeeBps}`);
    assert.ok(baseFeeBps(c, p.fee.totalDuration * 10) <= baseFeeBps(c, p.fee.totalDuration), 'never rises after the schedule');
  });
}

test('the walker crosses all 16 segments exactly like the SDK (liquidity-weights curve)', () => {
  const base = presets.find((p) => p.name === 'meme-fast') as Preset;
  const input = buildConfigInput(base);
  input.token.leftover = 10_000_000; // multi-segment builders need some leftover supply
  const cp = dbc.buildCurveWithLiquidityWeights({ ...(input as dbc.BuildCurveBaseParams), initialMarketCap: 30, migrationMarketCap: 400, liquidityWeights: Array.from({ length: 16 }, (_, i) => 1.2 ** i) });
  const c = fromConfigParameters(cp, 9);
  const segs = segments(c);
  assert.equal(segs.length, 16);
  const target = dbc.getMigrationThresholdPrice(c.migrationQuoteThreshold, c.sqrtStartPrice, c.curve);
  // one buy of the whole threshold
  assert.equal(buy(c, c.sqrtStartPrice, c.migrationQuoteThreshold).sqrt.toString(), target.toString());
  // the SDK's own per-segment quote amounts add up to the threshold, and the walker spends exactly those
  const breakdown = dbc.getCurveBreakdown(c.migrationQuoteThreshold, c.sqrtStartPrice, c.curve);
  let s = c.sqrtStartPrice;
  breakdown.segmentAmounts.forEach((amt, i) => {
    if (amt.isZero()) return;
    s = buy(c, s, amt).sqrt;
    if (i < 15) assert.equal(s.toString(), segs[i]!.upper.toString(), `segment ${i} ends at its upper price`);
  });
  // and in 97 uneven steps it lands within rounding
  s = c.sqrtStartPrice;
  const step = c.migrationQuoteThreshold.divn(97);
  for (let i = 0; i < 97; i++) s = buy(c, s, step).sqrt;
  s = buy(c, s, c.migrationQuoteThreshold.sub(step.muln(97))).sqrt;
  const diff = s.sub(target).abs();
  assert.ok(diff.lte(new BN(1000)), `small steps land within rounding: off by ${diff.toString()}`);
});

test('a buy that crosses a segment boundary prices the rest on the next segment', () => {
  const base = presets.find((p) => p.name === 'meme-fast') as Preset;
  const input = buildConfigInput(base);
  input.token.leftover = 10_000_000;
  const cp = dbc.buildCurveWithLiquidityWeights({ ...(input as dbc.BuildCurveBaseParams), initialMarketCap: 30, migrationMarketCap: 400, liquidityWeights: Array.from({ length: 16 }, (_, i) => 1.2 ** i) });
  const c = fromConfigParameters(cp, 9);
  const [s0, s1] = segments(c) as [ReturnType<typeof segments>[0], ReturnType<typeof segments>[0]];
  const room = dbc.getDeltaAmountQuoteUnsigned(s0.lower, s0.upper, s0.liquidity, dbc.Rounding.Up);
  const extra = new BN(1_000_000);
  const r = buy(c, c.sqrtStartPrice, room.add(extra));
  const expected = dbc.getNextSqrtPriceFromInput(s0.upper, s1.liquidity, extra, false);
  assert.equal(r.sqrt.toString(), expected.toString());
});

// The same base params buildConfig uses, for building other curve shapes in tests.
function buildConfigInput(p: Preset) {
  return {
    token: { tokenType: dbc.TokenType.SPLToken, tokenBaseDecimal: p.baseDecimals as unknown as dbc.TokenDecimal, tokenQuoteDecimal: p.quoteDecimals, tokenAuthorityOption: dbc.TokenAuthorityOption.Immutable, totalTokenSupply: p.totalSupply, leftover: 0 },
    fee: { baseFeeParams: { baseFeeMode: dbc.BaseFeeMode.FeeSchedulerExponential, feeSchedulerParam: { startingFeeBps: p.fee.startingFeeBps, endingFeeBps: p.fee.endingFeeBps, numberOfPeriod: p.fee.numberOfPeriod, totalDuration: p.fee.totalDuration } }, dynamicFeeEnabled: false, collectFeeMode: dbc.CollectFeeMode.QuoteToken, creatorTradingFeePercentage: 0, poolCreationFee: 0, enableFirstSwapWithMinFee: false },
    migration: { migrationOption: dbc.MigrationOption.MET_DAMM_V2, migrationFeeOption: dbc.MigrationFeeOption.FixedBps100, migrationFee: { feePercentage: 0, creatorFeePercentage: 0 } },
    liquidityDistribution: { partnerPermanentLockedLiquidityPercentage: 100, partnerLiquidityPercentage: 0, creatorPermanentLockedLiquidityPercentage: 0, creatorLiquidityPercentage: 0 },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: dbc.ActivationType.Timestamp,
  };
}
