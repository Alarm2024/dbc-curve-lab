import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as dbc from '@meteora-ag/dynamic-bonding-curve-sdk';

// A preset is a few human numbers. buildCurveWithMarketCap (Meteora's SDK)
// turns it into the full ConfigParameters a DBC config is created from.

const {
  buildCurveWithMarketCap, BaseFeeMode, CollectFeeMode, MigrationOption, MigrationFeeOption,
  TokenType, TokenAuthorityOption, ActivationType,
} = dbc;

export interface Preset {
  name: string;
  label: string;
  about: string;
  quote: string;
  quoteDecimals: number;
  baseDecimals: 6 | 7 | 8 | 9;
  totalSupply: number;
  initialMarketCap: number; // in quote units
  migrationMarketCap: number;
  fee: { mode: 'linear' | 'exponential'; startingFeeBps: number; endingFeeBps: number; numberOfPeriod: number; totalDuration: number };
}

export function validatePreset(p: Preset): void {
  const where = `preset ${p.name ?? '(unnamed)'}`;
  if (!p.name || !/^[a-z0-9-]+$/.test(p.name)) throw new Error(`${where}: name must be lowercase letters, digits and dashes`);
  if (![6, 7, 8, 9].includes(p.baseDecimals)) throw new Error(`${where}: baseDecimals must be 6, 7, 8 or 9`);
  if (!(p.initialMarketCap > 0) || !(p.migrationMarketCap > p.initialMarketCap)) throw new Error(`${where}: migrationMarketCap must be above initialMarketCap > 0`);
  if (!(p.totalSupply > 0)) throw new Error(`${where}: totalSupply must be positive`);
  if (p.fee.endingFeeBps > p.fee.startingFeeBps) throw new Error(`${where}: endingFeeBps must not exceed startingFeeBps`);
}

export function loadPresets(dir = 'presets'): Preset[] {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const p = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Preset;
    validatePreset(p);
    return p;
  });
}

export function buildConfig(p: Preset): dbc.ConfigParameters {
  validatePreset(p);
  return buildCurveWithMarketCap({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: p.baseDecimals as unknown as dbc.TokenDecimal,
      tokenQuoteDecimal: p.quoteDecimals,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: p.totalSupply,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: p.fee.mode === 'linear' ? BaseFeeMode.FeeSchedulerLinear : BaseFeeMode.FeeSchedulerExponential,
        feeSchedulerParam: { startingFeeBps: p.fee.startingFeeBps, endingFeeBps: p.fee.endingFeeBps, numberOfPeriod: p.fee.numberOfPeriod, totalDuration: p.fee.totalDuration },
      },
      dynamicFeeEnabled: false,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 0,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: { migrationOption: MigrationOption.MET_DAMM_V2, migrationFeeOption: MigrationFeeOption.FixedBps100, migrationFee: { feePercentage: 0, creatorFeePercentage: 0 } },
    liquidityDistribution: { partnerPermanentLockedLiquidityPercentage: 100, partnerLiquidityPercentage: 0, creatorPermanentLockedLiquidityPercentage: 0, creatorLiquidityPercentage: 0 },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Timestamp,
    initialMarketCap: p.initialMarketCap,
    migrationMarketCap: p.migrationMarketCap,
  });
}

/** ConfigParameters as plain JSON (BN → decimal string), for handing to the SDK elsewhere. */
export function configJson(c: dbc.ConfigParameters): string {
  const conv = (v: unknown): unknown => {
    if (v && typeof v === 'object') {
      const o = v as { words?: unknown; toString?: (b: number) => string };
      if (Array.isArray(o.words) && typeof o.toString === 'function') return o.toString(10);
      if (Array.isArray(v)) return v.map(conv);
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, conv(x)]));
    }
    return v;
  };
  return JSON.stringify(conv(c), null, 2) + '\n';
}
