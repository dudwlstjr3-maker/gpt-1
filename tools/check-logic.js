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

/* ───────────────── 액션 순서 엔진 ───────────────── */
group('액션 순서');
{
  const { actOrder, ipVs, handState, legalActs, posList } = app;

  // 순서: 프리플랍은 UTG부터, 포스트플랍은 SB부터
  ok(actOrder(6, 0).join(',') === 'UTG,HJ,CO,BTN,SB,BB', '6맥스 프리플랍은 UTG부터', actOrder(6, 0).join(','));
  ok(actOrder(6, 1).join(',') === 'SB,BB,UTG,HJ,CO,BTN', '6맥스 포스트플랍은 SB부터 · BTN 마지막', actOrder(6, 1).join(','));
  ok(actOrder(9, 1)[0] === 'SB' && actOrder(9, 1).slice(-1)[0] === 'BTN', '9맥스도 SB 먼저 · BTN 마지막');
  // 헤즈업: 버튼이 프리플랍 먼저, 포스트플랍 마지막
  ok(actOrder(2, 0).join(',') === 'BTN(SB),BB', '헤즈업 프리플랍은 버튼부터', actOrder(2, 0).join(','));
  ok(actOrder(2, 1).join(',') === 'BB,BTN(SB)', '헤즈업 포스트플랍은 BB부터', actOrder(2, 1).join(','));
  ok(ipVs(2, 'BTN(SB)', 'BB') === true, '헤즈업에서 버튼이 포지션을 가진다 (v4.0까지 반대였다)');
  ok(ipVs(2, 'BB', 'BTN(SB)') === false, '헤즈업에서 BB 는 포지션이 없다');
  ok(ipVs(6, 'BTN', 'BB') === true, '6맥스 BTN vs BB → BTN 이 포지션');
  ok(ipVs(6, 'SB', 'BTN') === false, '6맥스 SB vs BTN → SB 가 포지션 없음');
  ok(ipVs(6, 'BB', 'SB') === true, '6맥스 BB vs SB → BB 가 포지션');

  const cfg = (o) => Object.assign({ seats: 6, ante: 0, stack: 100, hero: 'BTN', boardLen: 0 }, o);

  // 블라인드와 첫 차례
  {
    const S = handState(cfg(), []);
    okNear(S.pot, 1.5, '블라인드만 있으면 팟 1.5BB');
    ok(S.toAct === 'UTG', '첫 차례는 UTG', S.toAct);
    okNear(S.toCall, 1, 'UTG 가 콜할 금액은 1BB');
    okNear(S.cm.SB, 0.5, 'SB 가 0.5 냈다');
    okNear(S.cm.BB, 1, 'BB 가 1 냈다');
    const la = legalActs(S).map((x) => x.a).join(',');
    ok(la === 'fold,call,raise', '벳을 맞은 자리는 폴드·콜·레이즈', la);
  }
  // 앤티
  {
    const S = handState(cfg({ ante: 0.125 }), []);
    okNear(S.pot, 1.5 + 6 * 0.125, '앤티가 인원수만큼 팟에 들어간다');
  }
  // 폴드가 돌면 차례가 넘어간다
  {
    const S = handState(cfg(), [{ a: 'fold' }, { a: 'fold' }]);
    ok(S.toAct === 'CO', 'UTG·HJ 폴드 후 차례는 CO', S.toAct);
    ok(S.folded.UTG && S.folded.HJ, '폴드가 기록된다');
    okNear(S.pot, 1.5, '폴드는 팟을 늘리지 않는다');
  }
  // 오픈 → 폴드 → BB 콜 → 플랍
  {
    const seq = [{ a: 'fold' }, { a: 'fold' }, { a: 'fold' },
      { a: 'raise', to: 2.5 }, { a: 'fold' }, { a: 'call' }];
    const S = handState(cfg(), seq);
    okNear(S.pot, 2.5 + 2.5 + 0.5, 'BTN 2.5 오픈 · BB 콜 · SB 폴드 → 팟 5.5BB');
    ok(S.live.join(',') === 'BTN,BB', '남은 사람은 BTN·BB', S.live.join(','));
    ok(S.waitingBoard === true, '플랍 카드를 기다린다');
    ok(S.needBoard === 3, '필요한 보드 장수 3', String(S.needBoard));
    ok(S.toAct === null, '보드가 없으면 다음 차례가 없다');
    const S2 = handState(cfg({ boardLen: 3 }), seq);
    ok(S2.street === 1, '보드를 깔면 플랍으로 넘어간다', String(S2.street));
    ok(S2.toAct === 'BB', '플랍 첫 차례는 BB (포지션 없는 쪽)', S2.toAct);
    okNear(S2.toCall, 0, '플랍 첫 액션은 콜할 금액 0');
    ok(legalActs(S2).map((x) => x.a).join(',') === 'check,bet', '벳이 없으면 체크·벳만');
  }
  // BB 옵션 — 다 콜해도 BB 는 한 번 더 친다
  {
    const seq = [{ a: 'call' }, { a: 'fold' }, { a: 'fold' }, { a: 'fold' }, { a: 'call' }];
    const S = handState(cfg({ hero: 'BB' }), seq);
    ok(S.toAct === 'BB', '모두 콜해도 BB 에게 옵션이 온다', S.toAct);
    okNear(S.toCall, 0, 'BB 는 이미 맞춰 놨으니 콜할 금액 0');
    ok(legalActs(S).map((x) => x.a).join(',') === 'check,bet', 'BB 옵션은 체크 또는 레이즈(벳)');
  }
  // 3벳 · 최소 레이즈
  {
    const seq = [{ a: 'fold' }, { a: 'fold' }, { a: 'raise', to: 2.5 }];
    const S = handState(cfg(), seq);
    ok(S.toAct === 'BTN', '오픈 뒤 차례는 BTN', S.toAct);
    okNear(S.betTo, 2.5, '맞춰야 할 금액 2.5');
    okNear(S.minRaiseTo, 2.5 + 1.5, '최소 레이즈는 직전 레이즈 폭만큼 더');
    const S3 = handState(cfg(), seq.concat([{ a: 'raise', to: 8 }]));
    ok(S3.toAct === 'SB', '3벳 뒤 차례는 SB', S3.toAct);
    okNear(S3.pot, 2.5 + 8 + 0.5 + 1, '3벳 팟');
    const S4 = handState(cfg(), seq.concat([{ a: 'raise', to: 8 }, { a: 'fold' }, { a: 'fold' }]));
    ok(S4.toAct === 'CO', '3벳에 블라인드가 접으면 오픈한 사람 차례', S4.toAct);
    okNear(S4.toCall, 8 - 2.5, '오픈한 사람이 콜할 금액은 차액');
  }
  // 체크가 돌면 스트리트가 넘어간다
  {
    const pre = [{ a: 'fold' }, { a: 'fold' }, { a: 'fold' }, { a: 'raise', to: 2.5 }, { a: 'fold' }, { a: 'call' }];
    const S = handState(cfg({ boardLen: 4 }), pre.concat([{ a: 'check' }, { a: 'check' }]));
    ok(S.street === 2, '플랍에서 둘 다 체크하면 턴으로', String(S.street));
    ok(S.toAct === 'BB', '턴 첫 차례도 BB', S.toAct);
  }
  // 체크-레이즈
  {
    const pre = [{ a: 'fold' }, { a: 'fold' }, { a: 'fold' }, { a: 'raise', to: 2.5 }, { a: 'fold' }, { a: 'call' }];
    const S = handState(cfg({ boardLen: 3 }), pre.concat([{ a: 'check' }, { a: 'bet', to: 3 }, { a: 'raise', to: 10 }]));
    ok(S.toAct === 'BTN', '체크-레이즈를 맞은 쪽이 다시 친다', S.toAct);
    okNear(S.toCall, 7, '체크-레이즈에 콜할 금액은 차액 7');
    okNear(S.pot, 5.5 + 3 + 10, '체크-레이즈 팟');
  }
  // 한 명만 남으면 핸드 종료
  {
    const S = handState(cfg(), [{ a: 'fold' }, { a: 'fold' }, { a: 'fold' }, { a: 'raise', to: 2.5 }, { a: 'fold' }, { a: 'fold' }]);
    ok(S.over === true, '한 명만 남으면 끝난다');
    ok(S.ended === 'fold', '끝난 이유는 폴드', String(S.ended));
    ok(S.toAct === null, '끝났으면 차례가 없다');
  }
  // 올인 상한
  {
    const S = handState(cfg({ stack: 12 }), [{ a: 'fold' }, { a: 'fold' }, { a: 'fold' }, { a: 'raise', to: 99 }]);
    okNear(S.cm.BTN, 12, '스택보다 크게 넣을 수 없다');
    ok(S.allin.BTN === true, '스택을 다 넣으면 올인으로 표시된다');
  }
  // 규칙에 안 맞는 시퀀스는 거기서 멈추고 앞부분만 반영한다
  {
    const S = handState(cfg(), [{ a: 'check' }]);
    ok(S.applied === 0, '벳을 맞은 자리에서 체크는 적용되지 않는다', String(S.applied));
    ok(!!S.err, '무엇이 잘못됐는지 알려준다', String(S.err));
  }
  // 모든 인원 수에서 죽지 않는다
  for (const seats of [2, 6, 9]) {
    let bad = null;
    try {
      const seq = [];
      for (let i = 0; i < 40; i++) {
        const S = handState(cfg({ seats, hero: posList(seats)[0], boardLen: 5 }), seq);
        if (S.err) { bad = `${seats}인: ${S.err}`; break; }
        if (S.over || !S.toAct) break;
        const la = legalActs(S);
        if (!la.length) { bad = `${seats}인: 고를 액션이 없다`; break; }
        const pick = la.find((x) => x.a === 'call') || la.find((x) => x.a === 'check') || la[0];
        seq.push(pick.a === 'bet' || pick.a === 'raise' ? { a: pick.a, to: S.minRaiseTo } : { a: pick.a });
      }
      const F = handState(cfg({ seats, hero: posList(seats)[0], boardLen: 5 }), seq);
      if (!F.over) bad = `${seats}인: 끝까지 진행되지 않았다 (스트리트 ${F.street})`;
    } catch (e) { bad = `${seats}인: ` + e.message; }
    ok(!bad, `${seats}인 테이블을 끝까지 진행할 수 있다`, bad);
  }
}

