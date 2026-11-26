'use client';

/**
 * 쫄탐광장 (2026-11-26) — 다음 거래일 맞히기 · 순위표 · 한 줄 토론.
 *
 * 마크업과 CSS(src/app/plaza.css)는 미리보기(template.html viewPlaza)와 같다.
 * 문구는 src/lib/plazaText.mjs 한 곳 — 미리보기도 같은 파일을 쓴다.
 * 단추 말은 "오른다 / 내린다". 사고팔라는 말을 쓰지 않는다. 상금 · 실제 돈은 없다.
 */

import { useState } from 'react';
import { ModeBadge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/States';
import { usePlaza } from '@/components/plaza/usePlaza';
import {
  plazaAccuracy, plazaAgo, plazaChange, plazaCrowd, plazaDay, plazaKst, plazaPick, plazaRatingHelp, plazaResult, plazaSigned,
  PLAZA_FOOT, PLAZA_LEDE, PLAZA_MEMORY_NOTE, PLAZA_POST_NOTE,
} from '@/lib/plazaText.mjs';
import type { PlazaMarketRounds, PlazaPick, PlazaState } from '@/types';

export default function PlazaPage() {
  const { state, key, error, busy, loading, act, leave } = usePlaza();

  if (loading && !state) {
    return (
      <div className="space-y-3 px-3 pt-3">
        <SkeletonCard height={120} lines={2} />
        <SkeletonCard height={200} lines={3} />
      </div>
    );
  }
  if (!state) {
    return (
      <div className="plaza">
        <p className="pz-err" role="alert">{error ?? '광장을 불러오지 못했어요.'}</p>
      </div>
    );
  }

  return (
    <div className="plaza">
      <div>
        <div className="pz-head">
          <h1>쫄탐광장</h1>
          <ModeBadge mode={state.mode} size="xs" />
        </div>
        <p className="pz-lede">{PLAZA_LEDE}</p>
        {state.storage === 'memory' ? <p className="pz-note">{PLAZA_MEMORY_NOTE}</p> : null}
        {error ? (
          <p className="pz-err" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <Account state={state} plazaKey={key} busy={busy} act={act} leave={leave} />

      <section className="pz-sec" aria-labelledby="pz-game-title">
        <h2 id="pz-game-title">
          다음 거래일 맞히기 <small>장 시작 전까지 · 바꿀 수 있어요</small>
        </h2>
        <div className="pz-stack">
          {state.markets.map((m) => (
            <Round key={m.market} m={m} joined={!!state.me} busy={busy} act={act} />
          ))}
        </div>
      </section>

      <Leaderboard state={state} />

      <Posts state={state} busy={busy} act={act} />

      <p className="pz-foot">{PLAZA_FOOT}</p>
    </div>
  );
}

type Act = (body: Record<string, unknown>) => Promise<boolean>;

function Account({ state, plazaKey, busy, act, leave }: { state: PlazaState; plazaKey: string | null; busy: boolean; act: Act; leave: () => void }) {
  const [nick, setNick] = useState('');
  const [code, setCode] = useState('');
  const me = state.me;
  if (me) {
    return (
      <section className="pz-card" aria-label="내 기록">
        <div className="pz-me">
          <b>{me.nick}</b>
          <span className="pz-rating">레이팅 {me.rating.toLocaleString('ko-KR')}</span>
          <span>{me.rank ? `순위 ${me.rank}위` : `순위는 ${state.rules.minPlayed}판부터`}</span>
          <span>{plazaAccuracy(me.correct, me.played)}</span>
          {me.streak > 1 ? <span>연속 {me.streak}번 맞힘</span> : null}
        </div>
        <details className="pz-more">
          <summary>복구 코드 · 다른 기기에서 이어 하기 ▾</summary>
          <p className="pz-key">{plazaKey}</p>
          <p className="pz-hint">이 코드가 있으면 누구든 이 닉네임으로 참여할 수 있어요. 적어 두되 다른 곳에 올리지 마세요.</p>
          <button type="button" className="pz-btn" style={{ marginTop: 8 }} onClick={leave}>
            이 기기에서 나가기
          </button>
        </details>
      </section>
    );
  }
  return (
    <section className="pz-card" aria-labelledby="pz-join-title">
      <h2 id="pz-join-title" style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 750 }}>
        닉네임만 정하면 바로 참여
      </h2>
      <form
        className="pz-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ action: 'join', nickname: nick });
        }}
      >
        <input
          aria-label="닉네임"
          placeholder={`${state.rules.nickMin}~${state.rules.nickMax}자 (한글 · 영문 · 숫자)`}
          value={nick}
          maxLength={state.rules.nickMax}
          onChange={(e) => setNick(e.target.value)}
        />
        <button type="submit" className="pz-btn primary" disabled={busy || nick.trim().length < state.rules.nickMin}>
          참여하기
        </button>
      </form>
      <p className="pz-hint">가입 · 이메일 · 전화번호가 필요 없어요. 참여하면 복구 코드를 하나 드려요.</p>
      <details className="pz-more">
        <summary>복구 코드가 있어요 ▾</summary>
        <form
          className="pz-form"
          style={{ marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            void act({ action: 'restore', key: code });
          }}
        >
          <input aria-label="복구 코드" placeholder="ZT-XXXX-XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} />
          <button type="submit" className="pz-btn" disabled={busy || code.trim().length < 16}>
            불러오기
          </button>
        </form>
      </details>
    </section>
  );
}

