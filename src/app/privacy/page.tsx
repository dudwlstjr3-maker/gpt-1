/**
 * 개인정보 처리방침 (2026-11-26) — 쫄탐광장 카카오 로그인용.
 * 글은 src/lib/privacyText.mjs 한 곳(미리보기도 같은 파일). 문의처는 PLAZA_CONTACT 환경변수.
 * 카카오 동의항목 심사 때 이 주소(/privacy)를 적는다.
 */

import { getPlazaContact } from '@/server/config';
import { PRIVACY_EFFECTIVE, privacySections } from '@/lib/privacyText.mjs';

export const dynamic = 'force-dynamic';

export const metadata = { title: '개인정보 처리방침 · 쫄탐일보' };

export default function PrivacyPage() {
  const sections = privacySections(getPlazaContact());
  return (
    <div className="plaza">
      <div>
        <div className="pz-head">
          <h1>개인정보 처리방침</h1>
        </div>
        <p className="pz-lede">쫄탐광장(다음 거래일 맞히기 · 한 줄 토론)에서 다루는 개인정보입니다. 시행일 {PRIVACY_EFFECTIVE}.</p>
      </div>
      {sections.map((s) => (
        <section key={s.title} className="pz-sec">
          <h2>{s.title}</h2>
          <div className="pz-card">
            <ul className="pz-hint pz-list" style={{ margin: 0 }}>
              {s.body.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
