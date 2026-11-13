import { api, body, json, fail, str } from "@/lib/http";
import { q1, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const POST = api(async (req) => {
  const v = await requireUser();
  const b = await body(req);
  const name = str(b, "name", { min: 2, max: 60, name: "회사명" })!;
  const bn = str(b, "businessNumber", { name: "사업자등록번호" })!.replace(/[^0-9]/g, "");
  if (!/^\d{10}$/.test(bn)) fail(400, "사업자등록번호 10자리를 입력해 주세요.");
  const rep = str(b, "representative", { min: 2, max: 30, name: "대표자명" })!;
  if (v.companies.length >= 3) fail(409, "소속 기업은 3곳까지 등록할 수 있습니다.");
  if (await q1("SELECT 1 FROM companies WHERE business_number = $1", [bn]))
    fail(409, "이미 등록된 사업자번호입니다. 해당 기업의 관리자에게 소속 추가를 요청해 주세요.");
  await tx(async (c) => {
    const co = await q1<{ id: string }>(
      "INSERT INTO companies(name, business_number, representative, created_by) VALUES ($1,$2,$3,$4) RETURNING id",
      [name, bn, rep, v.id],
      c,
    );
    await c.query("INSERT INTO company_members(company_id, user_id, role) VALUES ($1,$2,'owner')", [co!.id, v.id]);
  });
  return json({ ok: true }, 201);
});