function Round({ m, joined, busy, act }: { m: PlazaMarketRounds; joined: boolean; busy: boolean; act: Act }) {
  const o = m.open;
  const crowd = o.ups !== null && o.downs !== null ? plazaCrowd(o.ups, o.downs) : null;
  const pick = (p: PlazaPick) => void act({ action: 'predict', market: m.market, pick: p, date: o.date });
  return (
    <article className="pz-card" aria-label={`${m.name} ${plazaDay(o.date)} 맞히기`}>
      <div className="pz-round-head">
        <b>{m.name}</b>
        <span>
          {m.region} · {plazaDay(o.date)} 장
        </span>
      </div>
      <p className="pz-q">직전 거래일 종가보다 오를까요, 내릴까요?</p>
      <div className="pz-picks" role="group" aria-label={`${m.name} 고르기`}>
        {(['up', 'down'] as const).map((p) => (
          <button key={p} type="button" className="pz-pick" aria-pressed={o.myPick === p} disabled={!joined || busy} onClick={() => pick(p)}>
            {plazaPick(p)}
          </button>
        ))}
      </div>
      <p className="pz-meta">
        마감 {plazaKst(o.cutoff)} (한국시간) · {o.n.toLocaleString('ko-KR')}명 참여
        {!joined ? ' · 닉네임을 정하면 고를 수 있어요' : o.myPick ? '' : ' · 고르면 사람들 선택이 보여요'}
      </p>
      {crowd ? (
        <div className="pz-crowd" aria-label={`사람들 선택: 오른다 ${crowd.up}%, 내린다 ${crowd.down}%`}>
          <div className="pz-bar" aria-hidden="true">
            <i className="up" style={{ width: `${crowd.up}%` }} />
            <i className="down" style={{ width: `${crowd.down}%` }} />
          </div>
          <p>
            <span>▲ 오른다 {crowd.up}%</span>
            <span>▼ 내린다 {crowd.down}%</span>
          </p>
        </div>
      ) : null}
      {m.running ? (
        <p className="pz-running">
          {plazaDay(m.running.date)} 장 진행 중 — 결과는 {plazaKst(m.running.resolveAt)} 이후 · {m.running.n.toLocaleString('ko-KR')}명
          {m.running.myPick ? ` · 내 선택 ${plazaPick(m.running.myPick)}` : ''}
        </p>
      ) : null}
      {m.recent.length ? (
        <ul className="pz-recent" aria-label={`${m.name} 지난 결과`}>
          {m.recent.slice(0, 3).map((r) => {
            const hit = r.result === 'up' ? r.ups : r.result === 'down' ? r.downs : null;
            return (
              <li key={r.date}>
                <b>
                  {plazaDay(r.date)} {plazaResult(r.result)}
                  {r.changePct !== null ? ` ${plazaChange(r.changePct)}` : ''}
                </b>
                <span>
                  {hit !== null && r.n ? `맞힌 사람 ${Math.round((hit / r.n) * 100)}%` : `${r.n}명`}
                  {r.myPick ? ` · 나 ${plazaPick(r.myPick)} ${plazaSigned(r.myDelta ?? 0)}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}

function Leaderboard({ state }: { state: PlazaState }) {
  return (
    <section className="pz-sec" aria-labelledby="pz-lb-title">
      <h2 id="pz-lb-title">
        순위표 <small>레이팅 순 · {state.ranked.toLocaleString('ko-KR')}명</small>
      </h2>
      <div className="pz-card">
        {state.leaderboard.length ? (
          <table className="pz-table">
            <thead>
              <tr>
                <th scope="col">순위</th>
                <th scope="col">닉네임</th>
                <th scope="col">레이팅</th>
              </tr>
            </thead>
            <tbody>
              {state.leaderboard.map((l) => (
                <tr key={`${l.rank}-${l.nick}`} className={l.me ? 'me' : undefined}>
                  <td className="rank">{l.rank}</td>
                  <td>
                    {l.nick}
                    {l.example ? <span className="pz-tag">예시</span> : null}
                    {l.me ? <span className="pz-tag">나</span> : null}
                    <span className="acc">{plazaAccuracy(l.correct, l.played)}</span>
                  </td>
                  <td>{l.rating.toLocaleString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="pz-hint" style={{ margin: 0 }}>
            아직 순위에 오른 사람이 없어요. 결과가 {state.rules.minPlayed}판 이상 나면 올라요.
          </p>
        )}
        <details className="pz-more" style={{ marginTop: 8 }}>
          <summary>레이팅은 어떻게 오르나요? ▾</summary>
          <ul className="pz-hint pz-list">
            {plazaRatingHelp(state.rules).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}

function Posts({ state, busy, act }: { state: PlazaState; busy: boolean; act: Act }) {
  const [text, setText] = useState('');
  const now = new Date(state.asOf).getTime();
  return (
    <section className="pz-sec" aria-labelledby="pz-talk-title">
      <h2 id="pz-talk-title">
        한 줄 토론 <small>신고 {state.rules.hideAfter}번이면 가려져요</small>
      </h2>
      <div className="pz-stack">
        {state.me ? (
          <form
            className="pz-card pz-compose"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ action: 'post', text })) setText('');
            }}
          >
            <textarea
              aria-label="한 줄 토론 글"
              placeholder="오늘 시장, 한 줄로"
              maxLength={state.rules.postMax}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="pz-compose-row">
              <span>
                {text.length}/{state.rules.postMax}
              </span>
              <button type="submit" className="pz-btn primary" disabled={busy || text.trim().length < 2}>
                올리기
              </button>
            </div>
            <p className="pz-hint" style={{ margin: 0 }}>
              {PLAZA_POST_NOTE}
            </p>
          </form>
        ) : (
          <p className="pz-hint" style={{ margin: 0 }}>
            닉네임을 정하면 글을 올릴 수 있어요. {PLAZA_POST_NOTE}
          </p>
        )}
        {state.posts.length ? (
          <ul className="pz-posts">
            {state.posts.map((p) => (
              <li key={p.id} className="pz-post">
                <div className="pz-post-head">
                  <b>{p.nick}</b>
                  {p.rating !== null ? <span>{p.rating.toLocaleString('ko-KR')}</span> : null}
                  <span>{plazaAgo(p.t, now)}</span>
                  {p.example ? <span className="pz-tag">예시</span> : null}
                </div>
                {p.text !== null && !(p.hidden && !p.mine) ? (
                  <p>
                    {p.text}
                    {p.hidden ? ' (신고가 쌓여 다른 사람에게는 가려졌어요)' : ''}
                  </p>
                ) : (
                  <p className="hidden">신고가 쌓여 가려진 글이에요.</p>
                )}
                <div className="pz-post-acts">
                  <button
                    type="button"
                    className="pz-small"
                    aria-pressed={p.liked}
                    disabled={!state.me || busy}
                    onClick={() => void act({ action: 'like', id: p.id })}
                  >
                    ♡ 공감 {p.likes}
                  </button>
                  {!p.mine ? (
                    <button
                      type="button"
                      className="pz-small"
                      disabled={!state.me || busy || p.reported}
                      onClick={() => void act({ action: 'report', id: p.id })}
                    >
                      {p.reported ? '신고함' : '신고'}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pz-hint" style={{ margin: 0 }}>
            아직 글이 없어요. 첫 한 줄을 남겨 보세요.
          </p>
        )}
      </div>
    </section>
  );
}
