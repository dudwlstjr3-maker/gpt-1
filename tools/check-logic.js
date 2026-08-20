'use strict';
// 1층 검증: HTML 안의 <script> 를 Node vm 으로 실행하고 순수 함수를 직접 불러 검증한다.
//   node tools/check-logic.js [index.html]
const path = require('path');
const { loadApp } = require('./load-app');

const FILE = process.argv[2] || path.join(__dirname, '..', 'index.html');

let pass = 0;
const fails = [];
const groups = [];
let cur = null;

function group(name) { cur = { name, n: 0 }; groups.push(cur); }
function ok(cond, label, detail) {
  if (cur) cur.n++;
  if (cond) { pass++; return true; }
  fails.push(`[${cur ? cur.name : '-'}] ${label}` + (detail ? `\n      ${detail}` : ''));
  return false;
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
function okNear(a, b, label, eps = 1e-9) {
  return ok(near(a, b, eps), label, `기대 ${b}, 실제 ${a}`);
}

const { app, errors, ctx } = loadApp(FILE);

group('로딩');
ok(errors.length === 0, '스크립트가 예외 없이 실행된다', errors.map((e) => e.message).join(' / '));
ok(typeof app.APP_VER === 'string' && /^\d+\.\d+$/.test(app.APP_VER), `APP_VER 형식 (현재 ${app.APP_VER})`);
ok(typeof app.APP_VER_NOTE === 'string' && app.APP_VER_NOTE.length > 0, 'APP_VER_NOTE 존재');

/* ───────────────── 포커 수식 (명세에 못 박힌 4개) ───────────────── */
group('포커 수식');
{
  // 참조 구현. 앱이 이 값과 다르면 앱이 틀린 것이다.
  const reqEq = (pot, bet) => bet / (pot + 2 * bet);
  const mdf = (pot, bet) => pot / (pot + bet);
  const alpha = (pot, bet) => bet / (pot + bet);
  const evCall = (eq, pot, bet) => eq * (pot + bet) - (1 - eq) * bet;

  // 항등식: 알파 + MDF = 1
  for (const [pot, bet] of [[10, 5], [100, 75], [3, 9], [12.5, 4.25]]) {
    okNear(alpha(pot, bet) + mdf(pot, bet), 1, `알파+MDF=1 (팟${pot}/벳${bet})`, 1e-12);
  }
  // 손익분기: 필요 승률에서 EV(콜)=0
  for (const [pot, bet] of [[10, 5], [100, 75], [3, 9], [40, 13]]) {
    okNear(evCall(reqEq(pot, bet), pot, bet), 0, `필요승률에서 EV(콜)=0 (팟${pot}/벳${bet})`, 1e-9);
  }
  // 하프팟 벳의 교과서 값
  okNear(reqEq(10, 5), 0.25, '하프팟 필요 승률 = 25%');
  okNear(mdf(10, 5), 2 / 3, '하프팟 MDF = 66.7%');
  okNear(alpha(10, 5), 1 / 3, '하프팟 알파 = 33.3%');
  // 팟사이즈 벳
  okNear(reqEq(10, 10), 1 / 3, '팟벳 필요 승률 = 33.3%');
  okNear(mdf(10, 10), 0.5, '팟벳 MDF = 50%');

  // 앱이 analyze 안에서 쓰는 식을 소스에서 직접 확인 (문자열 대조)
  const src = require('fs').readFileSync(FILE, 'utf8');
  ok(/reqE\s*=\s*facing\s*\?\s*vSize\s*\/\s*\(\s*pot\s*\+\s*2\s*\*\s*vSize\s*\)/.test(src),
    '소스의 필요 승률 = 벳/(팟+2×벳)');
  ok(/mdf\s*=\s*facing\s*\?\s*pot\s*\/\s*\(\s*pot\s*\+\s*vSize\s*\)/.test(src),
    '소스의 MDF = 팟/(팟+벳)');
  ok(/alpha\s*=\s*facing\s*\?\s*vSize\s*\/\s*\(\s*pot\s*\+\s*vSize\s*\)/.test(src),
    '소스의 알파 = 벳/(팟+벳)');
  ok(/evCall\s*=\s*eq\s*\*\s*\(\s*pot\s*\+\s*vSize\s*\)\s*-\s*\(\s*1\s*-\s*eq\s*\)\s*\*\s*vSize/.test(src),
    '소스의 EV(콜) = 승률×(팟+벳) − (1−승률)×벳');
}

/* ───────────────── 핸드 평가기 ───────────────── */
group('핸드 평가기');
{
  const { evalHand, catOf, CATNAME } = app;
  const R = '23456789TJQKA', SU = 'shdc';
  const C = (s) => R.indexOf(s[0]) * 4 + SU.indexOf(s[1]);
  const cards = (str) => str.split(' ').map(C);
  const cat = (str) => catOf(evalHand(cards(str)));
  const score = (str) => evalHand(cards(str));

  ok(CATNAME.length === 9, '카테고리 9종');
  ok(cat('As Ks Qs Js Ts') === 8, '로열 = 스트레이트 플러시', `실제 ${CATNAME[cat('As Ks Qs Js Ts')]}`);
  ok(cat('9h 9d 9s 9c 2h') === 7, '포카드', `실제 ${CATNAME[cat('9h 9d 9s 9c 2h')]}`);
  ok(cat('9h 9d 9s 2c 2h') === 6, '풀하우스');
  ok(cat('Ah 7h 5h 3h 2h') === 5, '플러시');
  ok(cat('9h 8d 7s 6c 5h') === 4, '스트레이트');
  ok(cat('As 2d 3s 4c 5h') === 4, '휠 스트레이트(A2345)', `실제 ${CATNAME[cat('As 2d 3s 4c 5h')]}`);
  ok(cat('9h 9d 9s 4c 2h') === 3, '트립스');
  ok(cat('9h 9d 4s 4c 2h') === 2, '투페어');
  ok(cat('9h 9d 7s 4c 2h') === 1, '원페어');
  ok(cat('Ah 9d 7s 4c 2h') === 0, '하이카드');

  // 휠은 9하이 스트레이트보다 낮아야 한다
  ok(score('As 2d 3s 4c 5h') < score('9h 8d 7s 6c 5h'), '휠 < 9하이 스트레이트');
  // 7장에서 최선의 5장을 고른다
  ok(cat('As Ks Qs Js Ts 2c 3d') === 8, '7장 중 로열 인식');
  ok(cat('2c 3d As Ks Qs Js Ts') === 8, '7장 순서 무관');
  // 킥커 비교
  ok(score(cards('Ah Ad Ks 7c 2h').map((c) => R[c >> 2] + SU[c & 3]).join(' ')) >
     score('Ah Ad Qs 7c 2h'), '같은 페어면 킥커가 높은 쪽이 강함');
  // 6장·5장도 처리
  ok(typeof evalHand(cards('Ah Ad Ks 7c 2h 9d')) === 'number', '6장 평가 가능');
}

/* ───────────────── 승률 계산 ───────────────── */
group('승률');
{
  const { equityVsRange, equityVsRanges, expandRange, classToCombos } = app;
  const R = '23456789TJQKA', SU = 'shdc';
  const C = (s) => R.indexOf(s[0]) * 4 + SU.indexOf(s[1]);

  const aa = classToCombos('AA');
  ok(Array.isArray(aa) && aa.length === 6, 'AA 조합 6개', `실제 ${aa && aa.length}`);
  ok(classToCombos('AKs').length === 4, 'AKs 조합 4개');
  ok(classToCombos('AKo').length === 12, 'AKo 조합 12개');

  // AA vs KK 프리플랍 ≈ 81~82%
  const hero = [C('Ah'), C('Ad')];
  const kk = expandRange(['KK'], hero);
  const r1 = equityVsRange(hero, [], kk);
  ok(r1.eq > 0.79 && r1.eq < 0.84, `AA vs KK ≈ 81% (실제 ${(r1.eq * 100).toFixed(1)}%)`);

  // 프리플랍 코인플립: 77 vs AKo ≈ 54~56%
  const h2 = [C('7h'), C('7d')];
  const r2 = equityVsRange(h2, [], expandRange(['AKo'], h2));
  ok(r2.eq > 0.51 && r2.eq < 0.58, `77 vs AKo ≈ 55% (실제 ${(r2.eq * 100).toFixed(1)}%)`);

  // 승률은 0~1 안에 있어야 하고, 자기 자신 상대로는 50% 근처
  const h3 = [C('Qh'), C('Qd')];
  const r3 = equityVsRange(h3, [], expandRange(['QQ'], h3));
  ok(r3.eq >= 0 && r3.eq <= 1, '승률이 0~1 범위');

  // 멀티웨이: 상대가 늘면 승률은 줄어야 한다
  const h4 = [C('Ah'), C('Kh')];
  const one = equityVsRanges(h4, [], [expandRange(['QQ'], h4)]).eq;
  const two = equityVsRanges(h4, [], [expandRange(['QQ'], h4), expandRange(['JJ'], h4)]).eq;
  ok(two < one, `상대가 늘면 승률 감소 (1명 ${(one * 100).toFixed(1)}% → 2명 ${(two * 100).toFixed(1)}%)`);
}

/* ───────────────── analyze 통합 ───────────────── */
group('analyze 통합');
{
  const { analyze } = app;
  const R = '23456789TJQKA', SU = 'shdc';
  const C = (s) => R.indexOf(s[0]) * 4 + SU.indexOf(s[1]);
  const inp = {
    seats: 6, gt: 'cash', stack: 100,
    pos: 'BTN', vpos: 'BB', pf: (app.PFS && app.PFS[1] && app.PFS[1].id) || 'srp_ip',
    vt: 'unknown', vils: [{ pos: 'BB', vt: 'unknown' }], agg: 0,
    hole: [C('Ah'), C('Kh')],
    flop: [C('Ks'), C('7d'), C('2c')], turn: [], river: [],
    board: [C('Ks'), C('7d'), C('2c')],
    acts: [{ v: 'bet', vs: 5, m: 'call', ms: 0 }, {}, {}],
  };
  inp.board = inp.flop;
  let res = null, err = null;
  try { res = analyze(inp); } catch (e) { err = e; }
  ok(!err, 'analyze 가 예외 없이 끝난다', err && err.stack);

  if (res) {
    ok(res.streets && res.streets.length >= 1, '스트리트 결과 생성');
    const s = res.streets[0];
    if (s) {
      // 결과에 undefined / NaN 이 없어야 한다
      const bad = [];
      const walk = (o, p) => {
        if (o == null) { bad.push(p + '=null/undefined'); return; }
        if (typeof o === 'number' && !Number.isFinite(o)) { bad.push(p + '=' + o); return; }
        if (typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], p + '.' + k);
      };
      ['eq', 'reqE', 'mdf', 'alpha', 'spr', 'pot', 'vSize', 'rec'].forEach((k) => walk(s[k], k));
      ok(bad.length === 0, '플랍 결과에 NaN/undefined 없음', bad.join(', '));

      // 앱이 낸 값이 참조 수식과 일치하는지
      const pot = s.potStart != null ? s.potStart : s.pot;
      okNear(s.reqE, s.vSize / (pot + 2 * s.vSize), '앱 reqE = 벳/(팟+2×벳)', 1e-9);
      okNear(s.mdf, pot / (pot + s.vSize), '앱 MDF = 팟/(팟+벳)', 1e-9);
      okNear(s.alpha, s.vSize / (pot + s.vSize), '앱 알파 = 벳/(팟+벳)', 1e-9);
      okNear(s.alpha + s.mdf, 1, '앱 알파+MDF = 1', 1e-9);
      ok(s.eq >= 0 && s.eq <= 1, `승률 0~1 (${(s.eq * 100).toFixed(1)}%)`);
      // 톱페어 톱킥커는 언노운 상대 하프팟에 접으면 안 된다
      ok(s.rec !== '폴드', `AK 톱페어에 폴드 권장이 나오면 안 됨 (실제: ${s.rec})`);
    }
  }
}

