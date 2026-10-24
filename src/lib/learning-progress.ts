import type { StudyTask } from "@/lib/demo-data";

export function completeNextLinkedTask(tasks: StudyTask[], lesson: string): StudyTask[] {
  const first = tasks.filter((task) => task.lesson === lesson && !task.completed)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return first ? tasks.map((task) => task.id === first.id ? { ...task, completed: true } : task) : tasks;
}
