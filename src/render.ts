import type { Report } from './lab.ts';
import type { Preset } from './presets.ts';

// One static HTML page comparing presets: key figures, the price path to
// graduation, the base-fee schedule and the ladder. Inline SVG, no scripts.

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a !== 0 && (a < 1e-4 || a >= 1e9)) return n.toExponential(digits);
  if (a >= 1e6) return (n / 1e6).toFixed(digits) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return n.toLocaleString('en-US', { maximumFractionDigits: a < 1 ? 6 : digits });
}

const COLORS = ['#5ad1a8', '#f5a35c', '#8ab4ff', '#e58bd8', '#f2e26b'];

function chart(title: string, series: { name: string; points: [number, number][] }[], xLabel: string, yLabel: string): string {
  const W = 640, H = 300, L = 56, R = 16, T = 28, B = 40;
  const xs = series.flatMap((s) => s.points.map((p) => p[0]));
  const ys = series.flatMap((s) => s.points.map((p) => p[1])).filter(Number.isFinite);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = 0, y1 = Math.max(...ys) * 1.05 || 1;
  const X = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R);
  const Y = (y: number) => H - B - ((y - y0) / (y1 - y0 || 1)) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => y0 + f * (y1 - y0));
  const grid = ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="#2a323c"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end" font-size="11" fill="#93a1b0">${esc(fmt(t, 1))}</text>`).join('');
  const lines = series.map((s, i) => `<polyline fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="2.5" points="${s.points.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}"/>`).join('');
  const legend = series.map((s, i) => `<text x="${L + i * 170}" y="18" font-size="12" fill="${COLORS[i % COLORS.length]}">● ${esc(s.name)}</text>`).join('');
  return `<figure><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
${legend}${grid}
<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#4a5562"/>
<text x="${L}" y="${H - 22}" font-size="11" fill="#93a1b0">${esc(fmt(x0, 0))}</text><text x="${W - R}" y="${H - 22}" text-anchor="end" font-size="11" fill="#93a1b0">${esc(fmt(x1, 0))}</text>
<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#93a1b0">${esc(xLabel)}</text>
<text x="14" y="${(T + H - B) / 2}" font-size="12" fill="#93a1b0" transform="rotate(-90 14 ${(T + H - B) / 2})" text-anchor="middle">${esc(yLabel)}</text>
${lines}</svg><figcaption>${esc(title)}</figcaption></figure>`;
}

