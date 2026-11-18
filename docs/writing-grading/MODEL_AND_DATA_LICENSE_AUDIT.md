# Model and data rights — 2026-11-10

No third-party model or dataset was downloaded, trained on, or approved for production in this change. The worker requires an explicitly configured local model ID and revision; this configuration is not a rights approval.

| Resource | Source | Decision |
| --- | --- | --- |
| IELTS Academic format and criteria | https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-writing | Reference only. The product uses original paraphrased instructions and does not reproduce official descriptor PDFs. |
| Qwen3-VL-4B-Instruct | https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct | Candidate. Card listed Apache-2.0 on 2026-11-10; artifact revision, dependencies, data provenance, hardware and independent grading quality remain unreviewed. Not installed. |
| Task 2 DeBERTa and EvalGuide | https://huggingface.co/star092304/ielts-writing-task2-debertav3base and https://huggingface.co/koecheup/evalguide-ielts-v2.5 | Quarantined: training-data rights and artifact security not cleared. Never run untrusted remote code/pickle directly. |
| Writing9 and public Task 1/2 essay datasets | https://huggingface.co/datasets/ndtran0101/writing9-ielts-essays, https://huggingface.co/datasets/TraTacXiMuoi/Ielts_writing_task1_academic, https://huggingface.co/datasets/chillies/IELTS-writing-task-2-evaluation | Quarantined: original text/image rights, personal-data provenance and examiner-label validity unverified. |
| First-party learner essays | Existing private Supabase attempts | Inference only after opt-in/notice and policy review. No training export or automatic model improvement implemented. |

The existing IELTS question bank has its own publication-rights review in `src/lib/ielts-bank/server.ts`; that does not grant training rights for submitted essays or grading models. Maintain a separate model artifact manifest with exact SHA, code/weight licenses, training-data provenance, security review and evaluation decision before deploying a worker.
