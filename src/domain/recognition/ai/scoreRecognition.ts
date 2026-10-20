// Orchestrates score recognition: given the chosen engine, turn a rendered score
// image into a draft song and merge it onto an existing Song without clobbering
// anything the user has already typed.
import { RECOGNITION_PROXY } from '../proxy';
import type { BatchRecognitionMode, ParsedScore } from './scoreParser';
import type { AiSettings, RecognitionAttempt, RecognitionEngine } from './aiSettings';
import { recognizeBatchWithGemini, recognizeWithGemini } from './scoreAi';
import { recognizeBatchWithOpenRouter, recognizeWithOpenRouter, type PromptExample } from './scoreNvidia';
import { RecognitionError } from './recognitionError';
import { classifyRecognitionError, isRetryableRecognitionError, type RecognitionObservation } from './recognitionObservation';
import { buildWeightedConsensus } from './weightedConsensus';
import { modelKeyFor, type ModelReliability } from './modelReliability';
export { applyScoreToSong } from './scoreMerge';
import { fillScoreGaps } from './scoreMerge';
/**
 * Base URL of the optional shared recognition proxy (see worker/), baked into
 * the build at deploy time. Non-secret — safe to expose in client code, since
 * the actual API keys live only on the proxy server.
 */
const PROXY_URL = RECOGNITION_PROXY;

/**
 * First pause before trying a busy model again; each further pause doubles,
 * up to RETRY_MAX_DELAY_MS.
 *
 * One quick retry used to be all a model got. Free-tier Gemini answers
 * "This model is currently experiencing high demand" (503) in spikes that
 * last from seconds to over a minute, and on a busy evening most calls of a
 * conti met one — a 찬양집회 conti of 18 pages then came back with most of its
 * songs unread. So a busy model is tried again for as long as the call has
 * time left, backing off so the retries do not add to the crowd.
 */
const RETRY_BASE_DELAY_MS = 1500;

/** The longest pause between two tries of the same call. */
const RETRY_MAX_DELAY_MS = 12_000;

/**
 * Another try is only started with at least this much of the call's time
 * left: a model needs a few seconds to read even one page, and a try cut off
 * mid-answer is wasted.
 */
const MIN_RETRY_WINDOW_MS = 8_000;

/**
 * Hard cap on one model's batch call.
 *
 * Consensus needs every model's answer, so the batch waits for all of them
 * rather than finishing on the first. That makes a provider that accepts a
 * request and never answers able to hang the whole job, which the cap
 * prevents: a model past the cap is recorded as a timeout observation and the
 * remaining models decide the page.
 */
const ATTEMPT_TIMEOUT_MS = 120_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reject with a 408 once `timeoutMs` passes. The request itself is left to
 * finish in the background — its answer is simply no longer waited for.
 */
async function withAttemptTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new RecognitionError('인식 응답 시간 초과', 408)), Math.max(0, timeoutMs));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** How long to wait before try number `retry + 2`: the provider's own hint, else backing off. */
function retryDelayMs(error: unknown, retry: number): number {
  const backoff = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** retry);
  // A little spread, so the pages and models that failed together do not
  // all come back at the same instant.
  const spread = backoff * (0.8 + Math.random() * 0.4);
  const hinted = error instanceof RecognitionError ? error.retryAfterMs : undefined;
  return hinted !== undefined ? Math.max(hinted, spread) : spread;
}

/**
 * Run an engine call, trying it again while the provider is only busy (503
 * and other 5xx, a burst 429, a timeout, a dropped connection) and the call
 * still has time: no new try starts unless MIN_RETRY_WINDOW_MS would be left
 * after the pause, so the loop ends on its own by `endsAt` — the request it
 * is wrapped in is never cut off with retries still firing behind it. A
 * spent daily quota, a refused key or an unknown model fails at once, and
 * the rest of the model pool carries on independently either way.
 */
async function withRetry<T>(call: () => Promise<T>, endsAt: number): Promise<T> {
  for (let retry = 0; ; retry += 1) {
    try {
      return await call();
    } catch (error) {
      if (!isRetryableRecognitionError(error)) throw error;
      const wait = retryDelayMs(error, retry);
      if (endsAt - (Date.now() + wait) < MIN_RETRY_WINDOW_MS) throw error;
      await delay(wait);
    }
  }
}