/* ───────────────── 토너먼트 ───────────────── */
group('토너먼트');
{
  const { TSTRUCT, buildLevels, normTo100, payoutPct, blindsAt, manwon, manchip } = app;
  ok(Array.isArray(TSTRUCT) && TSTRUCT.length > 0, '구조 프리셋 존재');

  // 명세에 못 박힌 파이널나인 데일리 값
  const d = TSTRUCT.find((t) => t.id === 'f9_daily');
  ok(!!d, '파이널나인 데일리 프리셋 존재');
  if (d) {
    ok(d.buyin === 10000, `데일리 바이인 1만원 (실제 ${d.buyin})`);
    ok(d.stack === 2000000, `데일리 시작 스택 200만 (실제 ${d.stack})`);
    ok(d.rebuyPrice === 10000, `데일리 리바이 1만원 (실제 ${d.rebuyPrice})`);
    ok(d.rebuyStack === 3000000, `데일리 리바이 스택 300만 (실제 ${d.rebuyStack})`);
    const lv = buildLevels(d, 12, 0, 0);
    const l1 = lv.find((x) => !x.brk);
    ok(l1 && l1.sb === 100 && l1.bb === 200, `데일리 1레벨 100/200 (실제 ${l1 && l1.sb + '/' + l1.bb})`);
  }

  // 모든 프리셋: 1레벨이 100/200 인지(국내 펍) · 블라인드가 단조 증가인지
  for (const t of TSTRUCT) {
    const lv = buildLevels(t, 20, 0, 0).filter((x) => !x.brk);
    ok(lv.length > 0, `${t.n}: 레벨 생성`);
    let mono = true, badNum = false;
    for (let i = 1; i < lv.length; i++) {
      if (lv[i].bb < lv[i - 1].bb) mono = false;
      if (!Number.isFinite(lv[i].sb) || !Number.isFinite(lv[i].bb) || !Number.isFinite(lv[i].ante || 0)) badNum = true;
    }
    ok(mono, `${t.n}: 블라인드가 줄어들지 않음`);
    ok(!badNum, `${t.n}: 블라인드/앤티에 NaN 없음`);
    ok(lv.every((x) => x.sb > 0 && x.bb > 0), `${t.n}: 블라인드가 양수`);
    if (t.grp === 'pub') {
      ok(lv[0].sb === 100 && lv[0].bb === 200, `${t.n}: 국내 펍은 1레벨 100/200 (실제 ${lv[0].sb}/${lv[0].bb})`);
    }
    ok(typeof t.note === 'string' && /확인|일반형|추정/.test(t.note), `${t.n}: note 에 확인/추정 구분 표기`);
  }

  // 상금 배분: 합이 정확히 100
  for (const spots of [3, 9, 15, 27, 45]) {
    for (const curve of [0.4, 1, 1.6, 3]) {
      const p = payoutPct(spots, curve);
      ok(p.length === spots, `상금 ${spots}명/곡선${curve}: 인원 수 일치`);
      const sum = p.reduce((a, b) => a + b, 0);
      okNear(sum, 100, `상금 ${spots}명/곡선${curve}: 합계 100%`, 1e-6);
      let desc = true;
      for (let i = 1; i < p.length; i++) if (p[i] > p[i - 1] + 1e-9) desc = false;
      ok(desc, `상금 ${spots}명/곡선${curve}: 순위가 낮을수록 적음`);
      ok(p.every((x) => x > 0 && Number.isFinite(x)), `상금 ${spots}명/곡선${curve}: 전부 양수·유한`);
    }
  }
  const n100 = normTo100([33.333, 33.333, 33.333]);
  okNear(n100.reduce((a, b) => a + b, 0), 100, 'normTo100 합계 100');

  // 표시 단위 (금액은 만원)
  ok(typeof manwon === 'function' && typeof manchip === 'function', '만원/만칩 표시 함수 존재');
}