export function page(items: { preset: Preset; report: Report }[], generatedAt: string, sdkVersion: string): string {
  const rows: [string, (r: Report, p: Preset) => string][] = [
    ['Quote to graduate (net of fees)', (r, p) => `${fmt(r.migrationQuote)} ${esc(p.quote)}`],
    ['Start → graduation price', (r, p) => `${fmt(r.startPrice)} → ${fmt(r.migrationPrice)} ${esc(p.quote)}`],
    ['Price multiple on the curve', (r) => `${fmt(r.priceMultiple, 1)}×`],
    ['Market cap at start → graduation', (r, p) => `${fmt(r.startMarketCap)} → ${fmt(r.migrationMarketCap)} ${esc(p.quote)}`],
    ['Supply sold on the curve', (r) => `${fmt(r.supplySoldPct, 1)}%`],
    ['Last 5 % of buyers pay vs first 5 %', (r) => `${fmt(r.firstBuyerVsLast, 1)}×`],
    ['Base fee at open → after schedule', (r) => `${fmt(r.fees[0]?.feeBps ?? NaN, 0)} → ${fmt(r.fees.find((f) => f.seconds >= r.sniper.scheduleSeconds)?.feeBps ?? NaN, 0)} bps`],
    ['Fee on a 1 %-of-threshold buy, at open', (r, p) => `${fmt(r.sniper.feeAtOpen)} ${esc(p.quote)} (vs ${fmt(r.sniper.feeAfterSchedule)} later)`],
    ['Fee schedule length', (r) => `${fmt(r.sniper.scheduleSeconds, 0)} s`],
  ];
  const head = items.map((i) => `<th>${esc(i.preset.label)}</th>`).join('');
  const body = rows.map(([k, f]) => `<tr><th scope="row">${esc(k)}</th>${items.map((i) => `<td>${f(i.report, i.preset)}</td>`).join('')}</tr>`).join('');
  const pricePath = chart('Price after each 5 % of the threshold, as a multiple of the start price', items.map((i) => ({ name: i.preset.label, points: [[0, 1] as [number, number], ...i.report.ladder.map((s) => [s.raisedPct, s.priceAfter / i.report.startPrice] as [number, number])] })), '% of graduation threshold paid in', '× start price');
  const feePath = chart('Base fee over time since the pool opened', items.map((i) => ({ name: i.preset.label, points: i.report.fees.map((f) => [f.seconds, f.feeBps] as [number, number]) })), 'seconds since open', 'bps');
  const ladders = items.map((i) => `<details><summary>${esc(i.preset.label)} — ladder (20 equal buys to graduation)</summary>
<table class="ladder"><thead><tr><th>% raised</th><th>quote in</th><th>tokens out</th><th>avg price</th><th>price after</th></tr></thead><tbody>
${i.report.ladder.map((s) => `<tr><td>${fmt(s.raisedPct, 0)}</td><td>${fmt(s.quoteIn)}</td><td>${fmt(s.baseOut)}</td><td>${fmt(s.avgPrice)}</td><td>${fmt(s.priceAfter)}</td></tr>`).join('')}
</tbody></table></details>`).join('');
  const abouts = items.map((i) => `<li><b>${esc(i.preset.label)}</b> — ${esc(i.preset.about)}</li>`).join('');
  const notes = [...new Set(items.flatMap((i) => i.report.notes))].map((n) => `<li>${esc(n)}</li>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DBC curve lab</title>
<meta name="description" content="Meteora Dynamic Bonding Curve configs compared: price path to graduation, buy ladder, fee schedule and the cost of buying at open.">
<style>
:root{--bg:#0f1317;--panel:#161c22;--line:#2a323c;--text:#e9edf1;--muted:#93a1b0;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
header,main,footer{max-width:1100px;margin:0 auto;padding:20px}header{border-bottom:1px solid var(--line)}h1{margin:0 0 4px;font-size:22px}header p,footer{color:var(--muted);font-size:13px}
h2{font-size:16px;margin:26px 0 10px}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;background:var(--panel);border:1px solid var(--line);border-radius:10px}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th[scope=row],thead th:first-child{text-align:left;color:var(--muted);font-weight:500}thead th{color:var(--text)}
.charts{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:860px){.charts{grid-template-columns:1fr}}
figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px}figcaption{color:var(--muted);font-size:12px;margin-top:4px}svg{width:100%;height:auto;font-family:inherit}
details{margin:8px 0;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px}summary{cursor:pointer}.ladder{border:0;margin-top:8px}
ul{padding-left:18px;color:var(--muted);font-size:14px}a{color:#8ab4ff}
</style></head><body>
<header><h1>DBC curve lab</h1><p>${esc(items.length)} configs · computed ${esc(generatedAt)} with @meteora-ag/dynamic-bonding-curve-sdk ${esc(sdkVersion)} · read-only, nothing is created or signed</p></header>
<main>
<h2>Side by side</h2>
<div class="scroll"><table><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
<h2>Price path and fee schedule</h2>
<div class="charts">${pricePath}${feePath}</div>
<h2>Ladders</h2>
${ladders}
<h2>The presets</h2>
<ul>${abouts}</ul>
<h2>Notes</h2>
<ul>${notes}</ul>
</main>
<footer>Each config can be exported as SDK ConfigParameters (out/&lt;name&gt;.config.json). Creating a config on chain is done elsewhere, with your own wallet. <a href="https://github.com/Alarm2024/dbc-curve-lab">Source</a></footer>
</body></html>
`;
}
