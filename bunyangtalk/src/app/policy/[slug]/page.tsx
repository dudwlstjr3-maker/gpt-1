import { notFound } from "next/navigation";
import { PageTitle } from "@/components/ui";

const DOCS: Record<string, { title: string; draft?: boolean; body: string[] }> = {
  anonymity: {
    title: "익명성 안내",
    body: [
      "다른 회원에게 보이는 것: 닉네임, 작성한 글·댓글·채팅 내용, 작성 시각.",
      "다른 회원에게 보이지 않는 것: 이메일, 비밀번호, 연락처, 계정 ID, 소속 기업, 다른 방에서의 활동 기록.",
      "운영자가 보관·확인할 수 있는 것: 계정(이메일)과 닉네임 변경 이력, 신고된 콘텐츠와 그 작성 계정, 접속 기록(3개월). 운영자 화면에서도 이메일은 일부 가려서 표시하며, 모든 운영자 조치는 감사 로그로 남습니다.",
      "외부 제공: 수사기관의 적법한 요청(영장 등)이 있는 경우에만 관련 법령에 따라 제공할 수 있습니다.",
      "1:1 대화도 서로의 닉네임만 보입니다. 상대가 원치 않으면 차단할 수 있고, 차단하면 서로의 메시지가 보이지 않습니다.",
      "닉네임은 30일에 한 번 바꿀 수 있고, 운영자·관리자를 사칭하는 닉네임은 쓸 수 없습니다.",
      "특정인을 알아볼 수 있는 정보를 올리거나 확인되지 않은 사실로 비방하면, 익명이라도 명예훼손 등 법적 책임이 생길 수 있습니다. 권리를 침해당했다면 '권리침해' 사유로 신고해 주세요. 확인 후 임시 조치합니다.",
    ],
  },
  terms: { title: "이용약관", draft: true, body: ["출시 전 법률 검토를 거쳐 게시합니다."] },
  privacy: { title: "개인정보처리방침", draft: true, body: ["출시 전 법률 검토를 거쳐 게시합니다. 수집 항목(이메일, 비밀번호 해시, 닉네임, 접속 기록), 보관 기간, 파기 절차, 처리 위탁(호스팅·결제) 내용을 포함합니다."] },
  ads: {
    title: "광고 운영정책",
    body: [
      "일반 구인공고 등록은 무료입니다. 기업 인증을 마친 구인자만 등록할 수 있습니다.",
      "프리미엄·VIP 광고는 게시 중인 공고를 목록·홈 상단에 노출하는 유료 상품이며, 모든 광고에는 '광고' 표시가 붙습니다.",
      "메인 배너 광고는 운영팀과 별도 협의로 진행합니다.",
      "허위·과장 공고(근거 없는 확정 수익 표현, 실제와 다른 업체명 등)는 광고 여부와 관계없이 게시가 중단될 수 있습니다.",
      "광고 노출수·클릭수는 구인자 관리 화면에서 확인할 수 있습니다.",
    ],
  },
};

export default async function Policy({ params }: { params: Promise<{ slug: string }> }) {
  const doc = DOCS[(await params).slug];
  if (!doc) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title={doc.title} />
      {doc.draft && <p className="mb-3 rounded-xl bg-ad-50 px-4 py-3 text-sm text-ad-700">초안 준비 중 — 정식 출시 전 확정합니다.</p>}
      <ul className="card space-y-3 p-5 text-[15px] leading-7 text-ink-2">
        {doc.body.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  );
}
