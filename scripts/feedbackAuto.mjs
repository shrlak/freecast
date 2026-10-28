// Helpers for .github/workflows/feedback.yml: new in-app feedback → Claude implements it → release.
//   node scripts/feedbackAuto.mjs fetch    write .feedback/batch.md for Claude (prints count / max id as step outputs)
//   node scripts/feedbackAuto.mjs guard    list what the change touched; protected files are never merged unseen
//   node scripts/feedbackAuto.mjs bump     next version, odometer style (package.json + package-lock.json)
//   node scripts/feedbackAuto.mjs record   mark the fetched batch as handled in feedback/state.json
// The feedback text is typed by anyone running the app, so it is only ever handed to Claude as quoted data.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const STATE_FILE = 'feedback/state.json';
export const BATCH_JSON = '.feedback/batch.json';
export const BATCH_MD = '.feedback/batch.md';
export const MAX_BATCH = 10;
export const MAX_TEXT = 2000;

/** Files a feedback-driven change may not touch on its own: CI/release, the updater, the build, secrets handling. */
export const PROTECTED = [/^\.github\//, /^electron\//, /^scripts\//, /^build\//, /^feedback\//, /^package(-lock)?\.json$/, /^CLAUDE\.md$/, /^\.claude\//, /^\.env/, /^server\/cloud\.mjs$/, /^server\/tunnel\.mjs$/, /^server\/relay\.mjs$/];

/** 0.2.9 → 0.3.0, 0.9.9 → 1.0.0: each release adds 1 to the last number and carries leftwards past 9. */
export function nextVersion(v) {
  const parts = v.split('.').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) throw new Error(`Bad version: ${v}`);
  for (let i = 2; i >= 0; i--) {
    if (parts[i] < 9 || i === 0) { parts[i]++; break; }
    parts[i] = 0;
  }
  return parts.join('.');
}

/** The Worker may return an array or wrap it ({ items }, { feedback }, …); keep entries newer than `upTo`. */
export function pendingFeedback(json, upTo) {
  const list = Array.isArray(json) ? json : Object.values(json ?? {}).find(Array.isArray) ?? [];
  return list
    .map((f) => ({
      id: Number(f?.id),
      message: clean(f?.message ?? f?.content ?? f?.text, MAX_TEXT),
      name: clean(f?.name, 80),
      version: clean(f?.version, 20),
      platform: clean(f?.platform, 80),
    }))
    .filter((f) => Number.isInteger(f.id) && f.id > upTo && f.message)
    .sort((a, b) => a.id - b.id)
    .slice(0, MAX_BATCH);
}

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max);

export function protectedPaths(paths) {
  return paths.filter((p) => PROTECTED.some((re) => re.test(p)));
}

/** The markdown Claude is given. Each message sits in a fenced block so it reads as data, not instructions. */
export function batchMarkdown(batch) {
  return batch.map((f) => {
    const fence = '`'.repeat(Math.max(3, ...(f.message.match(/`+/g) ?? []).map((m) => m.length + 1)));
    return `## Feedback #${f.id} (v${f.version || '?'}, ${f.platform || '?'}, from ${f.name || 'anonymous'})\n\n${fence}text\n${f.message}\n${fence}\n`;
  }).join('\n');
}

const readState = () => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { upTo: 0 });
const output = (k, v) => { console.log(`${k}=${v}`); if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

async function fetchBatch() {
  const base = (process.env.FREECAST_CLOUD_URL || 'https://lyrics-ai-proxy.spencerkim1235.workers.dev').replace(/\/+$/, '');
  const password = process.env.FREECAST_ADMIN_PASSWORD;
  if (!password) throw new Error('FREECAST_ADMIN_PASSWORD is not set');
  const res = await fetch(`${base}/freecast/feedback`, {
    headers: { Origin: process.env.FREECAST_ORIGIN || 'https://shrlak.github.io', 'x-admin-password': password },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Worker answered ${res.status} for the feedback list`);
  const batch = pendingFeedback(await res.json(), readState().upTo);
  mkdirSync('.feedback', { recursive: true });
  writeFileSync(BATCH_JSON, JSON.stringify(batch));
  writeFileSync(BATCH_MD, batchMarkdown(batch));
  output('count', batch.length);
  output('max_id', batch.at(-1)?.id ?? 0);
  output('ids', batch.map((f) => `#${f.id}`).join(' '));
}

function guard() {
  execFileSync('git', ['add', '-A']); // new files count too
  const changed = execFileSync('git', ['diff', '--cached', '--name-only', 'origin/main'], { encoding: 'utf8' }).split('\n').filter(Boolean)
    .filter((p) => !p.startsWith('.feedback/'));
  const blocked = protectedPaths(changed);
  output('code_changed', changed.some((p) => !p.startsWith('feedback/')));
  output('protected', blocked.length > 0);
  if (blocked.length) console.log(`Protected files touched: ${blocked.join(', ')}`);
}

function bump() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const next = nextVersion(pkg.version);
  for (const file of ['package.json', 'package-lock.json']) {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    json.version = next;
    if (json.packages?.['']) json.packages[''].version = next;
    writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  }
  output('version', next);
}

function record() {
  const maxId = Number(process.env.MAX_ID);
  if (!Number.isInteger(maxId) || maxId <= 0) throw new Error('MAX_ID is not set');
  mkdirSync('feedback', { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({ upTo: Math.max(maxId, readState().upTo) }, null, 2) + '\n');
}

// pathToFileURL: on Windows the URL is file:///D:/..., which a plain `file://${argv[1]}` never matches
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const cmd = process.argv[2];
  const run = { fetch: fetchBatch, guard, bump, record }[cmd];
  if (!run) { console.error('usage: feedbackAuto.mjs fetch|guard|bump|record'); process.exit(2); }
  Promise.resolve(run()).catch((e) => { console.error(e.message); process.exit(1); });
}
