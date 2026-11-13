import authoredModules from "../../../content/listening-lab/modules.json";

export type ListeningModule = {
  id: string;
  level: string;
  title: string;
  objective: string;
  strategy: string;
  stages: string[];
  types: string[];
  sourceFrom?: number;
  sourceTo?: number;
};

/** Internal practice levels describe the learning sequence, not an IELTS band estimate. */
export const listeningModules: ListeningModule[] = authoredModules;
export const listeningModuleById = (id: string) => listeningModules.find((item) => item.id === id);
export const listeningTypeLabels: Record<string, string> = {
  word_choice: "Chọn từ nghe được", short_answer: "Short answer", form_completion: "Form completion", gap_fill: "Gap fill",
  note_completion: "Note completion", mcq: "MCQ", matching: "Matching", map_labelling: "Map/Plan labelling",
  table_completion: "Table completion", sentence_completion: "Sentence completion", summary_completion: "Summary completion", flow_chart_completion: "Flow chart completion",
};
