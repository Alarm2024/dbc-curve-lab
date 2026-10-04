import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/index.ts';
import { loadPresets, validatePreset, type Preset } from '../src/presets.ts';
import { esc } from '../src/render.ts';

test('the report and one config file per preset are written', () => {
  const out = mkdtempSync(join(tmpdir(), 'lab-'));
  const presets = loadPresets();
  run(presets, out, new Date('2026-10-05T00:00:00Z'));
  const html = readFileSync(join(out, 'report.html'), 'utf8');
  for (const p of presets) {
    assert.ok(existsSync(join(out, `${p.name}.config.json`)));
    assert.ok(html.includes(esc(p.label)));
  }
  const cfg = JSON.parse(readFileSync(join(out, `${presets[0]!.name}.config.json`), 'utf8')) as { migrationQuoteThreshold: string };
  assert.match(cfg.migrationQuoteThreshold, /^\d+$/, 'BN fields are written as decimal strings');
});

test('bad presets are refused with a reason', () => {
  const good = loadPresets()[0] as Preset;
  assert.throws(() => validatePreset({ ...good, name: 'Bad Name' }), /name/);
  assert.throws(() => validatePreset({ ...good, migrationMarketCap: good.initialMarketCap }), /migrationMarketCap/);
  assert.throws(() => validatePreset({ ...good, baseDecimals: 5 as Preset['baseDecimals'] }), /baseDecimals/);
  assert.throws(() => validatePreset({ ...good, fee: { ...good.fee, endingFeeBps: good.fee.startingFeeBps + 1 } }), /endingFeeBps/);
});
