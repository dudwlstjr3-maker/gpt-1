'use strict';
// index.html 안의 인라인 <script> 를 뽑아 Node vm 컨텍스트에서 실행하고,
// 앱이 정의한 전역(함수·상수)을 그대로 돌려준다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeSandbox } = require('./dom-stub');

function extractScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;           // 외부 스크립트는 이 앱에 없다
    if (/type\s*=\s*["'](?!text\/javascript|module)/i.test(attrs)) continue; // 템플릿용 script 제외
    out.push({ code: m[2], index: m.index });
  }
  return out;
}

// 최상위 const/let/class 는 스크립트의 렉시컬 스코프에 머물러 sandbox 전역으로 안 올라온다.
// 선언 이름을 긁어 같은 스크립트 끝에 직접 eval 로 내보내는 에필로그를 붙인다(중첩 함수의 직접 eval 은 바깥 렉시컬 스코프를 본다).
function declaredNames(code) {
  const names = new Set();
  // function / class 선언
  const fn = /^(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = fn.exec(code)) !== null) names.add(m[1]);
  // const/let/var — `const A = 1, B = 2;` 처럼 선언자가 여럿인 줄도 잡는다
  const vd = /^(?:const|let|var)\s+([^;\n]*)/gm;
  while ((m = vd.exec(code)) !== null) {
    // 초기화식 안의 쉼표(함수 인자·객체·배열)를 건너뛰며 최상위 쉼표에서만 자른다
    const s = m[1];
    let depth = 0, start = 0;
    const parts = [];
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      else if (ch === ',' && depth === 0) { parts.push(s.slice(start, i)); start = i + 1; }
    }
    parts.push(s.slice(start));
    for (const p of parts) {
      const nm = /^\s*([A-Za-z_$][\w$]*)/.exec(p);
      if (nm) names.add(nm[1]);
    }
  }
  return [...names];
}

function exportEpilogue(code) {
  const names = declaredNames(code);
  if (!names.length) return '';
  return `\n;(function(){var __o=globalThis.__APP||(globalThis.__APP={});${names
    .map((n) => `try{__o[${JSON.stringify(n)}]=eval(${JSON.stringify(n)})}catch(e){}`)
    .join('')}})();\n`;
}

/**
 * @param {string} file index.html 경로
 * @param {{seed?:number, fireReady?:boolean, exportGlobals?:boolean}} opts
 * @returns {{ctx:object, app:object, scripts:number, errors:Error[], html:string}}
 */
function loadApp(file, opts = {}) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = extractScripts(html);
  if (scripts.length === 0) throw new Error('인라인 <script> 를 찾지 못했습니다: ' + file);

  const sandbox = makeSandbox({ seed: opts.seed ?? 12345 });
  const ctx = vm.createContext(sandbox);
  const errors = [];

  scripts.forEach((s, i) => {
    const lineOffset = html.slice(0, s.index).split('\n').length - 1;
    const code = s.code + (opts.exportGlobals === false ? '' : exportEpilogue(s.code));
    try {
      new vm.Script(code, { filename: path.basename(file) + `#script${i}`, lineOffset }).runInContext(ctx, { timeout: 30000 });
    } catch (e) {
      errors.push(e);
    }
  });

  if (opts.fireReady !== false) {
    try { ctx.document._fire('DOMContentLoaded'); } catch (e) { errors.push(e); }
    if (ctx.document._lastError) errors.push(ctx.document._lastError);
  }

  // 전역 함수 선언과 렉시컬 const 를 한 객체로 합쳐 준다
  const app = Object.assign(Object.create(null), ctx.__APP || {});
  for (const k of Object.getOwnPropertyNames(sandbox)) {
    if (!(k in app) && typeof sandbox[k] === 'function' && !/^[A-Z]/.test(k)) app[k] = sandbox[k];
  }

  return { ctx, app, scripts: scripts.length, errors, html };
}

module.exports = { loadApp, extractScripts, declaredNames };
