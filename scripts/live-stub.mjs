/**
 * LIVE 경로 점검용 **로컬 대역 서버**.
 *
 * 무엇인가 / 무엇이 아닌가
 *   이건 제공사가 아니다. 우리 쪽 **파싱·정규화 코드를 실행시키기 위한 껍데기**다.
 *   제공사가 실제로 어떤 모양으로 답하는지(FRED 의 observations, Stooq 의 CSV 머리글,
 *   CoinGecko 의 prices 배열 …)를 그대로 흉내 내서, 키를 넣기 전에 우리 코드가
 *   그 모양을 제대로 읽는지 확인한다.
 *
 *   **여기서 나오는 값은 전부 가짜다.** 시장을 설명하지 않는다. 화면에 띄우면 안 된다.
 *   이 서버로 확인되는 것은 딱 하나 — "제공사가 저 모양으로 답하면 우리 코드가
 *   터지지 않고 읽어 낸다". 제공사가 살아 있는지, 값이 맞는지는 확인하지 못한다.
 *   그건 키를 넣고 `npm run check:live` 로 실제 제공사에 물어봐야 안다.
 *
 *   실행:  node scripts/live-stub.mjs [포트]
 */

import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? 4599);
const DAY = 86_400_000;

/** 재현 가능한 난수 — 돌릴 때마다 값이 달라지면 무엇이 깨졌는지 못 가린다 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (t) => new Date(t).toISOString().slice(0, 10);

/** 21년치 일별 값 — 국면 전광판이 20년을 요구하므로 그보다 길어야 한다 */
function daily(days, seed, base, drift, vol, floor = null) {
  const r = rng(seed);
  const end = Date.now();
  const out = [];
  let v = base;
  for (let i = days; i >= 0; i -= 1) {
    v = v * (1 + drift + (r() - 0.5) * vol);
    if (floor !== null) v = Math.max(floor, v);
    out.push({ t: end - i * DAY, v });
  }
  return out;
}

/* FRED 시리즈 — 실제 응답과 같은 모양: { observations: [{date, value}] }, 결측은 '.' */
const FRED_SPEC = {
  VIXCLS: [7700, 18, 0, 0.12, 5],
  BAMLH0A0HYM2: [7701, 4.2, 0, 0.05, 1.5],
  T10Y2Y: [7702, 0.6, 0, 0.08, null],
  DGS2: [7703, 4.1, 0, 0.02, 0.1],
  DGS10: [7704, 4.4, 0, 0.02, 0.1],
  DFEDTARU: [7705, 4.5, 0, 0.002, 0.25],
  CPIAUCSL: [7706, 310, 0.00008, 0.002, 100],
  PCEPILFE: [7707, 125, 0.00007, 0.002, 100],
  UNRATE: [7708, 4.1, 0, 0.01, 3],
  PAYEMS: [7709, 159000, 0.00005, 0.001, 1000],
  DEXKOUS: [7710, 1340, 0, 0.01, 900],
};

function fredObservations(id, start) {
  const spec = FRED_SPEC[id];
  if (!spec) return { observations: [] };
  const [seed, base, drift, vol, floor] = spec;
  const from = start ? Date.parse(`${start}T00:00:00Z`) : 0;
  const pts = daily(7800, seed, base, drift, vol, floor).filter((p) => p.t >= from);
  return {
    realtime_start: iso(Date.now()),
    realtime_end: iso(Date.now()),
    observations: pts.map((p, i) => ({
      realtime_start: iso(p.t),
      realtime_end: iso(p.t),
      date: iso(p.t),
      // 주말·공휴일 결측을 '.' 으로 주는 것이 FRED 의 실제 동작이다. 그 처리도 태운다.
      value: i % 37 === 5 ? '.' : String(Number(p.v.toFixed(4))),
    })),
  };
}

/** Stooq 일별 CSV — Date,Open,High,Low,Close,Volume */
function stooqDaily(sym) {
  const seed = [...sym].reduce((a, c) => a + c.charCodeAt(0), 0) * 17;
  const pts = daily(7800, seed, sym.includes('spx') ? 4200 : 2600, 0.0002, 0.02, 10);
  const rows = pts.map((p) => {
    const c = p.v;
    return `${iso(p.t)},${(c * 0.998).toFixed(2)},${(c * 1.006).toFixed(2)},${(c * 0.993).toFixed(2)},${c.toFixed(2)},${Math.round(1e6 + c * 1000)}`;
  });
  return `Date,Open,High,Low,Close,Volume\n${rows.join('\n')}\n`;
}

