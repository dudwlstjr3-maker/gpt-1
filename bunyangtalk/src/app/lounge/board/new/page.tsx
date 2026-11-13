import { q } from "@/lib/db";
import { requirePageUser } from "@/lib/auth";
import { BOARD_CATEGORIES } from "@/lib/constants";
import { JsonForm } from "@/components/client";
import { PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "글쓰기" };

export default async function NewPost({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const v = await requirePageUser("/lounge/board/new");
  const sp = await searchParams;
  const sites = await q<{ id: string; name: string }>("SELECT id, name FROM sites ORDER BY name LIMIT 300");
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="익명 글쓰기" sub={`'${v.nickname}' 닉네임으로 게시됩니다.`} />
      <div className="card p-5">
        <JsonForm endpoint="/api/board/posts" submitLabel="등록">
          <div className="grid gap-4">
            <div>
              <span className="label">말머리</span>
              <div className="flex flex-wrap gap-2">
                {BOARD_CATEGORIES.map(([k, l], i) => (
                  <label key={k} className="chip cursor-pointer has-[:checked]:border-navy-900 has-[:checked]:bg-navy-900 has-[:checked]:text-white">
                    <input type="radio" name="category" value={k} defaultChecked={sp.site ? k === "site" : i === 0} className="sr-only" />{l}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="label">관련 현장 (선택)</span>
              <select name="siteId" className="input" defaultValue={sp.site ?? ""}>
                <option value="">선택 안 함</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <input name="title" className="input" placeholder="제목" maxLength={100} />
            <textarea name="body" rows={10} className="textarea" maxLength={5000}
              placeholder={"내용을 입력하세요.\n특정인을 알아볼 수 있는 정보, 확인되지 않은 비방은 삭제·제재될 수 있습니다."} />
          </div>
        </JsonForm>
      </div>
    </div>
  );
}
