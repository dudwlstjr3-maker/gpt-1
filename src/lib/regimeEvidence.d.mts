/** regimeEvidence.mjs 의 타입. 숫자는 백테스트가 만든 것이라 .mjs 에 있다. */

export interface EvidenceSource {
  id: string;
  label: string;
  origin: string;
  via: string;
}

export interface EvidenceBucket {
  id: string;
  label: string;
  from: number;
  to: number;
  months: number;
  episodes: number;
  sample: number;
  fwd12Mean?: number;
  fwd12Median?: number;
  positiveShare?: number;
  fwd12Worst?: number;
  deepestDip?: number;
}

export interface EvidenceEpisode {
  from: string;
  to: string;
  months: number;
  trough: string;
  troughScore: number;
  fwd12: number | null;
  deepestDip: number | null;
}

export interface EvidenceFinding {
  id: string;
  title: string;
  body: string;
}

export declare const EVIDENCE_SOURCES: EvidenceSource[];
export declare const LIVE_VS_BACKTEST: string;
export declare const EVIDENCE_SAMPLE: { from: string; to: string; months: number };
export declare const EVIDENCE_BUCKETS: EvidenceBucket[];
export declare const EXTREME_FEAR_EPISODES: EvidenceEpisode[];
export declare const FEAR_EPISODES: EvidenceEpisode[];
export declare const HOT_EPISODES: EvidenceEpisode[];
export declare const EVIDENCE_FINDINGS: EvidenceFinding[];
export declare const EVIDENCE_LIMITS: string[];