/** Stooq 실시간 CSV — Symbol,Date,Time,Open,High,Low,Close,Volume */
function stooqQuote(symbols) {
  const rows = symbols.map((s) => {
    const seed = [...s].reduce((a, c) => a + c.charCodeAt(0), 0) * 31;
    const r = rng(seed);
    const c = 50 + r() * 4000;
    return `${s.toUpperCase()},${iso(Date.now())},16:00:00,${(c * 0.99).toFixed(2)},${(c * 1.01).toFixed(2)},${(c * 0.98).toFixed(2)},${c.toFixed(2)},${Math.round(r() * 1e7)}`;
  });
  return `Symbol,Date,Time,Open,High,Low,Close,Volume\n${rows.join('\n')}\n`;
}

const COINS = { bitcoin: 92000, ethereum: 3200, ripple: 2.1, solana: 190, binancecoin: 640 };

function json(res, body) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
function text(res, body) {
  res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' });
  res.end(body);
}

const server = createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const p = u.pathname;

  /* ---------------- FRED ---------------- */
  if (p === '/fred/series/observations') {
    const id = u.searchParams.get('series_id') ?? '';
    const body = fredObservations(id, u.searchParams.get('observation_start'));
    if (u.searchParams.get('sort_order') === 'desc') body.observations.reverse();
    const limit = Number(u.searchParams.get('limit') ?? 0);
    if (limit > 0) body.observations = body.observations.slice(0, limit);
    return json(res, body);
  }
  if (p === '/fred/releases/dates') {
    // 실제 응답과 같은 모양. release_id 로 규칙에 걸리는 것 몇 개만 담는다.
    const today = Date.now();
    const rows = [];
    for (const [i, id] of [10, 50, 53, 54, 180].entries()) {
      for (let k = 0; k < 3; k += 1) {
        rows.push({
          release_id: id,
          release_name: ['Consumer Price Index', 'Employment Situation', 'Gross Domestic Product',
            'Personal Income and Outlays', 'Unemployment Insurance Weekly Claims Report'][i],
          date: iso(today + (k * 9 + i) * DAY),
        });
      }
    }
    return json(res, { realtime_start: iso(today), realtime_end: iso(today), release_dates: rows });
  }

  /* ---------------- Stooq ---------------- */
  if (p === '/q/d/l/') return text(res, stooqDaily(u.searchParams.get('s') ?? '^spx'));
  if (p === '/q/l/') return text(res, stooqQuote((u.searchParams.get('s') ?? '').split(',').filter(Boolean)));

  /* ---------------- CoinGecko ---------------- */
  if (p === '/cg/simple/price') {
    const ids = (u.searchParams.get('ids') ?? '').split(',').filter(Boolean);
    const out = {};
    for (const id of ids) {
      const base = COINS[id] ?? 10;
      out[id] = { usd: base, usd_24h_change: 1.8, usd_24h_vol: base * 1e5, usd_market_cap: base * 1e7 };
    }
    return json(res, out);
  }
  if (p === '/cg/global') {
    return json(res, {
      data: {
        total_market_cap: { usd: 3.2e12 },
        total_volume: { usd: 1.1e11 },
        market_cap_percentage: { btc: 57.4, eth: 11.2 },
        market_cap_change_percentage_24h_usd: 1.4,
      },
    });
  }
  if (/^\/cg\/coins\/[^/]+\/market_chart$/.test(p)) {
    const coin = p.split('/')[3];
    const days = Number(u.searchParams.get('days') ?? 365);
    const pts = daily(Math.max(days, 400), 991 + coin.length, COINS[coin] ?? 100, 0.0004, 0.05, 0.01);
    return json(res, {
      prices: pts.map((x) => [x.t, x.v]),
      market_caps: pts.map((x) => [x.t, x.v * 1e7]),
      total_volumes: pts.map((x) => [x.t, x.v * 1e5]),
    });
  }
  if (p === '/cg/coins/markets') {
    const n = Number(u.searchParams.get('per_page') ?? 100);
    const r = rng(4242);
    return json(res, Array.from({ length: n }, (_, i) => ({
      id: `coin-${i}`, symbol: `c${i}`, name: `Coin ${i}`,
      current_price: 1 + r() * 500, market_cap: (n - i) * 1e8,
      price_change_percentage_24h: (r() - 0.45) * 8,
      // 상위 50 중 50일선 상회 비율을 계산하는 코드가 이 필드를 본다
      price_change_percentage_7d_in_currency: (r() - 0.4) * 15,
    })));
  }

  /* ---------------- Binance ---------------- */
  if (p === '/bn/fapi/v1/fundingRate') {
    const limit = Number(u.searchParams.get('limit') ?? 21);
    const r = rng(555);
    return json(res, Array.from({ length: limit }, (_, i) => ({
      symbol: 'BTCUSDT',
      fundingRate: ((r() - 0.4) * 0.0006).toFixed(8),
      fundingTime: Date.now() - (limit - i) * 8 * 3600_000,
    })));
  }
  if (p === '/bn/futures/data/openInterestHist') {
    const limit = Number(u.searchParams.get('limit') ?? 30);
    const r = rng(556);
    return json(res, Array.from({ length: limit }, (_, i) => ({
      symbol: 'BTCUSDT',
      sumOpenInterest: (250000 + r() * 30000).toFixed(3),
      sumOpenInterestValue: (2.4e10 + r() * 2e9).toFixed(2),
      timestamp: Date.now() - (limit - i) * DAY,
    })));
  }

  /* ---------------- World Bank ---------------- */
  if (p.startsWith('/wb/country/')) {
    const codes = p.split('/')[3].split(';');
    const r = rng(7777);
    return json(res, [
      { page: 1, pages: 1, per_page: 50, total: codes.length * 2 },
      codes.flatMap((c) => [0, 1].map((k) => ({
        indicator: { id: 'X', value: 'X' },
        country: { id: c.slice(0, 2), value: c },
        countryiso3code: c,
        date: String(new Date().getFullYear() - 1 - k),
        value: 1000 + r() * 60000,
      }))),
    ]);
  }

  /*
   * Cboe 풋/콜 CSV.
   *
   * ⚠ 머리글은 **우리 파서가 찾는 이름**에 맞춘 것이지, 실제 파일을 받아 확인한 것이
   *   아니다(이 컨테이너에서 cdn.cboe.com 으로 나갈 수 없다). 그러니 이 대역 서버가
   *   증명하는 것은 "머리글이 이렇게 오면 우리가 읽는다" 까지다.
   *   실제 파일의 머리글이 이와 다르면 여기서는 통과하고 현장에서 빈다 —
   *   그래서 `npm run check:live` 가 실제 파일 머리글을 그대로 찍어 준다.
   *
   * 앞에 설명 줄이 붙는 것(파서가 머리글을 찾아 내려가는 이유)도 함께 재현한다.
   */
  if (p === '/cboe.csv') {
    const r = rng(8181);
    const rows = [];
    for (let i = 400; i >= 0; i -= 1) {
      const eq = 0.55 + r() * 0.35;
      rows.push(`${iso(Date.now() - i * DAY)},${Math.round(1e6 + r() * 5e5)},${Math.round(6e5 + r() * 3e5)},${eq.toFixed(3)},${(eq * 1.6).toFixed(3)},${(eq * 1.1).toFixed(3)}`);
    }
    const head = 'DATE,CALL,PUT,EQUITY PUT/CALL RATIO,INDEX PUT/CALL RATIO,TOTAL PUT/CALL RATIO';
    return text(res, `Cboe Daily Market Statistics\n\n${head}\n${rows.join('\n')}\n`);
  }

  /* ---------------- 이코노미스트 빅맥 CSV ---------------- */
  if (p === '/bigmac.csv') {
    const head = 'date,iso_a3,currency_code,name,local_price,dollar_ex,dollar_price,USD_raw,EUR_raw,GBP_raw,JPY_raw,CNY_raw';
    const rows = [];
    for (const y of [2024, 2025, 2026]) {
      for (const [c, raw] of [['KOR', -0.31], ['USA', 0], ['JPN', -0.42], ['CHN', -0.38]]) {
        rows.push(`${y}-07-01,${c},X,${c},5000,1300,3.85,${raw},${raw},${raw},${raw},${raw}`);
      }
    }
    return text(res, `${head}\n${rows.join('\n')}\n`);
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end(`대역 서버에 없는 경로: ${p}\n`);
});

server.listen(PORT, () => {
  console.log(`LIVE 대역 서버 http://localhost:${PORT}  — 가짜 값입니다. 파싱 확인용입니다.`);
});
