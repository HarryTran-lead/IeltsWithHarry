# Kế hoạch học 2.0 (Planner)

The planner answers one question for the learner: *what do I study today, and for how long*. Each task
links to the real lesson, test or habit, and the database ticks it when that work is done anywhere in the app.

## Rollout order

1. Apply `supabase/migrations/202611240001_planner_v2.sql` (additive; safe to re-run).
2. Deploy the app.

The client also works before step 1: inserts and updates retry without the new columns
(`PGRST204`/`42703`) and day reordering falls back to one update per task. Auto-completion
needs the migration.

## What the migration adds

| Piece | Purpose |
| --- | --- |
| `study_tasks.duration_minutes`, `source`, `series_id`, `completed_at` | Planned length, origin (manual, exam, dictation, vocabulary, grammar, news, lab, practice, suggestion, plan, teacher), repeating series, finish time |
| `stamp_completion` trigger | Keeps `completed_at` in step with `completed`; clients never write it |
| `reorder_study_tasks(uuid[])` | Orders one day's tasks in one call (security invoker, own rows only) |
| `planner_complete(...)` + `planner_autocomplete` triggers | Tick linked tasks when the work is recorded |

## Lesson links (`study_tasks.lesson_slug`)

A plain kind means "some of this work"; `kind:ref` means one item. Kinds live in
`src/lib/planner/links.ts` and must match the trigger.

| Lesson | Opens | Ticked when |
| --- | --- | --- |
| `ielts:<exam id>` | that test | the attempt is submitted (any due date) |
| `reading`, `listening`, `writing`, `speaking` (+ `:<question type>`) | the skill library | any test of that skill is submitted (due today or earlier) |
| `dictation` / `dictation:<lesson id>` | Dictation / that Skill Lab lesson | any dictation answer today / every question of that lesson checked |
| `vocabulary-review` | Ôn tập | no saved word is due any more |
| `vocabulary-study` | Học từ mới | a new word gets its first review |
| `grammar`, `grammar-review` | Grammar | any Grammar answer is saved |
| `news` / `news:<slug>` | Daily News / that article | a news quiz is submitted / that article's quiz is submitted |
| `lab:<id>`, `translation`, `speaking-mock` | the Lab or page | learner ticks it (labs save drafts continuously, so there is no clean "done" signal yet) |

Course lessons keep their old behaviour (`submit_exercise` ticks the matching slug).

## Client pieces

- `src/lib/planner/` — pure rules (dates, grouping, suggestions, weekly plan generator); tested in `tests/planner.test.ts`.
- `src/features/planner/planner-page.tsx` — week strip, pinned overdue block, draggable day list (mouse, touch via the grip, arrow keys), list view, suggestions, "Lập kế hoạch tuần".
- `src/features/planner/task-sheet.tsx` — add/edit: choose what to study first, then title, length, day, repeat, time, priority.
- `src/features/planner/planner-widgets.tsx` — task row, toast with Undo, `TodayPlanCard` for the Dashboard.
- `src/features/demo/demo-store.tsx` — optimistic updates, `addTasks`, `reorderDay`, `refreshTasks` (on focus, on `planner-tasks-changed`, on `learner-activity`).

Other features now link in: the streak reminder offers the learner's next planned task first and stays
quiet on the planner page; Dictation, Vocabulary, Daily News and the question bank add linked tasks and
stay on their page; the sidebar and mobile bar show how many tasks are waiting today.

## Not in this version

Push or email reminders, minutes from the Cùng học focus timer, shared plan templates in Cộng đồng,
and a "done" signal for the self-study Labs.