/* ───────────────── 시퀀스 → 분석 어댑터 ───────────────── */
group('시퀀스 → 분석');
{
  const { seqToInput, pfScenarioOf, handState, analyze } = app;
  const R = '23456789TJQKA', SU = 'shdc';
  const C = (s) => R.indexOf(s[0]) * 4 + SU.indexOf(s[1]);
  const cfg = (o) => Object.assign({
    seats: 6, ante: 0, stack: 100, hero: 'BTN', gt: 'cash', boardLen: 0,
    seatVT: {},
  }, o);
  const cards = (hole, board) => ({ hole: hole.map(C), board: (board || []).map(C) });

  // BTN 오픈 → BB 콜 → 플랍에서 BB 가 하프팟 벳, 내가 콜
  const pre = [{ a: 'fold' }, { a: 'fold' }, { a: 'fold' }, { a: 'raise', to: 2.5 }, { a: 'fold' }, { a: 'call' }];
  {
    const seq = pre.concat([{ a: 'bet', to: 2.75 }, { a: 'call' }]);
    const c = cards(['Ah', 'Kh'], ['Ks', '7d', '2c']);
    const inp = seqToInput(cfg({ boardLen: 3 }), seq, c);
    ok(!inp.err, '어댑터가 입력을 만든다', inp.err);
    if (!inp.err) {
      ok(inp.pf === 'open_call', '내가 오픈하고 상대가 콜 → open_call', inp.pf);
      okNear(inp.pfPot, 5.5, '프리플랍 종료 팟이 실제 액션에서 나온다');
      ok(inp.pos === 'BTN' && inp.vpos === 'BB', '내 자리·상대 자리', `${inp.pos} vs ${inp.vpos}`);
      ok(inp.vils.length === 1, '상대는 한 명');
      const st = inp.streets[0];
      ok(!!st, '플랍 분석 지점이 생긴다');
      // 팟 5.5 에서 상대가 2.75 벳 → 내가 2.75 콜. 규약상 pot = 상대가 걸기 전 팟
      okNear(st.vSize, 2.75, '내가 더 넣어야 하는 금액 = 상대 벳');
      okNear(st.pot, 5.5, '상대가 걸기 전 팟 5.5BB');
      okNear(st.hInv, 2.5, '플랍 시작 시 내 투입 2.5BB');
      ok(st.mAct === 'call', '내 액션은 콜', st.mAct);
      // 이 값이 명세의 수식과 정확히 맞는지
      okNear(st.vSize / (st.pot + 2 * st.vSize), 2.75 / 11, '필요 승률 = 벳/(팟+2×벳) = 2.75/11');
      okNear(st.pot / (st.pot + st.vSize), 5.5 / 8.25, 'MDF = 팟/(팟+벳)');
    }
  }
  // 오픈 사이즈가 다르면 프리플랍 팟도 달라진다 (프리셋 5.5 에 고정되면 안 된다)
  {
    const seq = [{ a: 'fold' }, { a: 'fold' }, { a: 'fold' }, { a: 'raise', to: 4 }, { a: 'fold' }, { a: 'call' },
      { a: 'bet', to: 4 }, { a: 'call' }];
    const inp = seqToInput(cfg({ boardLen: 3 }), seq, cards(['Ah', 'Kh'], ['Ks', '7d', '2c']));
    okNear(inp.pfPot, 8.5, '4BB 오픈이면 프리플랍 팟은 8.5BB');
    okNear(inp.streets[0].pot, 8.5, '플랍 상대 벳 앞 팟도 8.5BB');
    const res = analyze(inp);
    okNear(res.pf.pot, 8.5, 'analyze 결과에도 실제 팟이 실린다');
    ok(res.pf.fromSeq === true, '시퀀스에서 온 입력이라고 표시된다');
  }

  // 체크-레이즈: 내가 벳하고 상대가 레이즈, 내가 콜 → 차액만 넣는다
  {
    const seq = pre.concat([{ a: 'check' }, { a: 'bet', to: 3 }, { a: 'raise', to: 10 }, { a: 'call' }]);
    const inp = seqToInput(cfg({ boardLen: 3 }), seq, cards(['Ah', 'Kh'], ['Ks', '7d', '2c']));
    ok(!inp.err, '체크-레이즈 스팟도 만들어진다', inp.err);
    if (!inp.err) {
      const st = inp.streets[0];
      okNear(st.vSize, 7, '체크-레이즈에 콜할 금액은 차액 7BB');
      // 내가 콜하기 직전 팟 = 5.5 + 3 + 10 = 18.5, 규약상 pot = 18.5 - 7
      okNear(st.pot, 11.5, '규약상 팟 = 콜 직전 팟 − 콜할 금액');
      okNear(st.vSize / (st.pot + 2 * st.vSize), 7 / 25.5, '필요 승률 = 7/(18.5+7)');
      // EV 도 맞는지 — 이겼을 때 18.5 를 먹고 졌을 때 7 을 잃는다
      const eq = 0.4;
      okNear(eq * (st.pot + st.vSize) - (1 - eq) * st.vSize, eq * 18.5 - (1 - eq) * 7,
        'EV(콜) = 승률×콜직전팟 − (1−승률)×콜할금액');
      ok(st.more === true, '이 스트리트에 내 판단이 두 번 있었다고 표시된다');
    }
  }
  // 내가 먼저 치는 자리 — 콜할 금액 0
  {
    const seq = pre.concat([{ a: 'check' }, { a: 'bet', to: 3 }]);
    const inp = seqToInput(cfg({ boardLen: 3 }), seq, cards(['Ah', 'Kh'], ['Ks', '7d', '2c']));
    const st = inp.streets[0];
    okNear(st.vSize, 0, '체크가 돌아오면 콜할 금액 0');
    okNear(st.pot, 5.5, '내가 치기 전 팟');
    ok(st.mAct === 'bet' && st.mSize === 3, '내 벳 3BB 가 기록된다', `${st.mAct} ${st.mSize}`);
  }
  // 시나리오 판정
  {
    const mk = (seq) => pfScenarioOf(handState(cfg(), seq), 'BTN');
    ok(mk([{ a: 'call' }, { a: 'call' }, { a: 'call' }, { a: 'call' }, { a: 'call' }, { a: 'check' }]) === 'limp',
      '아무도 안 올리면 림프 팟');
    ok(mk([{ a: 'fold' }, { a: 'fold' }, { a: 'raise', to: 2.5 }, { a: 'call' }, { a: 'fold' }, { a: 'fold' }]) === 'call_open',
      '상대가 오픈하고 내가 콜 → call_open');
    ok(mk([{ a: 'fold' }, { a: 'fold' }, { a: 'raise', to: 2.5 }, { a: 'raise', to: 8 }, { a: 'fold' }, { a: 'fold' }]) === '3b_call',
      '내가 3벳 → 3b_call');
    ok(mk([{ a: 'fold' }, { a: 'fold' }, { a: 'fold' }, { a: 'raise', to: 2.5 }, { a: 'raise', to: 8 }, { a: 'fold' }]) === 'call_3b',
      '상대가 3벳 → call_3b');
  }
  // 어댑터 결과를 analyze 에 그대로 넣어도 되는지 — 그리고 앱이 낸 값이 수식과 일치하는지
  {
    const seq = pre.concat([{ a: 'bet', to: 2.75 }, { a: 'call' }]);
    const inp = seqToInput(cfg({ boardLen: 3 }), seq, cards(['Ah', 'Kh'], ['Ks', '7d', '2c']));
    let res = null, err = null;
    try { res = analyze(inp); } catch (e) { err = e; }
    ok(!err, 'analyze 가 시퀀스 입력을 받는다', err && err.stack);
    if (res && res.streets && res.streets[0]) {
      const s = res.streets[0];
      okNear(s.pot, 5.5, 'analyze 가 실제 팟을 쓴다');
      okNear(s.vSize, 2.75, 'analyze 가 실제 콜할 금액을 쓴다');
      okNear(s.reqE, 2.75 / 11, '필요 승률이 실제 액션에서 나온다');
      okNear(s.mdf, 5.5 / 8.25, 'MDF 가 실제 액션에서 나온다');
      okNear(s.alpha + s.mdf, 1, '알파+MDF = 1');
      ok(s.eq > 0 && s.eq < 1, '승률이 0~1');
      ok(s.rec !== '폴드', `톱페어 톱킥커에 폴드는 아니다 (${s.rec})`);
      okNear(s.effStack, 100 - 2.5, '유효 스택 = 스택 − 플랍 시작 시 투입');
    }
  }
  // 턴·리버까지 이어지는 핸드
  {
    const seq = pre.concat([
      { a: 'bet', to: 2.75 }, { a: 'call' },      // 플랍
      { a: 'bet', to: 6 }, { a: 'call' },         // 턴
      { a: 'check' }, { a: 'check' },             // 리버
    ]);
    const inp = seqToInput(cfg({ boardLen: 5 }), seq, cards(['Ah', 'Kh'], ['Ks', '7d', '2c', '3h', '9s']));
    ok(!inp.err, '세 스트리트 핸드가 만들어진다', inp.err);
    ok(inp.streets.length === 3, '플랍·턴·리버 세 지점', String(inp.streets && inp.streets.length));
    if (inp.streets && inp.streets.length === 3) {
      okNear(inp.streets[1].pot, 11, '턴 시작 팟 = 5.5 + 2.75×2');
      okNear(inp.streets[1].hInv, 5.25, '턴 시작 시 내 투입 = 2.5 + 2.75');
      okNear(inp.streets[2].pot, 23, '리버 시작 팟 = 11 + 6×2');
      const res = analyze(inp);
      ok(res.streets.length === 3, 'analyze 도 세 스트리트를 낸다');
      const bad = res.streets.filter((s) => !Number.isFinite(s.eq) || !Number.isFinite(s.reqE));
      ok(bad.length === 0, '세 스트리트 모두 NaN 없음');
    }
  }
  // 내가 접으면 거기서 멈춘다
  {
    const seq = pre.concat([{ a: 'bet', to: 8 }, { a: 'fold' }]);
    const inp = seqToInput(cfg({ boardLen: 5 }), seq, cards(['Ah', 'Kh'], ['Ks', '7d', '2c', '3h', '9s']));
    ok(inp.heroFolded === true, '내가 접었다고 표시된다');
    ok(inp.streets.length === 1, '접은 스트리트까지만 분석한다', String(inp.streets && inp.streets.length));
  }
  // 프리플랍만
  {
    const seq = [{ a: 'fold' }, { a: 'fold' }, { a: 'fold' }, { a: 'raise', to: 2.5 }];
    const inp = seqToInput(cfg(), seq, cards(['Ah', 'Kh'], []));
    ok(inp.pf === 'pf_only', '보드가 없으면 프리플랍만 분석', inp.pf);
    const res = analyze(inp);
    ok(res.pfOnly === true, 'analyze 가 프리플랍 전용으로 처리');
  }
  // 멀티웨이
  {
    const seq = [{ a: 'fold' }, { a: 'raise', to: 2.5 }, { a: 'call' }, { a: 'call' }, { a: 'fold' }, { a: 'call' },
      { a: 'check' }, { a: 'check' }, { a: 'bet', to: 5 }, { a: 'call' }];   // 플랍까지
    const inp = seqToInput(cfg({ boardLen: 3, hero: 'BTN' }), seq, cards(['Ah', 'Kh'], ['Ks', '7d', '2c']));
    ok(!inp.err, '멀티웨이 입력이 만들어진다', inp.err);
    ok(inp.vils.length === 3, '상대 3명 (HJ·CO·BB)', inp.vils.map((v) => v.pos).join(','));
    ok(inp.pf === 'call_open', 'HJ 가 오픈하고 내가 콜 → call_open', inp.pf);
  }
  // 예전 입력 형태도 계속 동작해야 한다
  {
    const old = {
      seats: 6, gt: 'cash', stack: 100, pos: 'BTN', vpos: 'BB', pf: 'open_call',
      vt: 'unknown', vils: [{ pos: 'BB', vt: 'unknown' }], agg: 0,
      hole: [C('Ah'), C('Kh')], flop: [C('Ks'), C('7d'), C('2c')], turn: [], river: [],
      board: [C('Ks'), C('7d'), C('2c')],
      acts: [{ v: 'bet', vs: 5, m: 'call', ms: 0 }, {}, {}],
    };
    const res = analyze(old);
    ok(res.streets && res.streets.length >= 1, '예전 형태 입력도 그대로 분석된다');
    okNear(res.streets[0].vSize, 5, '예전 형태의 상대 벳이 쓰인다');
  }
}

