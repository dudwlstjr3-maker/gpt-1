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
  /* 선물 판에서 쓰는 계열. 여기 없으면 그 줄은 빈 채로 나가고,
     "우리 코드가 읽는가" 를 확인할 기회 자체가 사라진다. */
  DGS5: [7711, 4.25, 0, 0.02, 0.1],
  DGS30: [7712, 4.6, 0, 0.02, 0.1],
  DCOILWTICO: [7713, 72, 0, 0.02, 10],
  DCOILBRENTEU: [7714, 76, 0, 0.02, 10],
  DHHNGSP: [7715, 2.9, 0, 0.03, 0.5],
  DTWEXBGS: [7716, 121, 0, 0.004, 80],
  DEXUSEU: [7717, 1.08, 0, 0.004, 0.5],
  DEXJPUS: [7718, 152, 0, 0.005, 80],
  DEXUSUK: [7719, 1.27, 0, 0.004, 0.5],
  DEXCAUS: [7720, 1.39, 0, 0.004, 0.8],
  DEXUSAL: [7721, 0.66, 0, 0.005, 0.4],
  DEXSZUS: [7722, 0.88, 0, 0.004, 0.4],
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

  /*
   * EIA 선물 정산가 (v2).
   *
   * ⚠ Cboe CSV 와 같은 사정이다 — 이 응답 모양과 계열 코드는 EIA 문서를 따른 것이지
   *   실제 응답을 받아 확인한 것이 아니다(이 컨테이너에서 api.eia.gov 로 나갈 수 없다).
   *   그러니 여기서 증명되는 것은 "EIA 가 이 모양으로 답하면 우리가 읽는다" 까지다.
   *   실제 모양은 키를 넣고 `npm run check:live` 로 확인해야 한다.
   *
   * 인도월 1~4를 한 번에 달라고 하므로, facets[series][] 로 온 계열마다 줄을 만든다.
   * 값은 근월물 기준에서 인도월마다 조금씩 기울여 준다 — 콘탱고·백워데이션을 화면이
   * 제대로 읽는지 여기서 확인할 수 있어야 한다.
   */
  if (/^\/eia\/(petroleum|natural-gas)\/pri\/fut\/data\/?$/.test(p)) {
    const series = u.searchParams.getAll('facets[series][]');
    const length = Math.min(Number(u.searchParams.get('length') ?? 400), 5000);
    const perSeries = Math.max(2, Math.floor(length / Math.max(1, series.length)));
    // 근월물 기준값 · 인도월 한 칸당 기울기 (음수면 백워데이션)
    const spec = {
      RCLC: { base: 63.4, slope: -0.009, units: '$/BBL' },
      RNGC: { base: 3.14, slope: 0.021, units: '$/MMBTU' },
      RHOC: { base: 2.18, slope: -0.004, units: '$/GAL' },
      EER_: { base: 1.94, slope: 0.012, units: '$/GAL' },
    };
    // 날짜별 흔들림은 **인도월 전체가 함께** 쓴다. 계약마다 따로 흔들면 같은 날의
    // 곡선 모양이 흔들림에 잡아먹혀, 화면이 콘탱고인지 백워데이션인지 확인할 수 없다.
    const rDay = rng(3300);
    const dayFactor = Array.from({ length: perSeries }, () => 1 + (rDay() - 0.5) * 0.02);
    const rows = [];
    for (const code of series) {
      const sp = spec[code.slice(0, 4)] ?? { base: 10, slope: 0, units: 'X' };
      // 계열 이름 안의 인도월 번호 (RCLC1 · …PE3_…)
      const n = Number((code.match(/(?:C|PE)(\d)/) ?? [])[1] ?? 1);
      for (let i = 0; i < perSeries; i += 1) {
        rows.push({
          period: iso(Date.now() - i * DAY),
          series: code,
          'series-description': `stub ${code}`,
          value: Number((sp.base * (1 + sp.slope * (n - 1)) * dayFactor[i]).toFixed(3)),
          units: sp.units,
        });
      }
    }
    return json(res, { response: { total: rows.length, dateFormat: 'YYYY-MM-DD', frequency: 'daily', data: rows } });
  }

  /*
   * SEC EDGAR companyconcept.
   *
   * ⚠ Cboe·EIA 와 같은 사정이다 — 이 응답 모양은 SEC 문서를 따른 것이지 실제 응답을
   *   받아 확인한 것이 아니다(이 컨테이너에서 data.sec.gov 로 나갈 수 없다).
   *   여기서 증명되는 것은 "SEC 가 이 모양으로 답하면 우리가 읽는다" 까지다.
   *
   * 일부러 재현하는 것들 — 실제 공시의 까다로운 성질이고, 이게 없으면 파서가
   * 현장에서 처음 터진다.
   *   ① 회사가 안 쓰는 태그는 404 다 (오류가 아니라 "그 태그는 안 쓴다" 는 뜻).
   *   ② 한 태그 안에 분기(3개월)·누적(6·9개월)·연간(12개월)이 섞여 온다.
   *   ③ 같은 기간이 수정 공시로 두 번 온다.
   *   ④ 주당 값은 단위가 USD 가 아니라 USD/shares 다.
   */
  if (/^\/sec\/api\/xbrl\/companyconcept\/CIK\d{10}\/us-gaap\/[A-Za-z]+\.json$/.test(p)) {
    // SEC 는 연락처가 담긴 User-Agent 를 요구한다. 우리가 실제로 붙이는지 여기서 본다.
    if (!req.headers['user-agent']) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      return res.end('User-Agent 헤더가 없습니다 (SEC 는 연락처가 담긴 User-Agent 를 요구합니다)\n');
    }
    const seg = p.split('/');
    const cik = seg[5].slice(3);
    const tag = seg[7].replace(/\.json$/, '');

    // 이 대역 서버가 "안다" 고 할 태그. 나머지는 404 — 회사마다 태그가 다른 상황을 재현한다.
    const KNOWN = {
      RevenueFromContractWithCustomerExcludingAssessedTax: { base: 9.4e10, unit: 'USD' },
      OperatingIncomeLoss: { base: 2.9e10, unit: 'USD' },
      NetIncomeLoss: { base: 2.4e10, unit: 'USD' },
      EarningsPerShareDiluted: { base: 1.6, unit: 'USD/shares' },
      NetCashProvidedByUsedInOperatingActivities: { base: 3.3e10, unit: 'USD' },
      Liabilities: { base: 2.8e11, unit: 'USD' },
      StockholdersEquity: { base: 8.0e10, unit: 'USD' },
    };
    const spec = KNOWN[tag];
    if (!spec) {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'not found' }));
    }

    const r = rng(9100 + tag.length + Number(cik.slice(-3)));
    const rows = [];
    // 최근 분기말은 45일쯤 전. 거기서 91일씩 거슬러 12분기.
    const q0 = Date.now() - 45 * DAY;
    const isInstant = tag === 'Liabilities' || tag === 'StockholdersEquity';
    const vals = [];
    for (let i = 11; i >= 0; i -= 1) vals.unshift(spec.base * (1 + (11 - i) * 0.03) * (1 + (r() - 0.5) * 0.06));

    for (let i = 0; i < 12; i += 1) {
      const end = q0 - i * 91 * DAY;
      const v = vals[11 - i];
      if (isInstant) {
        // ④ 시점 값 — start 가 없다
        rows.push({ end: iso(end), val: Number(v.toFixed(2)), fy: new Date(end).getUTCFullYear(), fp: 'Q3', form: '10-Q', filed: iso(end + 30 * DAY), accn: `stub-${i}` });
        continue;
      }
      // 분기 (3개월)
      rows.push({ start: iso(end - 91 * DAY), end: iso(end), val: Number(v.toFixed(2)), fy: new Date(end).getUTCFullYear(), fp: 'Q3', form: '10-Q', filed: iso(end + 30 * DAY), accn: `stub-q${i}` });
      // ② 9개월 누적도 같은 태그로 온다 — 분기로 잘못 담으면 값이 튄다
      rows.push({ start: iso(end - 273 * DAY), end: iso(end), val: Number((v * 2.9).toFixed(2)), fy: new Date(end).getUTCFullYear(), fp: 'Q3', form: '10-Q', filed: iso(end + 30 * DAY), accn: `stub-y${i}` });
      // 연간 — 네 분기마다 한 번
      if (i % 4 === 0) {
        rows.push({ start: iso(end - 364 * DAY), end: iso(end), val: Number((v * 3.95).toFixed(2)), fy: new Date(end).getUTCFullYear(), fp: 'FY', form: '10-K', filed: iso(end + 45 * DAY), accn: `stub-a${i}` });
      }
    }
    // ③ 가장 최근 분기를 수정 공시로 한 번 더 — 나중에 접수된 쪽을 써야 한다
    const newest = rows.find((x) => x.accn === 'stub-q0');
    if (newest) {
      rows.push({ ...newest, val: Number((newest.val * 1.04).toFixed(2)), filed: iso(Date.now()), accn: 'stub-q0-amended' });
    }

    return json(res, {
      cik: Number(cik),
      taxonomy: 'us-gaap',
      tag,
      label: tag,
      description: 'stub',
      entityName: `Stub Company ${cik} (실제 회사가 아닙니다)`,
      units: { [spec.unit]: rows },
    });
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