/* ───────────────── 성향 진단 ───────────────── */
group('성향 진단');
{
  const { Q, QMIN, QMAX, axisStats, archetype, newQuiz, nextQuestion } = app;
  ok(Array.isArray(Q) && Q.length === 60, `문항 60개 (실제 ${Q && Q.length})`);
  ok(QMAX === (Q && Q.length), 'QMAX = 문항 수');
  ok(QMIN > 0 && QMIN <= QMAX, 'QMIN 범위');

  const AXES = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2'];
  const seen = new Set();
  let idOk = true, wOk = true, optOk = true;
  for (const q of Q || []) {
    if (!q.id || seen.has(q.id)) idOk = false;
    seen.add(q.id);
    if (!Array.isArray(q.o) || q.o.length < 2) optOk = false;
    for (const o of q.o || []) {
      if (!o.t) optOk = false;
      for (const k of Object.keys(o.w || {})) if (!AXES.includes(k)) wOk = false;
    }
  }
  ok(idOk, '문항 id 가 전부 고유');
  ok(optOk, '모든 문항에 선택지 2개 이상 + 문구 존재');
  ok(wOk, '가중치 축이 7축(A1~A5,B1,B2) 안에만 있음');

  // 전 문항을 첫 선택지로 답했을 때 7축이 전부 유한값으로 나온다
  const ans = {};
  for (const q of Q || []) ans[q.id] = 0;
  const st = axisStats(ans);
  ok(!!st && !!st.score, 'axisStats 가 score 를 반환');
  if (st && st.score) {
    let fin = true, ranged = true;
    for (const k of AXES) {
      if (!Number.isFinite(st.score[k])) fin = false;
      if (st.score[k] < -100 || st.score[k] > 100) ranged = false;
    }
    ok(fin, '7축 점수 전부 유한값', JSON.stringify(st.score));
    ok(ranged, '7축 점수가 −100~100 범위', JSON.stringify(st.score));
    let confOk = true;
    for (const k of AXES) if (!Number.isFinite(st.conf[k]) || st.conf[k] < 0 || st.conf[k] > 1) confOk = false;
    ok(confOk, '7축 신뢰도가 0~1 범위', JSON.stringify(st.conf));
    const ar = archetype(st);
    ok(typeof ar === 'object' || typeof ar === 'string', 'archetype 반환');
  }

  // 이어서 하기: 이미 답한 문항은 다시 안 나온다
  const qz = newQuiz();
  const first = nextQuestion(qz);
  ok(!!first, '첫 문항 출제');
  if (first) {
    qz.asked.push(first.id); qz.ans[first.id] = 0;
    const second = nextQuestion(qz);
    ok(!second || second.id !== first.id, '답한 문항이 다시 나오지 않음');
  }
}

