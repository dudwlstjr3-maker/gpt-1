export interface MoodStageCard {
  title: string;
  message: string;
  trail: string;
}

export function moodResponse(history: ReadonlyArray<{ v: number | null; formulaVersion?: string }>): MoodStageCard;