/* ───────────────── 포지션별 레인지 표 ───────────────── */
group('포지션별 레인지');
{
  const { rngFor, rngPct, rngCombos, canOpen, OPEN_PCT, VTYPE, RNG_SIT, posList, rangeClasses, cap } = app;
  ok(Array.isArray(RNG_SIT) && RNG_SIT.length === 3, '상황 3가지 (오픈·콜·3벳)');
  ok(RNG_SIT.every((x) => x.id && x.n && x.d), '상황마다 이름·설명이 있다');

  // 자리가 늦을수록 오픈 레인지가 넓다
  const seq = ['UTG', 'HJ', 'CO', 'BTN'];
  let mono = true;
  for (let i = 1; i < seq.length; i++)
    if (rngPct(rngFor(seq[i], 'open', 'unknown')) <= rngPct(rngFor(seq[i - 1], 'open', 'unknown'))) mono = false;
  ok(mono, '자리가 늦을수록 오픈 레인지가 넓어진다',
    seq.map((p) => `${p} ${rngPct(rngFor(p, 'open', 'unknown')).toFixed(1)}%`).join(' → '));

  // 표시하는 % 가 OPEN_PCT 와 어긋나지 않는다 (표와 계산이 같은 값이어야 한다)
  for (const p of ['UTG', 'CO', 'BTN', 'SB']) {
    const got = rngPct(rngFor(p, 'open', 'unknown'));
    ok(Math.abs(got - OPEN_PCT[p]) < 3, `${p} 표시 %가 OPEN_PCT(${OPEN_PCT[p]}%)와 맞는다 (${got.toFixed(1)}%)`);
  }
  // 그리고 analyze 가 쓰는 것과 정확히 같은 레인지여야 한다
  for (const p of ['UTG', 'BTN']) {
    const fromTable = rngFor(p, 'open', 'unknown').join(',');
    const fromEngine = rangeClasses(cap(OPEN_PCT[p] * VTYPE.unknown.w)).join(',');
    ok(fromTable === fromEngine, `${p}: 표에 보이는 레인지 = 엔진이 쓰는 레인지`);
  }

  // BB 는 먼저 들어오는 자리가 아니다
  ok(canOpen('BB') === false, 'BB 는 «먼저 들어올» 자리로 치지 않는다');
  ok(canOpen('SB') === true && canOpen('BTN') === true, 'SB·BTN 은 먼저 들어올 수 있다');

  // 성향이 레인지 폭을 움직인다
  const tight = rngPct(rngFor('CO', 'open', 'nit'));
  const base = rngPct(rngFor('CO', 'open', 'unknown'));
  const loose = rngPct(rngFor('CO', 'open', 'station'));
  ok(tight < base, `타이트한 상대는 좁다 (${tight.toFixed(1)}% < ${base.toFixed(1)}%)`);
  ok(loose > base, `루즈한 상대는 넓다 (${loose.toFixed(1)}% > ${base.toFixed(1)}%)`);

  // 3벳은 콜보다, 콜은 오픈보다 좁거나 같다
  ok(rngPct(rngFor(null, '3bet', 'unknown')) < rngPct(rngFor(null, 'call', 'unknown')),
    '3벳 레인지가 콜 레인지보다 좁다');

  // 어떤 조합에서도 100% 를 넘거나 비지 않는다
  let bad = null;
  for (const vt of Object.keys(VTYPE)) {
    for (const sit of ['open', 'call', '3bet']) {
      for (const p of posList(9).concat(posList(2))) {
        if (sit === 'open' && !canOpen(p)) continue;
        const cls = rngFor(p, sit, vt);
        const pv = rngPct(cls);
        if (!Number.isFinite(pv) || pv <= 0 || pv > 100) { bad = `${p}/${sit}/${vt} → ${pv}`; break; }
        if (rngCombos(cls) <= 0) { bad = `${p}/${sit}/${vt} 조합 0개`; break; }
        if (new Set(cls).size !== cls.length) { bad = `${p}/${sit}/${vt} 중복 핸드`; break; }
      }
      if (bad) break;
    }
    if (bad) break;
  }
  ok(!bad, '모든 자리·상황·성향 조합에서 0~100% 안의 유효한 레인지가 나온다', bad);

  // 레인지는 센 핸드부터 채워진다
  ok(rngFor('UTG', 'open', 'unknown')[0] === 'AA', '가장 좁은 레인지의 첫 핸드는 AA');
  ok(rngFor('BTN', 'open', 'unknown').includes('AA'), '넓은 레인지에도 AA 는 들어 있다');
}

