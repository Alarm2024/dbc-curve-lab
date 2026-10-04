# DEMO — 2 to 3 minutes

Before: record 2–3 real configs (`npm run record -- <address>`) and build the
report with them (`npm run lab -- --fixture …`). Numbers on screen come from that run.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:15 | `presets/stock-pair.json` in an editor. | "dbc-curve-lab: a few numbers in, a full Meteora bonding-curve config out, and what it does to buyers before anyone creates it." |
| 0:15–0:30 | Terminal: `npm run lab`. | "The math is Meteora's own SDK: curve building, segment math, graduation price, fee scheduler." |
| 0:30–1:10 | Report: side-by-side table. Point at multiple, supply sold, last vs first buyer. | "A meme curve that rises 13 times to graduation makes the last buyers pay over 11 times what the first paid. The stock-pair design rises 5 times; the RWA design 2." |
| 1:10–1:40 | Fee chart and the "fee at open" row. | "The opening fee is the anti-sniper lever. Here, buying 1 % of the threshold in the first second costs <x> in fees against <y> ten minutes later." |
| 1:40–2:10 | The on-chain column(s). | "And real configs from mainnet, decoded from their account bytes, in the same table, so a new design can be compared with configs already in use." |
| 2:10–2:35 | `out/stock-pair.config.json`, then `npm test`. | "Each design exports as SDK parameters for whoever creates it with their own wallet. The tests check every figure against the SDK." |
| 2:35–2:50 | Repo URL. | "github.com/Alarm2024/dbc-curve-lab." |
