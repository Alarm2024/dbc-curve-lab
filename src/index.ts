import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze, fromConfigParameters } from './lab.ts';
import { buildConfig, configJson, loadPresets, validatePreset, type Preset } from './presets.ts';
import { page } from './render.ts';
import { fromFixture, type ConfigFixture } from './onchain.ts';

// npm run lab                          every preset in presets/ → out/report.html, out/report.json, out/<name>.config.json
// npm run lab -- --preset my.json      one preset file
// npm run lab -- --fixture fixtures/<date>-config-<address>.json   add a real on-chain config to the report
// npm run lab -- --out somewhere

// The SDK does not export its package.json; read the installed copy directly.
export const SDK_VERSION: string = (JSON.parse(readFileSync(new URL('../node_modules/@meteora-ag/dynamic-bonding-curve-sdk/package.json', import.meta.url), 'utf8')) as { version: string }).version;

function arg(name: string, fallback = ''): string {
  const i = process.argv.indexOf(name);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : fallback;
}

/** A recorded mainnet config shown next to the presets. */
export function fixtureItem(f: ConfigFixture) {
  const c = fromFixture(f);
  const supply = Number(c.totalBaseSupply.toString()) / 10 ** c.baseDecimals;
  const preset: Preset = {
    name: `onchain-${f.meta.address.slice(0, 6).toLowerCase()}`,
    label: `On-chain ${f.meta.address.slice(0, 4)}…${f.meta.address.slice(-4)}`,
    about: `Config ${f.meta.address}, read from mainnet at slot ${f.meta.slot} (${f.meta.recorded_at}).`,
    quote: f.quoteMint.address === 'So11111111111111111111111111111111111111112' ? 'SOL' : `quote (${f.quoteMint.decimals} dp)`,
    quoteDecimals: c.quoteDecimals,
    baseDecimals: c.baseDecimals as Preset['baseDecimals'],
    totalSupply: supply,
    initialMarketCap: 0,
    migrationMarketCap: 0,
    fee: { mode: 'linear', startingFeeBps: 0, endingFeeBps: 0, numberOfPeriod: 0, totalDuration: 0 },
  };
  return { preset, report: analyze(c) };
}

export function run(presets: Preset[], out: string, now = new Date(), fixtures: ConfigFixture[] = []): { name: string; graduateQuote: number; multiple: number }[] {
  mkdirSync(out, { recursive: true });
  const items = presets.map((preset) => {
    const config = buildConfig(preset);
    writeFileSync(join(out, `${preset.name}.config.json`), configJson(config));
    return { preset, report: analyze(fromConfigParameters(config, preset.quoteDecimals)) };
  });
  items.push(...fixtures.map(fixtureItem));
  const generatedAt = now.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  writeFileSync(join(out, 'report.html'), page(items, generatedAt, SDK_VERSION));
  writeFileSync(join(out, 'report.json'), JSON.stringify({ generatedAt, sdk: SDK_VERSION, items }, null, 2) + '\n');
  return items.map((i) => ({ name: i.preset.name, graduateQuote: i.report.migrationQuote, multiple: i.report.priceMultiple }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const one = arg('--preset');
  const presets = one ? [JSON.parse(readFileSync(one, 'utf8')) as Preset] : loadPresets();
  presets.forEach(validatePreset);
  const out = arg('--out', 'out');
  const fx = arg('--fixture');
  const fixtures = fx ? [JSON.parse(readFileSync(fx, 'utf8')) as ConfigFixture] : [];
  for (const r of run(presets, out, new Date(), fixtures)) console.log(`${r.name}: ${r.graduateQuote.toFixed(2)} quote to graduate, ${r.multiple.toFixed(2)}x on the curve`);
  console.log(`→ ${join(out, 'report.html')}`);
}