/* ───────────────── 권장 플레이 스타일 ───────────────── */
group('권장 스타일');
{
  const { HSTYLES, hStyle, openPctFor, OPEN_PCT, DB, analyze, rngFor, rngPct } = app;
  ok(Array.isArray(HSTYLES) && HSTYLES.length === 3, '스타일 3단계 (타이트·표준·넓게)');
  ok(HSTYLES.every((x) => x.id && x.n && x.d), '스타일마다 이름·설명이 있다');

  ctx.localStorage.clear();
  ok(hStyle().id === 'tight', '기본값은 타이트', hStyle().id);

  // 타이트가 표준보다 좁고, 넓게가 표준보다 넓다
  const at = (st, pos) => { DB.set('hstyle', st); return openPctFor(pos); };
  for (const pos of ['UTG', 'HJ', 'CO', 'BTN', 'SB']) {
    const t = at('tight', pos), s = at('std', pos), l = at('loose', pos);
    ok(t < s && s < l, `${pos}: 타이트 ${t}% < 표준 ${s}% < 넓게 ${l}%`);
    ok(Math.abs(s - OPEN_PCT[pos]) < 0.1, `${pos}: 표준은 OPEN_PCT 그대로 (${s}% vs ${OPEN_PCT[pos]}%)`);
  }
  // BB 는 공짜로 보는 자리라 좁히지 않는다
  ok(at('tight', 'BB') === 100 && at('loose', 'BB') === 100, 'BB 는 어느 스타일에서도 100%');

  // 자리 순서는 어느 스타일에서도 유지된다
  for (const st of ['tight', 'std', 'loose']) {
    DB.set('hstyle', st);
    const seq2 = ['UTG', 'HJ', 'CO', 'BTN'];
    let up = true;
    for (let i = 1; i < seq2.length; i++) if (!(openPctFor(seq2[i]) > openPctFor(seq2[i - 1]))) up = false;
    ok(up, `${st}: 자리가 늦을수록 넓다`);
  }

  // 상대 레인지를 읽는 값은 스타일과 무관해야 한다 (내 플레이 기준일 뿐)
  DB.set('hstyle', 'tight');
  const vTight = rngPct(rngFor('CO', 'open', 'unknown'));
  DB.set('hstyle', 'loose');
  const vLoose = rngPct(rngFor('CO', 'open', 'unknown'));
  ok(Math.abs(vTight - vLoose) < 1e-9,
    '권장 스타일은 상대 레인지 읽기를 바꾸지 않는다', `${vTight} vs ${vLoose}`);

  // 실제 분석에서 타이트가 더 적게 친다
  const R = '23456789TJQKA', SU = 'shdc';
  const C = (x) => R.indexOf(x[0]) * 4 + SU.indexOf(x[1]);
  const mk = () => ({
    seats: 6, gt: 'cash', stack: 100, pos: 'BTN', vpos: 'BB', pf: 'open_call',
    vt: 'unknown', vils: [{ pos: 'BB', vt: 'unknown' }], agg: 0,
    hole: [C('9h'), C('9d')], flop: [C('Ks'), C('7d'), C('2c')], turn: [], river: [],
    board: [C('Ks'), C('7d'), C('2c')],
    acts: [{ v: 'check', vs: 0, m: 'check', ms: 0 }, {}, {}],
  });
  DB.set('hstyle', 'tight');
  const rt = analyze(mk()).streets[0];
  DB.set('hstyle', 'loose');
  const rl = analyze(mk()).streets[0];
  // 승률은 몬테카를로라 표본만큼 흔들린다. 스타일이 승률을 «바꾸는» 수준인지만 본다.
  ok(Math.abs(rt.eq - rl.eq) < 0.02,
    '승률 자체는 스타일과 무관하다 (계산이지 취향이 아니다)',
    `타이트 ${(rt.eq * 100).toFixed(1)}% vs 넓게 ${(rl.eq * 100).toFixed(1)}%`);
  const aggr = (r) => /벳|레이즈/.test(r.rec);
  ok(!(aggr(rt) && !aggr(rl)) , `같은 스팟에서 타이트가 더 공격적이면 안 된다 (타이트 "${rt.rec}" / 넓게 "${rl.rec}")`);

  // 프리플랍 권장: 타이트에서 더 자주 접는다
  const pfWith = (st, hole) => {
    DB.set('hstyle', st);
    const inp = Object.assign(mk(), { hole: hole.map(C), pf: 'pf_only', flop: [], board: [] });
    return analyze(inp).pf;
  };
  const marginal = ['9h', '7d'];   // 97o — BTN 표준 레인지 언저리
  const pt = pfWith('tight', marginal), pl = pfWith('loose', marginal);
  ok(pt.openPct < pl.openPct, `타이트가 오픈 기준을 좁게 잡는다 (${pt.openPct}% vs ${pl.openPct}%)`);
  ok(pt.style === 'tight' && pl.style === 'loose', '결과에 어떤 스타일로 계산했는지 실린다');
  ok(pt.openStd === OPEN_PCT.BTN, '표준값도 함께 실어 비교할 수 있다');

  DB.set('hstyle', 'tight');
}

