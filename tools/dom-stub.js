'use strict';
// 단일 HTML 앱을 Node vm 안에서 돌리기 위한 최소 DOM 스텁.
// 목적은 렌더링 재현이 아니라, 최상위 초기화 코드가 던지지 않고 통과해서
// 순수 계산 함수들이 전역에 정의되게 만드는 것뿐이다. 화면 검증은 tools/check-ui.mjs 가 실제 Chromium 으로 한다.

function makeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(String(k)); },
    clear: () => map.clear(),
    _dump: () => Object.fromEntries(map),
  };
}

// 어떤 속성 접근/호출에도 죽지 않는 element 스텁.
// 실제 속성은 own 프로퍼티에 두고, 모르는 이름은 Proxy 가 no-op 함수 겸 element 로 만들어 준다.
function makeEl(tag = 'div') {
  const self = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    id: '',
    className: '',
    value: '',
    checked: false,
    disabled: false,
    selected: false,
    textContent: '',
    innerText: '',
    innerHTML: '',
    outerHTML: '',
    href: '',
    src: '',
    width: 0,
    height: 0,
    scrollWidth: 0,
    scrollHeight: 0,
    clientWidth: 0,
    clientHeight: 0,
    offsetWidth: 0,
    offsetHeight: 0,
    children: [],
    childNodes: [],
    options: [],
    files: [],
    parentNode: null,
    parentElement: null,
    firstChild: null,
    lastChild: null,
    nextSibling: null,
    previousSibling: null,
    dataset: {},
    style: {
      setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; },
    },
    classList: {
      _set: new Set(),
      add(...c) { c.forEach((x) => this._set.add(x)); },
      remove(...c) { c.forEach((x) => this._set.delete(x)); },
      toggle(c, force) {
        const on = force === undefined ? !this._set.has(c) : !!force;
        if (on) this._set.add(c); else this._set.delete(c);
        return on;
      },
      contains(c) { return this._set.has(c); },
      replace(a, b) { this._set.delete(a); this._set.add(b); },
    },
    attributes: {},
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(self.attributes, n) ? self.attributes[n] : null; },
    setAttribute(n, v) { self.attributes[n] = String(v); },
    removeAttribute(n) { delete self.attributes[n]; },
    hasAttribute(n) { return Object.prototype.hasOwnProperty.call(self.attributes, n); },
    appendChild(c) { self.children.push(c); self.childNodes.push(c); if (c) { c.parentNode = self; c.parentElement = self; } return c; },
    append(...cs) { cs.forEach((c) => self.appendChild(c)); },
    prepend(...cs) { cs.forEach((c) => { self.children.unshift(c); self.childNodes.unshift(c); }); },
    insertBefore(c) { return self.appendChild(c); },
    removeChild(c) {
      const i = self.children.indexOf(c);
      if (i >= 0) { self.children.splice(i, 1); self.childNodes.splice(i, 1); }
      return c;
    },
    remove() {},
    replaceChildren(...cs) { self.children = [...cs]; self.childNodes = [...cs]; },
    insertAdjacentHTML() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return makeList([]); },
    getElementsByTagName() { return makeList([]); },
    getElementsByClassName() { return makeList([]); },
    closest() { return makeEl(); },
    matches() { return false; },
    contains() { return false; },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    click() {},
    focus() {},
    blur() {},
    scrollIntoView() {},
    getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    getContext() { return makeCanvasCtx(); },
    toDataURL() { return 'data:,'; },
    play() { return Promise.resolve(); },
    pause() {},
    submit() {},
    reset() {},
    select() {},
    setSelectionRange() {},
    cloneNode() { return makeEl(tag); },
  };

  return new Proxy(self, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      // 모르는 이름 → 호출해도 되고 속성 접근해도 되는 만능 no-op
      const noop = function () { return makeEl(); };
      return new Proxy(noop, {
        get(_, kk) { return kk === 'then' ? undefined : makeEl()[kk]; },
        apply() { return undefined; },
      });
    },
    set(t, k, v) { t[k] = v; return true; },
    has() { return true; },
  });
}

function makeList(arr) {
  const list = arr.slice();
  list.item = (i) => list[i] ?? null;
  list.namedItem = () => null;
  return list;
}

