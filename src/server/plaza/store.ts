/**
 * 쫄탐광장 저장소 — Redis 명령 몇 개를 두 가지로 돌린다 (2026-11-26).
 *
 *  - Upstash Redis REST: 환경변수가 있으면. 한 번에 여러 명령을 /pipeline 으로 보낸다.
 *    바깥 호출 규칙(AGENTS.md 3절)대로 fetchJson 을 거친다. 쓰기가 섞인 묶음은 재시도하지 않는다 —
 *    두 번 가면 두 번 적힌다.
 *  - 메모리: 없으면. 서버(인스턴스)가 다시 뜨면 사라진다. 그래서 화면이 '오래 남지 않는다' 고 알린다.
 *
 * 새 npm 의존성을 넣지 않는다는 규칙(AGENTS.md 4절) 때문에 클라이언트 라이브러리 대신
 * 쓰는 명령만 여기서 흉내 낸다. 두 쪽이 같은 모양의 답을 돌려주는지는 검증기가 본다.
 */

import { fetchJson } from '@/server/http';
import { getPlazaStoreConfig } from '@/server/config';

export type Cmd = (string | number)[];
export type Reply = string | number | null | Reply[];

export interface PlazaStore {
  kind: 'memory' | 'redis';
  /** 명령 묶음을 차례대로 실행하고 답을 같은 순서로 돌려준다 */
  exec(cmds: Cmd[], opts?: { write?: boolean }): Promise<Reply[]>;
}

/* ------------------------------ 메모리 ------------------------------ */

type Val = string | Map<string, string> | Set<string> | string[] | Map<string, number>;
interface Slot { v: Val; exp: number | null; kind: 'str' | 'hash' | 'set' | 'list' | 'zset' }

const num = (x: unknown) => Number(x);
const str = (x: unknown) => String(x);

export class MemoryStore implements PlazaStore {
  kind = 'memory' as const;
  private data = new Map<string, Slot>();

  private get(key: string): Slot | null {
    const s = this.data.get(key);
    if (!s) return null;
    if (s.exp !== null && s.exp <= Date.now()) {
      this.data.delete(key);
      return null;
    }
    return s;
  }

  private ensure<K extends Slot['kind']>(key: string, kind: K, make: () => Val): Slot {
    const s = this.get(key);
    if (s) {
      if (s.kind !== kind) throw new Error(`WRONGTYPE ${key}`);
      return s;
    }
    const slot: Slot = { v: make(), exp: null, kind };
    this.data.set(key, slot);
    return slot;
  }

  async exec(cmds: Cmd[]): Promise<Reply[]> {
    return cmds.map((c) => this.one(c));
  }