/**
 * Return the complete shared model pool. Every recognition phase launches
 * this entire pool concurrently; array order is display-only and never gates
 * which provider starts first.
 */
function planAttempts(settings: AiSettings): RecognitionAttempt[] {
  return settings.attempts;
}

async function recognizeWithEngine(
  attempt: RecognitionAttempt,
  dataUrl: string,
  settings: AiSettings,
): Promise<ParsedScore> {
  if (attempt.engine === 'gemini') {
    const key = settings.geminiApiKey.trim();
    if (!key && !PROXY_URL) throw new Error('Gemini API 키가 설정되지 않았습니다.');
    return recognizeWithGemini(dataUrl, key, attempt.model, settings.geminiUseSearch, PROXY_URL);
  }
  if (attempt.engine === 'openrouter') {
    const key = settings.openrouterApiKey.trim();
    if (!key && !PROXY_URL) throw new Error('OpenRouter API 키가 설정되지 않았습니다.');
    return recognizeWithOpenRouter(dataUrl, key, attempt.model, PROXY_URL);
  }
  throw new Error('자동 인식이 꺼져 있습니다.');
}

export interface RecognitionResult {
  score: ParsedScore;
  /** Which engine actually produced the result, so the UI can say so. */
  engine: RecognitionEngine;
}

export interface BatchRecognitionResult {
  /** Results remain aligned with the input image order. */
  scores: ParsedScore[];
  engine: RecognitionEngine;
  /** Every model's settled answer for each page, in the same page order. */
  observations: RecognitionObservation[][];
  /** Weighted consensus confidence per page (0–1). */
  confidence: number[];
  /**
   * How much of the models' weight agreed on the TITLE of each page (0–1).
   *
   * Kept apart from the overall confidence because the title decides something
   * the rest of the answer does not: whether the saved library entry under
   * that name may stand in for the page without reading it. A title-only pass
   * has no lyrics to be confident about, so the overall number would say the
   * page is unsettled even when every model read the same title.
   */
  titleConfidence: number[];
  /** Pages whose answer is not settled enough to save without a look. */
  needsReview: boolean[];
}

async function recognizeBatchWithEngine(
  attempt: RecognitionAttempt,
  dataUrls: string[],
  settings: AiSettings,
  mode: BatchRecognitionMode,
  hints?: (string | undefined)[],
  examples: PromptExample[] = [],
): Promise<ParsedScore[]> {
  if (attempt.engine === 'gemini') {
    const key = settings.geminiApiKey.trim();
    if (!key && !PROXY_URL) throw new Error('Gemini API 키가 설정되지 않았습니다.');
    return recognizeBatchWithGemini(
      dataUrls,
      key,
      attempt.model,
      mode,
      mode === 'full' && settings.geminiUseSearch,
      PROXY_URL,
      hints,
      examples,
    );
  }
  if (attempt.engine === 'openrouter') {
    const key = settings.openrouterApiKey.trim();
    if (!key && !PROXY_URL) throw new Error('OpenRouter API 키가 설정되지 않았습니다.');
    return recognizeBatchWithOpenRouter(dataUrls, key, mode, attempt.model, PROXY_URL, hints, examples);
  }
  throw new Error('자동 인식이 꺼져 있습니다.');
}

/** True when the result carries nothing usable at all. */
function isEmptyScore(score: ParsedScore | undefined): boolean {
  if (!score) return true;
  // A confidently classified non-score page is useful even when it contains
  // neither requested field: the caller must still keep it out of 찬양 가사.
  if (score.pageType === 'non_score') return false;
  return (
    !score.sermonTitle &&
    !score.scripture &&
    !score.title &&
    !score.key &&
    score.order.length === 0 &&
    score.sections.length === 0
  );
}

/**
 * Recognize a set of score pages as one operation. Every model receives one
 * multimodal batch request at the same time; blank answers never claim a page.
 */