/* ───────────────── 드릴 ───────────────── */
group('드릴');
{
  const { makeHand, openStreet, playAction } = app;
  ok(typeof makeHand === 'function', 'makeHand 존재');
  if (typeof makeHand === 'function') {
    let bad = null;
    for (const depth of ['short', 'mid', 'deep', 'random']) {
      for (const mode of ['cash', 'tour']) {
        for (let i = 0; i < 25 && !bad; i++) {
          try {
            const H = makeHand({ depth, mode, vt: 'random' });
            const tag = `${depth}/${mode}: `;
            if (!H || !Array.isArray(H.hole) || H.hole.length !== 2) { bad = tag + '홀카드 2장 아님'; break; }
            if (!Array.isArray(H.full) || H.full.length !== 5) { bad = tag + '보드 5장 아님: ' + (H.full && H.full.length); break; }
            if (!Array.isArray(H.vHole) || H.vHole.length !== 2) { bad = tag + '상대 홀카드 2장 아님'; break; }
            const all = H.hole.concat(H.vHole, H.full);
            if (new Set(all).size !== all.length) { bad = tag + '카드 중복'; break; }
            if (all.some((c) => !Number.isInteger(c) || c < 0 || c > 51)) { bad = tag + '카드 id 범위 밖'; break; }
            if (!Number.isFinite(H.pot) || H.pot <= 0) { bad = tag + 'pot 이 NaN/0: ' + H.pot; break; }
            if (!Number.isFinite(H.eff) || H.eff <= 0) { bad = tag + 'eff 가 NaN/0: ' + H.eff; break; }
            if (!Number.isFinite(H.hInv)) { bad = tag + 'hInv 가 NaN'; break; }
            // 스트리트를 열고 선택지가 생기는지 (spotOptions 는 {opts, eq, vilCount, facing} 를 준다)
            openStreet(H);
            const O = H.opts;
            if (!O || !Array.isArray(O.opts) || O.opts.length === 0) { bad = tag + '선택지 없음'; break; }
            if (!Number.isFinite(O.eq) || O.eq < 0 || O.eq > 1) { bad = tag + '승률이 0~1 밖: ' + O.eq; break; }
            for (const o of O.opts) {
              if (!o.k) { bad = tag + '선택지 문구 없음'; break; }
              if (!Number.isFinite(o.ev)) { bad = tag + '선택지 EV 가 NaN: ' + o.k; break; }
              if (/undefined|NaN/.test(o.k + ' ' + (o.note || ''))) { bad = tag + '선택지에 undefined/NaN 문자열: ' + o.k + ' / ' + o.note; break; }
            }
            if (bad) break;
            // 벳/레이즈 금액은 유효 스택을 넘으면 안 된다
            for (const o of O.opts) {
              const amt = (o.k.match(/([\d.]+)BB/) || [])[1];
              if (amt != null && +amt > H.eff + 1e-9) { bad = tag + `선택지 금액 ${amt}BB 가 유효스택 ${H.eff}BB 초과`; break; }
            }
          } catch (e) { bad = `${depth}/${mode}: ` + e.message; break; }
        }
      }
    }
    ok(!bad, '드릴 200핸드(스택·모드 전조합): 카드 중복·NaN·빈 선택지 없음', bad);

    // 리버까지 끝까지 진행해도 죽지 않는지 (playAction 이 다음 스트리트를 스스로 연다)
    let runBad = null;
    for (let i = 0; i < 60 && !runBad; i++) {
      try {
        const H = makeHand({ depth: 'random', mode: i % 2 ? 'tour' : 'cash', vt: 'random' });
        openStreet(H);
        let guard = 0;
        while (!H.over && guard++ < 8) {
          const O = H.opts;
          playAction(H, i % O.opts.length);           // 매번 다른 선택지를 고른다
          if (!Number.isFinite(H.pot) || H.pot < 0) { runBad = 'pot 이 NaN/음수: ' + H.pot; break; }
          if (!Number.isFinite(H.eff) || H.eff < 0) { runBad = 'eff 가 NaN/음수: ' + H.eff; break; }
        }
        if (!runBad && guard >= 8) runBad = '핸드가 끝나지 않음(무한 루프)';
        if (!runBad && !H.result) runBad = '끝났는데 result 가 없음';
        // v3.1 이 고친 것: 스트리트 기록에 undefined 가 없어야 한다
        for (const s of H.steps || []) {
          for (const [k, v] of Object.entries(s)) {
            if (v === undefined) { runBad = `steps.${k} 가 undefined`; break; }
            if (typeof v === 'number' && !Number.isFinite(v)) { runBad = `steps.${k} 가 ${v}`; break; }
          }
          if (runBad) break;
        }
      } catch (e) { runBad = e.message; }
    }
    ok(!runBad, '드릴 60핸드를 리버까지 진행: 예외·NaN·무한루프·steps undefined 없음', runBad);
  }
}

/* ───────────────── 저장소 ───────────────── */
group('저장소');
{
  const { DB } = app;
  ok(!!DB, 'DB 래퍼 존재');
  if (DB) {
    DB.set('__t', { a: 1 });
    ok(JSON.stringify(DB.get('__t', null)) === '{"a":1}', 'set/get 왕복');
    ok(ctx.localStorage.getItem('hb.__t') === '{"a":1}', 'hb. 접두사로 저장');
    DB.del('__t');
    ok(DB.get('__t', 'gone') === 'gone', 'del 후 기본값 반환');
  }
}

/* ───────────────── 결과 ───────────────── */
const total = pass + fails.length;
console.log('');
for (const g of groups) console.log(`  ${g.name} — ${g.n}건`);
console.log('');
if (fails.length) {
  console.log(`✗ 로직 검증 실패 ${fails.length} / ${total}\n`);
  fails.forEach((f) => console.log('  ✗ ' + f));
  console.log('');
  process.exit(1);
}
console.log(`✓ 로직 검증 통과 ${pass} / ${total}  (${path.basename(FILE)} v${app.APP_VER})\n`);