  private one(c: Cmd): Reply {
    const op = str(c[0]).toUpperCase();
    const key = str(c[1]);
    switch (op) {
      case 'GET': {
        const s = this.get(key);
        return s && s.kind === 'str' ? (s.v as string) : null;
      }
      case 'SET': {
        const flags = c.slice(3).map((x) => str(x).toUpperCase());
        if (flags.includes('NX') && this.get(key)) return null;
        const exIdx = flags.indexOf('EX');
        const exp = exIdx >= 0 ? Date.now() + num(c[3 + exIdx + 1]) * 1000 : null;
        this.data.set(key, { v: str(c[2]), exp, kind: 'str' });
        return 'OK';
      }
      case 'DEL': {
        let n = 0;
        for (const k of c.slice(1)) if (this.data.delete(str(k))) n += 1;
        return n;
      }
      case 'INCR':
      case 'INCRBY': {
        const s = this.get(key);
        const by = op === 'INCR' ? 1 : num(c[2]);
        const next = (s ? num(s.v) : 0) + by;
        this.data.set(key, { v: String(next), exp: s?.exp ?? null, kind: 'str' });
        return next;
      }
      case 'EXPIRE': {
        const s = this.get(key);
        if (!s) return 0;
        s.exp = Date.now() + num(c[2]) * 1000;
        return 1;
      }
      case 'HSET': {
        const h = this.ensure(key, 'hash', () => new Map<string, string>()).v as Map<string, string>;
        let added = 0;
        for (let i = 2; i + 1 < c.length; i += 2) {
          if (!h.has(str(c[i]))) added += 1;
          h.set(str(c[i]), str(c[i + 1]));
        }
        return added;
      }
      case 'HGET': {
        const s = this.get(key);
        return s ? ((s.v as Map<string, string>).get(str(c[2])) ?? null) : null;
      }
      case 'HMGET': {
        const s = this.get(key);
        return c.slice(2).map((f) => (s ? ((s.v as Map<string, string>).get(str(f)) ?? null) : null));
      }
      case 'HGETALL': {
        const s = this.get(key);
        if (!s) return [];
        return [...(s.v as Map<string, string>)].flat();
      }
      case 'HINCRBY': {
        const h = this.ensure(key, 'hash', () => new Map<string, string>()).v as Map<string, string>;
        const next = num(h.get(str(c[2])) ?? 0) + num(c[3]);
        h.set(str(c[2]), String(next));
        return next;
      }
      case 'HDEL': {
        const s = this.get(key);
        if (!s) return 0;
        let n = 0;
        for (const f of c.slice(2)) if ((s.v as Map<string, string>).delete(str(f))) n += 1;
        return n;
      }
      case 'SADD': {
        const set = this.ensure(key, 'set', () => new Set<string>()).v as Set<string>;
        let n = 0;
        for (const m of c.slice(2)) if (!set.has(str(m))) { set.add(str(m)); n += 1; }
        return n;
      }
      case 'SREM': {
        const s = this.get(key);
        if (!s) return 0;
        let n = 0;
        for (const m of c.slice(2)) if ((s.v as Set<string>).delete(str(m))) n += 1;
        return n;
      }
      case 'SMEMBERS': {
        const s = this.get(key);
        return s ? [...(s.v as Set<string>)] : [];
      }
      case 'SCARD': {
        const s = this.get(key);
        return s ? (s.v as Set<string>).size : 0;
      }
      case 'LPUSH': {
        const l = this.ensure(key, 'list', () => [] as string[]).v as string[];
        for (const m of c.slice(2)) l.unshift(str(m));
        return l.length;
      }
      case 'LRANGE': {
        const s = this.get(key);
        if (!s) return [];
        const l = s.v as string[];
        const a = num(c[2]);
        const b = num(c[3]);
        return l.slice(a < 0 ? Math.max(0, l.length + a) : a, b < 0 ? l.length + b + 1 : b + 1);
      }
      case 'LTRIM': {
        const s = this.get(key);
        if (!s) return 'OK';
        const l = s.v as string[];
        const a = num(c[2]);
        const b = num(c[3]);
        s.v = l.slice(a, b < 0 ? l.length + b + 1 : b + 1);
        return 'OK';
      }
      case 'LREM': {
        const s = this.get(key);
        if (!s) return 0;
        const l = s.v as string[];
        const before = l.length;
        s.v = l.filter((x) => x !== str(c[3]));
        return before - (s.v as string[]).length;
      }
      case 'ZADD': {
        const z = this.ensure(key, 'zset', () => new Map<string, number>()).v as Map<string, number>;
        let added = 0;
        for (let i = 2; i + 1 < c.length; i += 2) {
          if (!z.has(str(c[i + 1]))) added += 1;
          z.set(str(c[i + 1]), num(c[i]));
        }
        return added;
      }
      case 'ZREM': {
        const s = this.get(key);
        if (!s) return 0;
        let n = 0;
        for (const m of c.slice(2)) if ((s.v as Map<string, number>).delete(str(m))) n += 1;
        return n;
      }
      case 'ZCARD': {
        const s = this.get(key);
        return s ? (s.v as Map<string, number>).size : 0;
      }
      case 'ZSCORE': {
        const s = this.get(key);
        const v = s ? (s.v as Map<string, number>).get(str(c[2])) : undefined;
        return v === undefined ? null : String(v);
      }
      case 'ZREVRANGE':
      case 'ZREVRANK': {
        const s = this.get(key);
        const sorted = s
          ? [...(s.v as Map<string, number>)].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
          : [];
        if (op === 'ZREVRANK') {
          const i = sorted.findIndex(([m]) => m === str(c[2]));
          return i < 0 ? null : i;
        }
        const a = num(c[2]);
        const b = num(c[3]);
        const part = sorted.slice(a, b < 0 ? sorted.length + b + 1 : b + 1);
        return str(c[4] ?? '').toUpperCase() === 'WITHSCORES' ? part.flatMap(([m, sc]) => [m, String(sc)]) : part.map(([m]) => m);
      }
      default:
        throw new Error(`메모리 저장소가 모르는 명령: ${op}`);
    }
  }
}

/* ------------------------------ Upstash REST ------------------------------ */

export class UpstashStore implements PlazaStore {
  kind = 'redis' as const;
  constructor(private url: string, private token: string) {}

  async exec(cmds: Cmd[], opts: { write?: boolean } = {}): Promise<Reply[]> {
    if (!cmds.length) return [];
    const res = await fetchJson<{ result?: Reply; error?: string }[]>(`${this.url}/pipeline`, {
      method: 'POST',
      body: JSON.stringify(cmds.map((c) => c.map(String))),
      headers: { authorization: `Bearer ${this.token}` },
      retries: opts.write ? 0 : 1,
      timeoutMs: 6000,
    });
    return res.map((r, i) => {
      if (r.error) throw new Error(`저장소 오류 (${String(cmds[i][0])}): ${r.error}`);
      return r.result ?? null;
    });
  }
}

/* ------------------------------ 고르기 ------------------------------ */

/*
 * 메모리 저장소는 globalThis 에 하나만 둔다. 모듈 변수에 두면 라우트마다(로그인 · 광장) 모듈 사본이
 * 따로 생길 수 있고, 개발 서버는 새 라우트를 컴파일할 때 모듈을 다시 읽는다 — 그러면 로그인한 회원이
 * 광장에서 사라지거나 글 순서가 뒤섞인다(실제로 겪었다).
 */
const G = globalThis as typeof globalThis & { __ztPlazaMemory?: MemoryStore };

export function getPlazaStore(): PlazaStore {
  const cfg = getPlazaStoreConfig();
  if (cfg) return new UpstashStore(cfg.url, cfg.token);
  G.__ztPlazaMemory ??= new MemoryStore();
  return G.__ztPlazaMemory;
}