export async function recognizeScoreBatch(
  dataUrls: string[],
  settings: AiSettings,
  mode: BatchRecognitionMode,
  /** Optional per-image title hints (e.g. from the conti cover), advisory only. */
  hints?: (string | undefined)[],
  reliabilities: ModelReliability[] = [],
): Promise<BatchRecognitionResult> {
  return recognizeBatchWithAllModels(dataUrls, settings, mode, hints, reliabilities);
}

/**
 * Run every configured model on one score image at the same time and make
 * them work together: the highest-priority model that produced a usable
 * answer wins (a failed or empty higher model just yields to the next), and
 * whatever the winner missed is filled from the other models' answers.
 */
export async function recognizeScore(
  dataUrl: string,
  settings: AiSettings,
  /** Cut-off for every model's call; a model past it counts as failed. */
  timeoutMs: number = ATTEMPT_TIMEOUT_MS,
): Promise<RecognitionResult> {
  const attempts = planAttempts(settings);
  if (attempts.length === 0) {
    throw new Error('자동 인식이 꺼져 있습니다.');
  }

  return new Promise((resolve, reject) => {
    // undefined = still running, null = failed, ParsedScore = that model's answer.
    const answers: (ParsedScore | null | undefined)[] = new Array(attempts.length).fill(undefined);
    let finished = false;
    let lastError: Error | null = null;

    const tryFinish = () => {
      if (finished) return;
      for (let index = 0; index < attempts.length; index += 1) {
        const answer = answers[index];
        if (answer === undefined) return; // a higher-priority model may still answer
        if (answer && !isEmptyScore(answer)) {
          const others = answers.filter(
            (score, other): score is ParsedScore => other !== index && !!score && !isEmptyScore(score),
          );
          finished = true;
          resolve({ score: fillScoreGaps(answer, others), engine: attempts[index].engine });
          return;
        }
      }
      finished = true;
      reject(lastError || new Error('모든 인식 엔진이 실패했습니다.'));
    };

    const callMs = Math.min(timeoutMs, ATTEMPT_TIMEOUT_MS);
    const endsAt = Date.now() + callMs;
    attempts.forEach((attempt, index) => {
      void withAttemptTimeout(
        withRetry(() => recognizeWithEngine(attempt, dataUrl, settings), endsAt),
        callMs,
      )
        .then((score) => {
          answers[index] = score;
        })
        .catch((error) => {
          answers[index] = null;
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(`${attempt.engine} (${attempt.model}) 동시 인식 실패:`, lastError.message);
        })
        .finally(tryFinish);
    });
  });
}


/**
 * Start every model together and reconcile their answers page by page.
 *
 * Nothing is thrown away any more: every model's settled answer becomes an
 * observation, and buildWeightedConsensus decides each field by weighted vote
 * among them. Keeping the losing answers is what lets a later verified
 * correction score each model, and what lets two models outvote a third.
 *
 * The call waits for every model rather than finishing on the first usable
 * answer, because a vote needs the votes.
 */
async function recognizeBatchWithAllModels(
  dataUrls: string[],
  settings: AiSettings,
  mode: BatchRecognitionMode,
  hints?: (string | undefined)[],
  reliabilities: ModelReliability[] = [],
): Promise<BatchRecognitionResult> {
  if (dataUrls.length === 0) {
    return {
      scores: [],
      engine: settings.attempts[0]?.engine ?? 'off',
      observations: [],
      confidence: [],
      titleConfidence: [],
      needsReview: [],
    };
  }
  const attempts = planAttempts(settings);
  if (attempts.length === 0) throw new Error('자동 인식이 꺼져 있습니다.');

  const perModel = await Promise.all(
    attempts.map((attempt) => runBatchAttempt(attempt, dataUrls, settings, mode, hints)),
  );

  const assembled = assembleBatchConsensus(attempts, perModel, dataUrls.length, reliabilities);
  // An answer for no page at all is a failed job, not a job with empty pages:
  // the caller falls back to the per-page rescue pass rather than showing the
  // user a conti of blank songs.
  if (assembled.observations.every((page) => page.every((observation) => !observation.score))) {
    throw new Error('모든 인식 엔진이 실패했습니다.');
  }
  return assembled;
}

