// 분양톡 브랜드 요소: 지붕 모양 말풍선(모델하우스 + 대화) 마크, 워드마크, 현장 스카이라인 모티프

export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <path d="M16 2.6 29.2 12.1c.5.4.8 1 .8 1.6V23a3 3 0 0 1-3 3H14.2l-5.4 4.3c-.6.5-1.5 0-1.5-.8V26H5a3 3 0 0 1-3-3v-9.3c0-.6.3-1.2.8-1.6L16 2.6Z" fill="var(--color-navy-900)" />
      <circle cx="10.6" cy="17.6" r="1.9" fill="#fff" />
      <circle cx="16" cy="17.6" r="1.9" fill="#fff" />
      <circle cx="21.4" cy="17.6" r="1.9" fill="var(--color-brand-500)" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <BrandMark size={30} />
      <span className="text-[20px] font-black tracking-[-0.04em] text-navy-900">분양<span className="text-brand-600">톡</span></span>
    </span>
  );
}

// 아파트·오피스텔 실루엣. 장식용이라 스크린리더에서 숨긴다
export function Skyline({ className = "" }: { className?: string }) {
  const b: [number, number, number][] = [
    [0, 34, 18], [20, 18, 22], [44, 40, 14], [60, 8, 24], [86, 28, 16], [104, 14, 20], [126, 36, 14], [142, 22, 26], [170, 44, 12], [184, 12, 22], [208, 30, 18], [228, 40, 12],
  ];
  return (
    <svg viewBox="0 0 240 64" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" className={className} fill="currentColor">
      {b.map(([x, y, w]) => (
        <g key={x}>
          <rect x={x} y={y} width={w} height={64 - y} rx="1.5" />
          {Array.from({ length: Math.floor((60 - y) / 9) }, (_, r) =>
            Array.from({ length: Math.floor((w - 4) / 6) }, (_, c) => (
              <rect key={`${r}-${c}`} x={x + 4 + c * 6} y={y + 5 + r * 9} width="2.4" height="3.4" rx=".6" fill="var(--surface)" opacity=".55" />
            )),
          )}
        </g>
      ))}
    </svg>
  );
}
