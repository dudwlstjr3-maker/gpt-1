"use client";
import { useState } from "react";
import { JsonForm } from "./client";
import { REGIONS, RANKS, PROPERTY_TYPES, RT_BASIS, CONTRACT_TYPES, BENEFITS } from "@/lib/constants";

type Site = { id: string; name: string; region_name: string };
type Init = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function F({ label, hint, children, wide }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <span className="label">{label}</span>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function JobForm({ sites, companies, init, endpoint, method }: {
  sites: Site[]; companies: { id: string; name: string }[]; init?: Init; endpoint: string; method: "POST" | "PATCH";
}) {
  const [siteId, setSiteId] = useState<string>(init?.site_id ?? (sites[0]?.id ?? "new"));
  const [basis, setBasis] = useState<string>(init?.rt_basis ?? "per_contract");
  const isNew = siteId === "new";
  return (
    <JsonForm endpoint={endpoint} method={method} submitLabel={method === "POST" ? "공고 등록 (검토 요청)" : "수정 저장"}>
      <div className="grid gap-4 sm:grid-cols-2">
        {companies.length > 1 && (
          <F label="소속 기업" wide>
            <select name="companyId" className="input" defaultValue={init?.company_id}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </F>
        )}
        <F label="분양현장" wide hint="목록에 없는 현장은 '새 현장 직접 입력'을 고르세요.">
          <select name="siteId" className="input" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.region_name})</option>)}
            <option value="new">+ 새 현장 직접 입력</option>
          </select>
        </F>
        {isNew && (
          <>
            <F label="현장명"><input name="siteName" className="input" placeholder="예) ○○ 센트럴 파크" maxLength={60} /></F>
            <F label="현장 지역">
              <select name="siteRegion" className="input">{REGIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </F>
            <F label="분양 유형">
              <select name="siteType" className="input">{PROPERTY_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </F>
            <F label="현장 위치(주소)"><input name="siteAddress" className="input" placeholder="시·구·동까지" maxLength={200} /></F>
          </>
        )}
        <F label="공고 제목" wide><input name="title" className="input" defaultValue={init?.title} maxLength={80} placeholder="예) 아파트 600세대 상담사·팀장 모집, 일비 지급" /></F>
        <F label="모집 직급" wide>
          <div className="flex flex-wrap gap-2">
            {RANKS.map(([k, v]) => (
              <label key={k} className="chip cursor-pointer has-[:checked]:border-navy-900 has-[:checked]:bg-navy-900 has-[:checked]:text-white">
                <input type="checkbox" name="ranks[]" value={k} className="sr-only" defaultChecked={init?.ranks?.includes(k)} />{v}
              </label>
            ))}
          </div>
        </F>
        <F label="모집 인원"><input name="headcount" type="number" min={1} className="input" defaultValue={init?.headcount ?? ""} placeholder="명" /></F>
        <F label="계약 형태">
          <select name="contractType" className="input" defaultValue={init?.contract_type ?? "commission"}>
            {CONTRACT_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </F>
        <F label="RT 산정 기준">
          <select name="rtBasis" className="input" value={basis} onChange={(e) => setBasis(e.target.value)}>
            {RT_BASIS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </F>
        {(basis === "per_contract" || basis === "per_unit") && (
          <F label="RT 금액 (만원)"><input name="rtAmountMan" type="number" min={0} className="input" defaultValue={init?.rt_amount ? init.rt_amount / 10000 : ""} placeholder="예) 300" /></F>
        )}
        {basis === "percent" && (
          <F label="RT 비율 (%)"><input name="rtPercent" type="number" min={0} max={100} step="0.1" className="input" defaultValue={init?.rt_percent ?? ""} /></F>
        )}
        <F label="RT 비고" wide><input name="rtNote" className="input" defaultValue={init?.rt_note ?? ""} maxLength={200} placeholder="예) 팀장 오버라이드 별도, 계약금 입금 기준" /></F>
        <F label="일비 (원)"><input name="dailyPay" type="number" min={0} step={1000} className="input" defaultValue={init?.daily_pay ?? 0} /></F>
        <F label="일비 지급 조건"><input name="dailyPayCondition" className="input" defaultValue={init?.daily_pay_condition ?? ""} maxLength={200} placeholder="예) 출근 시 당일 지급, 첫 2주" /></F>
        <F label="정산 일정"><input name="settlementSchedule" className="input" defaultValue={init?.settlement_schedule ?? ""} maxLength={200} placeholder="예) 계약 익월 10일" /></F>
        <F label="투입 예정일"><input name="startDate" type="date" className="input" defaultValue={init?.start_date?.slice?.(0, 10) ?? ""} /></F>
        <F label="모집 마감일" hint="비우면 '채용 시 마감'으로 표시됩니다."><input name="deadline" type="date" className="input" defaultValue={init?.deadline?.slice?.(0, 10) ?? ""} /></F>
        <F label="복리후생" wide>
          <div className="flex flex-wrap gap-2">
            {BENEFITS.map((b) => (
              <label key={b} className="chip cursor-pointer has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700">
                <input type="checkbox" name="benefits[]" value={b} className="sr-only" defaultChecked={init?.benefits?.includes(b)} />{b}
              </label>
            ))}
          </div>
        </F>
        <F label="담당자 이름"><input name="contactName" className="input" defaultValue={init?.contact_name ?? ""} maxLength={30} /></F>
        <F label="담당자 연락처" hint="로그인 회원이 '연락처 보기'를 누를 때만 공개됩니다."><input name="contactPhone" className="input" defaultValue={init?.contact_phone ?? ""} inputMode="tel" placeholder="010-0000-0000" /></F>
        <F label="상세 모집 내용" wide>
          <textarea name="description" rows={8} className="textarea" defaultValue={init?.description ?? ""} maxLength={5000}
            placeholder="현장 규모, 분양가, 홍보관 위치, 근무 시간, 교육 지원 등을 적어 주세요. 근거 없는 '월 ○천 보장' 같은 표현은 반려됩니다." />
        </F>
      </div>
      <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-muted">
        현장 사진 첨부는 다음 버전에서 제공됩니다. 등록한 공고는 운영자가 기업 정보와 내용을 확인한 뒤 게시하며, 허위·과장 공고는 반려되거나 게시가 중단될 수 있습니다.
      </p>
    </JsonForm>
  );
}