/* ───────────────── 상금 사다리 (몬스터 리그) ───────────────── */
group('상금 사다리');
{
  const { tdNew, tdLadderPrize, tdLadderBands, tdUnits, tdPool, tdGross, tdLadder, TSTRUCT, LADDER_DEF } = app;
  ok(LADDER_DEF.free === 8 && LADDER_DEF.every === 7 && LADDER_DEF.amt === 100000,
    '기본값 — 8개까지 0원, 7개마다 10만원',
    JSON.stringify(LADDER_DEF));

  ctx.__APP.TD = Object.assign(tdNew(), { ladderOn: true, entries: 9, rebuys: 0 });

  // 엔트리 + 리바이 «합계» 로 센다
  ok(tdUnits() === 9, '엔트리 9 + 리바이 0 = 9개', String(tdUnits()));
  ctx.__APP.TD.rebuys = 12;
  ok(tdUnits() === 21, '엔트리 9 + 리바이 12 = 21개', String(tdUnits()));

  // 사다리 값
  const cases = [[0, 0], [1, 0], [7, 0], [8, 0], [9, 1], [13, 1], [14, 2], [20, 2], [21, 3], [27, 3], [28, 4], [70, 10]];
  for (const [u, mul] of cases)
    okNear(tdLadderPrize(u), mul * 100000, `${u}개 → ${mul * 10}만원`);

  // 8개 이하는 사다리를 아예 적용하지 않는다
  ok(tdLadderPrize(8) === 0 && tdLadderPrize(9) === 100000,
    '8개까지 0원, 9개부터 10만원');

  // 사다리를 켜면 모인 돈 비율은 안 본다
  ctx.__APP.TD.entries = 9; ctx.__APP.TD.rebuys = 12;   // 21개
  const gross = tdGross();
  ok(gross > 0, `모인 돈이 있다 (${gross}원)`);
  okNear(tdPool(), 300000, '사다리 켜짐: 21개 → 상금 30만원 (모인 돈과 무관)');
  ctx.__APP.TD.poolPct = 50;
  okNear(tdPool(), 300000, '사다리 켜짐: 비율을 바꿔도 상금은 그대로');
  ctx.__APP.TD.ladderOn = false;
  okNear(tdPool(), Math.floor(gross * 0.5 / 1000) * 1000, '사다리 끄면 다시 비율로 계산한다');
  ctx.__APP.TD.ladderOn = true; ctx.__APP.TD.poolPct = 100;

  // 구간표
  const bands = tdLadderBands(30);
  ok(bands[0].from === 0 && bands[0].to === 8 && bands[0].amt === 0, '첫 구간은 0~8개 0원',
    JSON.stringify(bands[0]));
  ok(bands[1].from === 9 && bands[1].to === 13 && bands[1].amt === 100000, '다음 구간은 9~13개 10만원',
    JSON.stringify(bands[1]));
  let mono = true;
  for (let i = 1; i < bands.length; i++) {
    if (bands[i].amt < bands[i - 1].amt) mono = false;
    if (bands[i].from !== bands[i - 1].to + 1) mono = false;   // 빈틈 없이 이어져야 한다
  }
  ok(mono, '구간이 빈틈 없이 이어지고 금액이 줄지 않는다',
    bands.map((b) => `${b.from}~${b.to}:${b.amt / 10000}만`).join(' '));
  ok(bands[bands.length - 1].last === true, '마지막 구간에 표시가 있다');

  // 숫자를 바꾸면 따라간다
  ctx.__APP.TD.ladderFree = 0; ctx.__APP.TD.ladderEvery = 10; ctx.__APP.TD.ladderAmt = 50000;
  okNear(tdLadderPrize(10), 50000, '설정을 바꾸면 사다리도 바뀐다 (10개마다 5만원)');
  okNear(tdLadderPrize(25), 100000, '25개 → 2묶음 → 10만원');
  ok(tdLadder().every >= 1, '묶음 크기는 1 미만이 될 수 없다');
  ctx.__APP.TD.ladderEvery = 0;
  ok(tdLadder().every === 1, '0 을 넣어도 1 로 막는다');
  ctx.__APP.TD.ladderFree = LADDER_DEF.free;
  ctx.__APP.TD.ladderEvery = LADDER_DEF.every;
  ctx.__APP.TD.ladderAmt = LADDER_DEF.amt;

  // 상금 사다리 키가 블라인드 사다리(ladder)와 겹치면 blindsAt 이 오작동한다
  for (const t of TSTRUCT) {
    if (t.prizeLadder) ok(!t.ladder || Array.isArray(t.ladder),
      `${t.n}: 상금 사다리가 블라인드 사다리 자리를 침범하지 않는다`);
  }

  // 데일리 셈법 — 언제나 엔트리 + 리바이 합계
  ctx.__APP.TD.ladderFree = 0; ctx.__APP.TD.ladderEvery = 3; ctx.__APP.TD.ladderAmt = 10000;
  ctx.__APP.TD.entries = 12; ctx.__APP.TD.rebuys = 6;
  ok(tdUnits() === 18, '엔트리 12 + 리바이 6 = 18개', String(tdUnits()));
  okNear(tdPool(), 60000, '3개당 1만원 · 18개 → 6만원');
  ctx.__APP.TD.rebuys = 0;
  ok(tdUnits() === 12, '리바이가 줄면 개수도 준다', String(tdUnits()));
  okNear(tdPool(), 40000, '3개당 1만원 · 12개 → 4만원');
  // 리바이를 빼고 세는 길은 아예 없어야 한다 (매장 규칙이 항상 합산이다)
  ctx.__APP.TD.ladderBasis = 'entry';
  ctx.__APP.TD.rebuys = 6;
  ok(tdUnits() === 18, '엉뚱한 설정이 남아 있어도 합산으로만 센다', String(tdUnits()));
  delete ctx.__APP.TD.ladderBasis;
  ctx.__APP.TD.ladderFree = LADDER_DEF.free;
  ctx.__APP.TD.ladderEvery = LADDER_DEF.every;
  ctx.__APP.TD.ladderAmt = LADDER_DEF.amt;

  // 데일리 프리셋 — 3개당 1만원, 면제 없음
  const dy = TSTRUCT.find((t) => t.id === 'f9_daily');
  ok(!!dy && !!dy.prizeLadder, '데일리에도 상금 사다리가 붙어 있다');
  if (dy && dy.prizeLadder) {
    ok(dy.prizeLadder.every === 3 && dy.prizeLadder.amt === 10000, '데일리는 3개당 1만원',
      JSON.stringify(dy.prizeLadder));
    ok(dy.prizeLadder.free === 0, '데일리는 면제 개수가 없다', String(dy.prizeLadder.free));
    ok(/엔트리\+리바이 합계/.test(dy.note), 'note 에 합산해서 센다고 적혀 있다', dy.note.slice(0, 90));
  }

  // 프리셋
  const lg = TSTRUCT.find((t) => t.id === 'f9_league');
  ok(!!lg, '몬스터 리그 프리셋이 있다');
  if (lg) {
    ok(/리그/.test(lg.n), '이름에 리그가 들어간다', lg.n);
    ok(lg.prizeLadder && lg.prizeLadder.free === 8 && lg.prizeLadder.every === 7 && lg.prizeLadder.amt === 100000,
      '프리셋에 상금 사다리 값이 담겨 있다', JSON.stringify(lg.prizeLadder));
    ok(lg.grp === 'pub', '국내 홀덤펍 묶음에 들어간다');
    ok(/확인:/.test(lg.note) && /추정/.test(lg.note), 'note 에 확인·추정 구분이 있다');
    ok(lg.buyin === 30000, '바이인은 몬스터와 같은 3만원', String(lg.buyin));
  }
  ctx.__APP.TD = null;
}

