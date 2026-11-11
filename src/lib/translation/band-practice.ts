import curriculum from "../../data/translation/band-exercises.json";
import rubric from "../../data/translation/level-rubric.json";
import type { PracticeExercise } from "./schema";

export const practiceBands = Array.from({ length: 17 }, (_, index) => (1 + index * 0.5).toFixed(1));

export type BandExercise = PracticeExercise;

// The numbers identify practice levels. They are not official IELTS scores.
export const bandExercises = curriculum as BandExercise[];
export const levelRubric = rubric;