function makeCanvasCtx() {
  return new Proxy(
    { canvas: { width: 0, height: 0 }, measureText: () => ({ width: 0 }), getImageData: () => ({ data: [] }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) },
    { get(t, k) { return k in t ? t[k] : () => {}; }, set(t, k, v) { t[k] = v; return true; } }
  );
}

function makeDocument() {
  const byId = new Map();
  const doc = {
    nodeType: 9,
    readyState: 'complete',
    title: '',
    cookie: '',
    documentElement: makeEl('html'),
    head: makeEl('head'),
    body: makeEl('body'),
    _listeners: new Map(),
    // 같은 id 를 두 번 부르면 같은 객체가 나와야 앱 상태가 자연스럽게 유지된다
    getElementById(id) {
      if (!byId.has(id)) { const el = makeEl(); el.id = id; byId.set(id, el); }
      return byId.get(id);
    },
    querySelector(sel) {
      const m = /^#([\w-]+)$/.exec(String(sel));
      return m ? doc.getElementById(m[1]) : makeEl();
    },
    querySelectorAll() { return makeList([]); },
    getElementsByTagName() { return makeList([]); },
    getElementsByClassName() { return makeList([]); },
    getElementsByName() { return makeList([]); },
    createElement(tag) { return makeEl(tag); },
    createElementNS(_, tag) { return makeEl(tag); },
    createTextNode(t) { const el = makeEl('#text'); el.textContent = String(t); return el; },
    createDocumentFragment() { return makeEl('#fragment'); },
    createRange() { return makeEl('#range'); },
    addEventListener(type, fn) {
      if (!doc._listeners.has(type)) doc._listeners.set(type, []);
      doc._listeners.set(type, [...doc._listeners.get(type), fn]);
    },
    removeEventListener() {},
    dispatchEvent() { return true; },
    execCommand() { return true; },
    write() {}, writeln() {}, open() {}, close() {},
    _fire(type) {
      for (const fn of doc._listeners.get(type) || []) {
        try { fn({ type, target: doc, preventDefault() {}, stopPropagation() {} }); } catch (e) { doc._lastError = e; }
      }
    },
    _ids: byId,
  };
  return doc;
}

/** vm.createContext 에 넣을 sandbox 를 만든다. */
function makeSandbox({ seed = 12345 } = {}) {
  const document = makeDocument();
  const localStorage = makeStorage();

  // 몬테카를로 재현성을 위한 시드 고정 RNG (mulberry32)
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const win = {
    document,
    localStorage,
    sessionStorage: makeStorage(),
    location: { href: 'http://localhost:8777/index.html', hash: '', search: '', pathname: '/index.html', origin: 'http://localhost:8777', reload() {}, assign() {}, replace() {} },
    navigator: { userAgent: 'node-vm', language: 'ko-KR', languages: ['ko-KR'], clipboard: { writeText: () => Promise.resolve() }, onLine: true },
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1080 },
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    queueMicrotask,
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
    cancelAnimationFrame: clearTimeout,
    performance: { now: () => Date.now() },
    crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(rng() * 256); return a; }, randomUUID: () => 'x'.repeat(8) },
    Math: Object.create(Math, { random: { value: rng, writable: true, configurable: true } }),
    alert() {}, confirm: () => true, prompt: () => null,
    open: () => makeEl(),
    print() {},
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => new Proxy({ getPropertyValue: () => '' }, { get(t, k) { return k in t ? t[k] : ''; } }),
    addEventListener(type, fn) { document.addEventListener(type, fn); },
    removeEventListener() {},
    dispatchEvent() { return true; },
    scrollTo() {}, scrollBy() {},
    fetch: () => Promise.reject(new Error('네트워크 호출은 vm 검증에서 차단됨')),
    BroadcastChannel: class { constructor(n) { this.name = n; } postMessage() {} close() {} addEventListener() {} },
    Worker: class { postMessage() {} terminate() {} addEventListener() {} },
    URL, URLSearchParams, Blob: class { constructor(p) { this.parts = p; } },
    Intl, TextEncoder, TextDecoder,
    structuredClone,
    _domStubError: null,
  };

  win.window = win;
  win.self = win;
  win.globalThis = win;
  win.top = win;
  win.parent = win;
  win.frames = win;
  return win;
}

module.exports = { makeSandbox, makeEl, makeDocument, makeStorage };