/* ───────────────── 대회 프로필 · 주간 일정 ───────────────── */
group('대회 프로필');
{
  const { tdProfiles, tdProfilesSet, tdProfileFrom, tdProfileApply, tdWeek, tdMinOfDay, tdNew, buildLevels, TSTRUCT, DAYN } = app;
  ok(Array.isArray(DAYN) && DAYN.length === 7 && DAYN[0] === '일', '요일 이름 7개, 일요일부터');

  okNear(tdMinOfDay('19:30'), 19 * 60 + 30, '시각 → 분 변환');
  okNear(tdMinOfDay('00:00'), 0, '자정 = 0분');
  ok(tdMinOfDay('') > 24 * 60, '시각이 없으면 맨 뒤로 정렬');
  ok(tdMinOfDay('말도 안 되는 값') > 24 * 60, '엉뚱한 시각도 맨 뒤로');

  // 현재 대회를 세워 프로필로 굳혔다가 되살린다
  ctx.__APP.TD = tdNew();
  const D = ctx.__APP.TD;
  const st = TSTRUCT.find((t) => t.id === 'f9_daily');
  D.levels = buildLevels(st, 12, 4, 10);
  D.buyin = 10000; D.startStack = 2000000; D.rebuyPrice = 10000; D.rebuyStack = 3000000;
  D.payN = 9; D.pay = app.payoutPct(9, 1); D.payCurve = 1; D.poolPct = 90; D.payShow = 5;

  const P = tdProfileFrom(D, '금요일 몬스터', [5, 1], '19:30', '메모');
  ok(P.n === '금요일 몬스터', '프로필 이름 저장');
  ok(JSON.stringify(P.days) === '[1,5]', '요일이 정렬돼 저장', JSON.stringify(P.days));
  ok(P.time === '19:30', '시각 저장');
  ok(P.buyin === 10000 && P.startStack === 2000000, '바이인·스택 저장');
  ok(Array.isArray(P.levels) && P.levels.length === D.levels.length, '레벨표 저장');
  ok(P.levels !== D.levels, '레벨표가 깊은 복사 (원본과 공유하지 않음)');
  ok(P.remain === undefined && P.running === undefined, '진행 상태는 담지 않음');
  ok(typeof P.id === 'string' && P.id.length > 1, '고유 id 부여');
  const P2 = tdProfileFrom(D, 'x', [], '', '');
  ok(P2.id !== P.id, '연달아 만들어도 id 가 겹치지 않음');
  ok(P2.time === '', '시각이 비면 빈 문자열');
  const P3 = tdProfileFrom(D, '', null, '25:99', '');
  ok(P3.n.length > 0, '이름이 비면 대회명으로 채움');
  ok(JSON.stringify(P3.days) === '[]', 'days 가 배열이 아니면 빈 배열');
  ok(P3.time === '', '말이 안 되는 시각은 버림');

  // 저장 → 주간 표
  tdProfilesSet([P, Object.assign({}, P2, { n: '수요일 데일리', days: [3], time: '20:00' })]);
  ok(tdProfiles().length === 2, '프로필 2개 저장');
  const wk = tdWeek();
  ok(wk.length === 7, '주간 표가 7칸');
  ok(wk[1].length === 1 && wk[1][0].n === '금요일 몬스터', '월요일 칸에 배치');
  ok(wk[5].length === 1, '금요일 칸에도 같은 대회 배치(요일 복수 선택)');
  ok(wk[3].length === 1 && wk[3][0].n === '수요일 데일리', '수요일 칸 배치');
  ok(wk[0].length === 0 && wk[2].length === 0, '지정 안 한 요일은 비어 있음');

  // 같은 요일 안에서는 시각순
  tdProfilesSet([
    Object.assign({}, P, { id: 'a', n: '늦은 대회', days: [2], time: '22:00' }),
    Object.assign({}, P, { id: 'b', n: '이른 대회', days: [2], time: '13:00' }),
    Object.assign({}, P, { id: 'c', n: '시각 미정', days: [2], time: '' }),
  ]);
  const tue = tdWeek()[2];
  ok(tue.map((x) => x.n).join(',') === '이른 대회,늦은 대회,시각 미정',
    '같은 요일은 시각순, 미정은 맨 뒤', tue.map((x) => x.n).join(','));

  // 불러오면 설정은 오고 진행 상태는 초기화된다
  ctx.__APP.TD.started = true; ctx.__APP.TD.running = true; ctx.__APP.TD.lvl = 5; ctx.__APP.TD.players = 42;
  tdProfileApply(P);
  const T = ctx.__APP.TD;
  ok(T.buyin === 10000 && T.startStack === 2000000, '불러오기: 바이인·스택 복원');
  ok(T.levels.length === P.levels.length, '불러오기: 레벨표 복원');
  ok(T.levels !== P.levels, '불러오기: 레벨표가 프로필과 공유되지 않음');
  ok(T.started === false && T.running === false, '불러오기: 진행 상태 초기화');
  ok(T.lvl === 0, '불러오기: 1레벨부터');
  ok(T.remain === (T.levels[0].min || 1) * 60000, '불러오기: 남은 시간이 1레벨 길이');
  ok(T.payManual === false, '불러오기: 상금 수동 편집 해제');

  // 저장 한도
  tdProfilesSet(new Array(100).fill(0).map((_, i) => Object.assign({}, P, { id: 'z' + i })));
  ok(tdProfiles().length === 60, `저장 한도 60개로 잘림 (실제 ${tdProfiles().length})`);
  tdProfilesSet([]);
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

/* ───────────────── 저장소 · 백업 ───────────────── */
group('저장소 · 백업');
{
  const { DB, hbDump, hbRestore, LEARN_KEYS, TOUR_KEYS } = app;
  ok(!!DB, 'DB 래퍼 존재');
  if (DB) {
    DB.set('__t', { a: 1 });
    ok(JSON.stringify(DB.get('__t', null)) === '{"a":1}', 'set/get 왕복');
    ok(ctx.localStorage.getItem('hb.__t') === '{"a":1}', 'hb. 접두사로 저장');
    DB.del('__t');
    ok(DB.get('__t', 'gone') === 'gone', 'del 후 기본값 반환');
  }

  // 백업이 실제로 쓰이는 키를 전부 담는지 — 소스에서 DB.set(...) 키를 긁어 대조한다.
  // v3.1 까지 quizans·drillaxis 가 백업에서 빠져 있었고, 그래서 이 검사를 둔다.
  const src = require('fs').readFileSync(FILE, 'utf8');
  const used = new Set();
  for (const m of src.matchAll(/DB\.set\(\s*"([a-zA-Z0-9_]+)"/g)) used.add(m[1]);
  ok(used.size >= 12, `DB.set 으로 쓰는 키를 찾았다 (${used.size}개)`);

  ctx.localStorage.clear();
  for (const k of used) DB.set(k, { probe: k });
  const dump = hbDump();
  const missing = [...used].filter((k) => !(k in dump));
  ok(missing.length === 0, '백업이 모든 저장 키를 담는다', '빠진 키: ' + missing.join(', '));

  // 왕복
  ctx.localStorage.clear();
  const n = hbRestore({ v: 5, at: 1, app: '4.0', data: dump });
  ok(n === Object.keys(dump).length, `복원 개수 일치 (${n})`);
  const back = hbDump();
  ok(JSON.stringify(back) === JSON.stringify(dump), '내보내기 → 불러오기 왕복이 같다');

  // 예전 형식(v4 이하: 최상위에 키가 흩어져 있음)도 받아야 한다
  ctx.localStorage.clear();
  const n4 = hbRestore({ profile: { x: 1 }, hands: [1, 2], logo: 'data:,', v: 4 });
  ok(n4 === 3, `v4 형식 3개 복원 (실제 ${n4})`);
  ok(DB.get('profile', null) && DB.get('profile', {}).x === 1, 'v4 형식에서 profile 복원');
  ok(DB.get('v', 'none') === 'none', 'v4 의 버전 필드는 키로 저장하지 않는다');

  // 엉뚱한 입력에 죽지 않는다
  ok(hbRestore(null) === 0, 'null 을 넣어도 0 을 돌려준다');
  ok(hbRestore('문자열') === 0, '문자열을 넣어도 0');
  ctx.localStorage.clear();
  ok(hbRestore({ data: null, profile: { x: 1 }, v: 5 }) === 1,
    'data 가 비어 있으면 예전 형식으로 보고 최상위 키를 읽는다');
  ok(hbRestore({ v: 5, data: {} }) === 0, '빈 백업은 아무것도 덮어쓰지 않는다');

  // 초기화 범위가 모든 키를 빠짐없이, 겹치지 않게 나누는지
  const covered = new Set([...LEARN_KEYS, ...TOUR_KEYS]);
  const uncovered = [...used].filter((k) => !covered.has(k) && k !== 'theme');
  ok(uncovered.length === 0, '초기화 두 갈래가 모든 키를 덮는다(테마 제외)', '안 덮인 키: ' + uncovered.join(', '));
  const overlap = LEARN_KEYS.filter((k) => TOUR_KEYS.includes(k));
  ok(overlap.length === 0, '학습/대회 초기화 범위가 겹치지 않는다', overlap.join(', '));
  ok(LEARN_KEYS.includes('quizans') && LEARN_KEYS.includes('drillaxis'),
    '학습 초기화가 답한 문항·드릴 성향까지 지운다');
  ctx.localStorage.clear();
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
