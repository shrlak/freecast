import type { Library } from './types';
import type { Action } from './reducer';
import { referencedAssets, serviceDecks } from './serviceReadiness';

export interface SafeModeState { on: boolean; playlistId: string | null; at: number | null }
const KEY = 'freecast.safeMode';

export function loadSafeMode(): SafeModeState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && v.on === true) return { on: true, playlistId: typeof v.playlistId === 'string' ? v.playlistId : null, at: Number.isFinite(v.at) ? v.at : null };
  } catch { /* unreadable: safe mode is off */ }
  return { on: false, playlistId: null, at: null };
}
export function saveSafeMode(state: SafeModeState): void {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
}

/** What cannot be done while the service runs: deleting or replacing material, or emptying logs. */
const BLOCKED: Record<string, string> = {
  'presentation/delete': '자료 삭제', 'playlist/delete': '재생목록 삭제', 'slide/delete': '슬라이드 삭제', 'library/replace': '라이브러리 교체',
  'trash/purge': '휴지통 비우기', 'usage/clear': '사용기록 지우기', 'songs/dedupe': '중복 곡 정리', 'media/remove': '미디어 삭제', 'services/finish': '예배 정리',
};
export function safeModeBlock(state: SafeModeState, action: Action): string | null {
  return state.on ? BLOCKED[action.type] ?? null : null;
}

export interface MissingAsset { kind: 'media' | 'image'; id: string; name: string }
export interface BundleReport { playlistId: string | null; total: number; ready: number; downloaded: number; missing: MissingAsset[]; at: number }
export interface BundleDeps {
  hasMedia(id: string): Promise<boolean>;
  /** Download a media file from the church server into this computer. */
  fetchMedia(id: string): Promise<boolean>;
  /** Keep a built-in picture where it loads without internet. */
  cacheImage(url: string): Promise<boolean>;
}

/** Everything the service needs: the slides' media and pictures, the themes behind them, and the logo. */
export function bundleAssets(lib: Library, playlistId: string | null): { media: { id: string; name: string }[]; images: string[] } {
  const decks = serviceDecks(lib, playlistId);
  const themes = lib.themes.filter((t) => decks.some((d) => d.themeId === t.id));
  const found = referencedAssets([decks, themes, lib.logoMediaId ? { mediaId: lib.logoMediaId } : null]);
  return { media: found.media.map((id) => ({ id, name: lib.media.find((m) => m.id === id)?.name ?? id })), images: found.images };
}

/** Make sure every file of the service is on this computer, downloading what is missing; reports what still is not. */
export async function prepareBundle(lib: Library, playlistId: string | null, deps: BundleDeps, now: number, onProgress: (done: number, total: number) => void = () => undefined): Promise<BundleReport> {
  const { media, images } = bundleAssets(lib, playlistId);
  const total = media.length + images.length;
  const missing: MissingAsset[] = [];
  let ready = 0, downloaded = 0, done = 0;
  for (const m of media) {
    let ok = await deps.hasMedia(m.id).catch(() => false);
    if (!ok) {
      ok = await deps.fetchMedia(m.id).catch(() => false);
      if (ok) downloaded++;
    }
    if (ok) ready++; else missing.push({ kind: 'media', id: m.id, name: m.name });
    onProgress(++done, total);
  }
  for (const url of images) {
    if (await deps.cacheImage(url).catch(() => false)) ready++; else missing.push({ kind: 'image', id: url, name: url });
    onProgress(++done, total);
  }
  return { playlistId, total, ready, downloaded, missing, at: now };
}
