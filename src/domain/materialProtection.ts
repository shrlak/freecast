import type { Action } from './reducer';
import type { Library, Presentation } from './types';

export const PROTECTED_MESSAGE = '보호된 자료입니다. 내용을 수정·교체·삭제하려면 먼저 자료 보호를 해제해 주세요.';
export const isProtected = (p: Presentation | null | undefined): boolean => p?.protected === true;

function mediaReferences(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => mediaReferences(v, out));
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (/mediaId$/i.test(key) && typeof child === 'string') out.add(child);
    else mediaReferences(child, out);
  }
  return out;
}
export function protectedMediaIds(lib: Library): Set<string> {
  return mediaReferences(lib.presentations.filter(isProtected));
}

export function mergeProtectionChanges(...sources: (Library | null)[]): NonNullable<Library['protectionChanges']> {
  const changes = new Map<string, NonNullable<Library['protectionChanges']>[number]>();
  for (const lib of sources) {
    const inferred = (lib?.presentations ?? []).filter((p) => p.protected || p.protectionChangedAt).map((p) => ({ id: p.id, on: !!p.protected, at: p.protectionChangedAt ?? 0 }));
    for (const c of [...inferred, ...(lib?.protectionChanges ?? [])]) {
      const old = changes.get(c.id);
      if (!old || c.at > old.at || (c.at === old.at && c.on)) changes.set(c.id, c);
    }
  }
  return [...changes.values()];
}

/** Return a protected target's title for both the reducer guard and the operator's explanation. */
export function blockedProtectedAction(lib: Library, a: Action): string | undefined {
  const title = (p: Presentation | undefined) => p ? p.title || '제목 없는 필수 자료' : undefined;
  const direct = ['presentation/update', 'presentation/delete', 'slide/update', 'slide/delete', 'arrangement/upsert', 'arrangement/delete', 'arrangement/select', 'timeline/set'];
  if (direct.includes(a.type)) {
    const id = 'presentationId' in a ? a.presentationId : 'id' in a ? a.id : undefined;
    return title(lib.presentations.find((p) => p.id === id && isProtected(p)));
  }
  if (a.type === 'trash/restore') {
    const entry = lib.trash?.find((e) => e.id === a.id);
    if (entry?.kind === 'slides') return title(lib.presentations.find((p) => p.id === entry.presentation.id && isProtected(p)));
  }
  if (a.type === 'media/remove' || a.type === 'media/markers') return title(lib.presentations.find((p) => isProtected(p) && mediaReferences(p).has(a.id)));
  if (a.type === 'theme/delete' || a.type === 'theme/upsert') return title(lib.presentations.find((p) => isProtected(p) && p.themeId === (a.type === 'theme/delete' ? a.id : a.theme.id)));
}

/** Earlier sources are canonical when the same lock is shared by multiple devices. */
export function protectionWinners(...sources: (Library | null)[]): Map<string, Presentation> {
  const winners = new Map<string, Presentation>();
  for (const lib of sources) for (const p of lib?.presentations ?? []) {
    const old = winners.get(p.id);
    if (!old || (p.protectionChangedAt ?? 0) > (old.protectionChangedAt ?? 0)
      || ((p.protectionChangedAt ?? 0) === (old.protectionChangedAt ?? 0) && isProtected(p) && !isProtected(old))) winners.set(p.id, p);
  }
  const decisions = new Map(mergeProtectionChanges(...sources).map((c) => [c.id, c]));
  return new Map([...winners].filter(([id, p]) => isProtected(p) && decisions.get(id)?.on !== false));
}

/** Restore/merge cannot remove locked decks or their assets and theme; other library data can change. */
export function keepProtectedMaterials(next: Library, locked: Map<string, Presentation>, sources: Library[]): Library {
  if (!locked.size) return next;
  const present = new Set(next.presentations.map((p) => p.id));
  const presentations = [...next.presentations.map((p) => locked.get(p.id) ?? p), ...[...locked.values()].filter((p) => !present.has(p.id))];
  const needed = mediaReferences([...locked.values()]);
  const media = new Map(next.media.map((m) => [m.id, m]));
  const themes = new Map(next.themes.map((t) => [t.id, t]));
  for (const p of locked.values()) {
    const owner = sources.find((s) => s.presentations.includes(p));
    const theme = owner?.themes.find((t) => t.id === p.themeId);
    if (theme) themes.set(theme.id, theme);
    const references = mediaReferences(p);
    for (const m of owner?.media ?? []) if (references.has(m.id)) media.set(m.id, m);
  }
  for (const source of sources) for (const m of source.media) if (needed.has(m.id) && !media.has(m.id)) media.set(m.id, m);
  const decisions = new Map(mergeProtectionChanges(...sources, next).map((c) => [c.id, c]));
  for (const p of locked.values()) decisions.set(p.id, { id: p.id, on: true, at: p.protectionChangedAt ?? 0 });
  return { ...next, presentations, media: [...media.values()], themes: [...themes.values()], protectionChanges: [...decisions.values()] };
}