/** One model's whole batch: its answers, or the category of its failure. */
export interface BatchAttemptResult {
  attempt: RecognitionAttempt;
  scores?: ParsedScore[];
  error?: ReturnType<typeof classifyRecognitionError>;
  latencyMs: number;
}

export async function runBatchAttempt(
  attempt: RecognitionAttempt,
  dataUrls: string[],
  settings: AiSettings,
  mode: BatchRecognitionMode,
  hints?: (string | undefined)[],
  examples: PromptExample[] = [],
  /** Cut-off for this call; the job's deadline passes its stage's remaining time. */
  timeoutMs: number = ATTEMPT_TIMEOUT_MS,
  /**
   * Epoch ms after which a busy model is not tried again, when that should
   * come before the cut-off — so the time after it is left for other models.
   */
  retryUntil?: number,
): Promise<BatchAttemptResult> {
  const startedAt = Date.now();
  const callMs = Math.min(timeoutMs, ATTEMPT_TIMEOUT_MS);
  const endsAt = Math.min(startedAt + callMs, retryUntil ?? Infinity);
  try {
    const scores = await withAttemptTimeout(
      withRetry(() => recognizeBatchWithEngine(attempt, dataUrls, settings, mode, hints, examples), endsAt),
      callMs,
    );
    return { attempt, scores, latencyMs: Date.now() - startedAt };
  } catch (error) {
    const category = classifyRecognitionError(error);
    // Only the CATEGORY is kept. A provider body can echo the prompt back, and
    // the prompt carries lyrics.
    console.warn(`${attempt.engine} (${attempt.model}) 동시 일괄 인식 실패: ${category}`);
    return { attempt, error: category, latencyMs: Date.now() - startedAt };
  }
}

/** Turn per-model batch answers into per-page observations and consensus. */
export function assembleBatchConsensus(
  attempts: RecognitionAttempt[],
  perModel: BatchAttemptResult[],
  pageCount: number,
  reliabilities: ModelReliability[] = [],
): BatchRecognitionResult {
  const observations: RecognitionObservation[][] = [];
  const scores: ParsedScore[] = [];
  const confidence: number[] = [];
  const titleConfidence: number[] = [];
  const needsReview: boolean[] = [];
  const contributions = new Map<string, number>();

  for (let page = 0; page < pageCount; page += 1) {
    const pageObservations: RecognitionObservation[] = perModel.map((result) => {
      const score = result.scores?.[page];
      return {
        attempt: result.attempt,
        score: score && !isEmptyScore(score) ? score : undefined,
        error: result.scores ? (score && !isEmptyScore(score) ? undefined : 'format') : result.error,
        latencyMs: result.latencyMs,
      };
    });
    observations.push(pageObservations);

    const consensus = buildWeightedConsensus(pageObservations, reliabilities);
    scores.push(consensus.score);
    confidence.push(consensus.confidence);
    titleConfidence.push(consensus.fieldConfidence.title);
    needsReview.push(consensus.needsReview);
    for (const modelKey of consensus.usedModels) {
      contributions.set(modelKey, (contributions.get(modelKey) ?? 0) + 1);
    }
  }

  const leadKey = [...contributions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const engine =
    attempts.find((attempt) => modelKeyFor(attempt) === leadKey)?.engine ?? attempts[0]?.engine ?? 'off';

  return { scores, engine, observations, confidence, titleConfidence, needsReview };
}

/**
 * Compatibility name used by the full-lyrics flow. All models now launch in
 * one concurrent pool; there are no priority groups.
 */
export async function recognizeScoreBatchEnsemble(
  dataUrls: string[],
  settings: AiSettings,
  mode: BatchRecognitionMode,
  hints?: (string | undefined)[],
  reliabilities: ModelReliability[] = [],
): Promise<BatchRecognitionResult> {
  return recognizeBatchWithAllModels(dataUrls, settings, mode, hints, reliabilities);
}

/**
 * Compatibility name used by the rescue flow. All configured models start
 * together and cooperate on the answer (see recognizeScore).
 */
export async function recognizeScoreRaced(
  dataUrl: string,
  settings: AiSettings,
  timeoutMs?: number,
): Promise<RecognitionResult> {
  return recognizeScore(dataUrl, settings, timeoutMs);
}
