export type CurveShapeId = 'contango' | 'backwardation' | 'flat';

export interface CurveReading {
  shape: CurveShapeId;
  spreadPct: number;
  months: number;
  near: number;
  far: number;
  label: string;
  glyph: string;
  meaning: string;
}

export declare const FLAT_PCT: number;
export declare const SHAPE_LABEL: Record<CurveShapeId, string>;
export declare const SHAPE_GLYPH: Record<CurveShapeId, string>;
export declare function curveShape(curve: unknown): CurveReading | null;
export declare function meaningOf(shape: string, months: number): string;
export declare function contractLabel(n: unknown): string;
