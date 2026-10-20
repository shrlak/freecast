import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ATTEMPT_ORDER,
  DEFAULT_CONFESSION_SONG,
  DEFAULT_EXCLUDED_TITLES,
  SETTINGS_DEFAULTS_VERSION,
  RECOGNITION_MODEL_CATALOG,
  attemptKey,
  findModelInfo,
  getAiSettings,
  isFreeVisionCatalogEntry,
  migrateEngineName,
  sanitizeAttemptOrder,
  sanitizeExcludedTitles,
  sanitizeConfessionSong,
  sanitizeSharedSettings,
} from '../../../src/domain/recognition/ai/aiSettings';

describe('recognition model catalog', () => {
  it('has a unique, stable concurrent model catalog', () => {
    const keys = RECOGNITION_MODEL_CATALOG.map(attemptKey);
    expect(new Set(keys).size).toBe(keys.length);
    // Stable display order starts with the benchmark-validated Flash model.
    expect(RECOGNITION_MODEL_CATALOG[0]).toMatchObject({ engine: 'gemini', model: 'gemini-3.6-flash' });
    // Multiple providers and multiple models per provider are available.
    expect(RECOGNITION_MODEL_CATALOG.filter((entry) => entry.engine === 'gemini').length).toBeGreaterThan(1);
    expect(RECOGNITION_MODEL_CATALOG.filter((entry) => entry.engine === 'openrouter').length).toBeGreaterThan(1);
  });

  it('registers three initial champions and free challengers', () => {
    expect(RECOGNITION_MODEL_CATALOG.filter((model) => model.role === 'champion')).toHaveLength(3);
    expect(RECOGNITION_MODEL_CATALOG.filter((model) => model.role === 'challenger').length).toBeGreaterThanOrEqual(2);
    expect(
      RECOGNITION_MODEL_CATALOG.filter((model) => model.engine === 'openrouter').every((model) =>
        model.upstreamModel.endsWith(':free'),
      ),
    ).toBe(true);
    expect(RECOGNITION_MODEL_CATALOG.every(isFreeVisionCatalogEntry)).toBe(true);
  });

  it('leaves out the free Gemma variant the benchmark already rejected', () => {
    expect(RECOGNITION_MODEL_CATALOG.map((entry) => entry.model)).not.toContain(
      'google/gemma-4-26b-a4b-it:free',
    );
  });

  it('keeps a Gemini Flash-Lite among the champions, so a Flash-wide 503 spike still leaves a reader', () => {
    const champions = RECOGNITION_MODEL_CATALOG.filter((entry) => entry.role === 'champion').map((entry) => entry.model);
    expect(champions).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']);
    expect(RECOGNITION_MODEL_CATALOG.some((entry) => entry.model === 'nvidia/nemotron-nano-12b-v2-vl')).toBe(false);
  });
});

describe('migrateEngineName', () => {
  it('maps the legacy nvidia lane onto openrouter and rejects anything else', () => {
    expect(migrateEngineName('nvidia')).toBe('openrouter');
    expect(migrateEngineName('openrouter')).toBe('openrouter');
    expect(migrateEngineName('gemini')).toBe('gemini');
    expect(migrateEngineName('off')).toBeUndefined();
    expect(migrateEngineName(undefined)).toBeUndefined();
  });

  it('still resolves catalog info for a stored legacy attempt', () => {
    expect(
      findModelInfo({
        engine: 'nvidia' as 'openrouter',
        model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      })?.role,
    ).toBe('challenger');
  });
});

