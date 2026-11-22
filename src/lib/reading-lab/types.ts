export type ReadingLabSummary = {
  id: string; title: string; sections: number; questions: number; minutes: number;
  fullTest: boolean; questionTypes: string[];
  /** Passage titles, in order. */
  passages?: string[];
};
