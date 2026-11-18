#!/usr/bin/env node
// Public-repository safety preflight. No database, credentials, hidden prompts or private feeds.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve('.');
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
const fail = reason => { throw new Error('TASK2_S021_BLOCKED: ' + reason); };
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git('symbolic-ref', '--quiet', '--short', 'HEAD');
if (!/^(task2\/[a-z0-9][a-z0-9._\/-]*|feature\/task2-[a-z0-9._-]+)$/.test(branch) || branch.includes('..')) fail('FEATURE_BRANCH_REQUIRED');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (pkg.name !== 'ieltswithharry' || !String(pkg.dependencies?.next || '').startsWith('16.')) fail('WRONG_NEXT_REPOSITORY');
const tracked = execFileSync('git', ['-C',root,'ls-files','-z'], { encoding:'utf8' }).split('\0').filter(Boolean);
const forbidden = [
  /(?:^|\/)canonical_flat_data\//i,
  /(?:^|\/)server_only_records\.jsonl$/i,
  /(?:^|\/)R16_FINAL_LOCKED_PROMPTS_7\.json$/i,
  /(?:^|\/)tools\/task2-rewrite-stage-v1\//i,
  /(?:^|\/)source_archive\//i,
  /(?:^|\/)IELTS_Task2_[^/]*\.zip$/i
];
const bad = tracked.filter(name => forbidden.some(rule => rule.test(name)));
if (bad.length) fail('PRIVATE_TASK2_CONTENT_TRACKED: ' + bad.slice(0,5).join(','));
if (!tracked.includes('src/app/api/admin/task2-staging/status/route.ts')) fail('MISSING_ADMIN_ONLY_STATUS_ROUTE');
const rootCommit = git('rev-parse', 'HEAD');
console.log(JSON.stringify({
  result:'PASS_PUBLIC_REPO_SAFETY_ONLY',
  repository:'HarryTran-lead/IeltsWithHarry',
  branch, head:rootCommit, tracked_files:tracked.length,
  expected_records:1975, staged_records:'NOT_IMPORTED',
  rls_live:'NOT_RUN', next_build:'SEPARATE_QUALITY_CI',
  production:'HOLD'
},null,2));