describe('sanitizeAttemptOrder', () => {
  it('migrates the legacy nvidia engine without changing its model', () => {
    const order = sanitizeAttemptOrder([
      { engine: 'nvidia', model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free' },
    ]);
    expect(order).toContainEqual({
      engine: 'openrouter',
      model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    });
  });

  it('keeps a valid custom order and appends the missing catalog models', () => {
    const custom = [
      { engine: 'openrouter', model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free' },
      { engine: 'gemini', model: 'gemini-3.6-flash' },
    ];
    const order = sanitizeAttemptOrder(custom);
    expect(order.slice(0, 2)).toEqual(custom);
    expect(order).toHaveLength(DEFAULT_ATTEMPT_ORDER.length);
    expect(new Set(order.map(attemptKey)).size).toBe(order.length);
  });

  it('drops unknown models and duplicates', () => {
    const order = sanitizeAttemptOrder([
      { engine: 'gemini', model: 'made-up-model' },
      { engine: 'gemini', model: 'gemini-2.5-pro' },
      { engine: 'gemini', model: 'gemini-3.5-flash' },
      { engine: 'gemini', model: 'gemini-3.5-flash' },
    ]);
    expect(order.filter((attempt) => attempt.model === 'gemini-3.5-flash')).toHaveLength(1);
    expect(order.some((attempt) => attempt.model === 'made-up-model' || attempt.model === 'gemini-2.5-pro')).toBe(false);
    expect(order).toHaveLength(DEFAULT_ATTEMPT_ORDER.length);
  });

  it('expands legacy plain-engine entries into that engine’s catalog models', () => {
    const order = sanitizeAttemptOrder(['nvidia', 'gemini']);
    expect(order[0].engine).toBe('openrouter');
    const firstGemini = order.findIndex((attempt) => attempt.engine === 'gemini');
    const openRouterCount = RECOGNITION_MODEL_CATALOG.filter((entry) => entry.engine === 'openrouter').length;
    expect(firstGemini).toBe(openRouterCount);
  });

  it('falls back to the default order for non-array input', () => {
    expect(sanitizeAttemptOrder(null)).toEqual(DEFAULT_ATTEMPT_ORDER);
    expect(sanitizeAttemptOrder('gemini')).toEqual(DEFAULT_ATTEMPT_ORDER);
  });
});

describe('sanitizeExcludedTitles', () => {
  it('trims, dedupes (spacing/case-insensitively), and drops blanks', () => {
    expect(sanitizeExcludedTitles([' 공동체 고백송 ', '공동체고백송', '', '  ', '예배 전 준비 찬양'])).toEqual([
      '공동체 고백송',
      '예배 전 준비 찬양',
    ]);
  });

  it('defaults when the stored value is not a list', () => {
    expect(sanitizeExcludedTitles(undefined)).toEqual(DEFAULT_EXCLUDED_TITLES);
  });

  it('accepts an explicitly empty list (admin cleared it)', () => {
    expect(sanitizeExcludedTitles([])).toEqual([]);
  });
});

describe('sanitizeConfessionSong', () => {
  it('trims the title and keeps it as typed otherwise', () => {
    expect(sanitizeConfessionSong('  나의 반석이신 하나님 ')).toBe('나의 반석이신 하나님');
  });

  it('defaults when the stored value is not a string', () => {
    expect(sanitizeConfessionSong(undefined)).toBe(DEFAULT_CONFESSION_SONG);
    expect(sanitizeConfessionSong(42)).toBe(DEFAULT_CONFESSION_SONG);
  });

  it('keeps an explicitly blank title (leave the back slides alone)', () => {
    expect(sanitizeConfessionSong('   ')).toBe('');
  });

  it('defaults to 우리는 주의 움직이는 교회', () => {
    expect(DEFAULT_CONFESSION_SONG).toBe('우리는 주의 움직이는 교회');
  });

  it('moves settings saved under the old default to the new one, once', () => {
    // Saved before version 2: Celebrate the Light was there only as the default.
    expect(sanitizeSharedSettings({ confessionSong: 'Celebrate the Light' }).confessionSong).toBe(
      DEFAULT_CONFESSION_SONG,
    );
    // Any other song an administrator chose is kept.
    expect(sanitizeSharedSettings({ confessionSong: '주 은혜임을' }).confessionSong).toBe('주 은혜임을');
    // Chosen again after the change, Celebrate the Light stays.
    expect(
      sanitizeSharedSettings({ confessionSong: 'Celebrate the Light', defaultsVersion: SETTINGS_DEFAULTS_VERSION })
        .confessionSong,
    ).toBe('Celebrate the Light');
  });
});

describe('the default 설교 후 찬양', () => {
  it('is 영접송, and can be changed or cleared', () => {
    expect(sanitizeSharedSettings({}).postSermonSong).toBe('영접송');
    expect(sanitizeSharedSettings({ postSermonSong: ' 축복하노라 ' }).postSermonSong).toBe('축복하노라');
    expect(sanitizeSharedSettings({ postSermonSong: '' }).postSermonSong).toBe('');
  });
});

describe('recognition settings without storage (node)', () => {
  it('defaults to the full catalog order and default exclusions', () => {
    const settings = getAiSettings();
    expect(settings.attempts).toEqual(DEFAULT_ATTEMPT_ORDER);
    expect(settings.excludedTitles).toEqual(DEFAULT_EXCLUDED_TITLES);
    expect(settings.confessionSong).toBe(DEFAULT_CONFESSION_SONG);
    expect(settings.attempts[0]).toEqual({ engine: 'gemini', model: 'gemini-3.6-flash' });
  });
});
