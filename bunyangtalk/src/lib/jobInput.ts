import { str, int, oneOf, list, fail, isUuid } from "./http";
import { RANKS, RT_BASIS, CONTRACT_TYPES, BENEFITS, REGIONS, PROPERTY_TYPES, keys } from "./constants";
import { q1, type Db } from "./db";

export type JobInput = ReturnType<typeof parseJob>;

const dateOrNull = (v: unknown, name: string): string | null => {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) return fail(400, `${name} 날짜 형식이 올바르지 않습니다.`);
  return v;
};

export function parseJob(b: Record<string, unknown>) {
  const rtBasis = oneOf(b, "rtBasis", keys(RT_BASIS), { name: "RT 산정 기준" })!;
  // 화면에서는 만원 단위로 입력 → 원으로 저장
  const rtMan = int(b, "rtAmountMan", { min: 0, max: 100000, optional: true, name: "RT 금액" });
  const rtPercent = int(b, "rtPercent", { min: 0, max: 100, optional: true, name: "RT 비율" });
  if ((rtBasis === "per_contract" || rtBasis === "per_unit") && rtMan == null) fail(400, "RT 금액을 입력해 주세요.");
  if (rtBasis === "percent" && rtPercent == null) fail(400, "RT 비율(%)을 입력해 주세요.");
  const ranks = list(b, "ranks", keys(RANKS));
  if (!ranks.length) fail(400, "모집 직급을 하나 이상 선택해 주세요.");
  const phone = str(b, "contactPhone", { max: 20, name: "담당자 연락처" })!;
  if (!/^[0-9+\-\s()]{8,20}$/.test(phone)) fail(400, "연락처 형식을 확인해 주세요.");
  const startDate = dateOrNull(b.startDate, "투입 예정일");
  const deadline = dateOrNull(b.deadline, "모집 마감일");
  return {
    title: str(b, "title", { min: 4, max: 80, name: "공고 제목" })!,
    ranks,
    headcount: int(b, "headcount", { min: 1, max: 999, optional: true, name: "모집 인원" }),
    rtBasis,
    rtAmount: rtBasis === "per_contract" || rtBasis === "per_unit" ? (rtMan ?? 0) * 10000 : null,
    rtPercent: rtBasis === "percent" ? rtPercent : null,
    rtNote: str(b, "rtNote", { max: 200, optional: true }),
    dailyPay: int(b, "dailyPay", { min: 0, max: 10000000, optional: true, name: "일비" }) ?? 0,
    dailyPayCondition: str(b, "dailyPayCondition", { max: 200, optional: true }),
    settlementSchedule: str(b, "settlementSchedule", { max: 200, optional: true }),
    startDate,
    deadline,
    contractType: oneOf(b, "contractType", keys(CONTRACT_TYPES), { name: "계약 형태" })!,
    benefits: list(b, "benefits", BENEFITS),
    contactName: str(b, "contactName", { max: 30, name: "담당자 이름" })!,
    contactPhone: phone,
    description: str(b, "description", { min: 10, max: 5000, name: "상세 모집 내용" })!,
  };
}

// 기존 현장 선택 또는 새 현장 등록
export async function resolveSite(b: Record<string, unknown>, userId: string, db: Db): Promise<{ id: string; region: string }> {
  if (b.siteId && b.siteId !== "new") {
    if (!isUuid(b.siteId)) fail(400, "현장을 다시 선택해 주세요.");
    const s = await q1<{ id: string; region_code: string }>("SELECT id, region_code FROM sites WHERE id = $1", [b.siteId], db);
    if (!s) fail(400, "현장을 찾을 수 없습니다.");
    return { id: s!.id, region: s!.region_code };
  }
  const name = str(b, "siteName", { min: 2, max: 60, name: "현장명" })!;
  const region = oneOf(b, "siteRegion", keys(REGIONS), { name: "현장 지역" })!;
  const type = oneOf(b, "siteType", keys(PROPERTY_TYPES), { name: "분양 유형" })!;
  const address = str(b, "siteAddress", { max: 200, optional: true });
  const s = await q1<{ id: string }>(
    "INSERT INTO sites(name, region_code, property_type, address, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [name, region, type, address, userId],
    db,
  );
  return { id: s!.id, region };
}
