/**
 * Features that ship switched off. They stay out of the menus until someone turns them on in
 * 설정 → 일반 → 실험 기능, and the choice is kept on this computer only.
 */
export type FeatureId = 'templateMarket';

export const FEATURES: { id: FeatureId; label: string; detail: string }[] = [
  { id: 'templateMarket', label: '슬라이드 템플릿 마켓', detail: 'Front/Back, 수련회 같은 디자인을 파일로 내보내고, 다른 교회·청년부의 템플릿을 가져옵니다.' },
];

const KEY = 'freecast.features';

export function loadFeatures(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Partial<Record<FeatureId, boolean>> {
  try {
    const value = JSON.parse(storage?.getItem(KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(FEATURES.filter((f) => value[f.id] === true).map((f) => [f.id, true])) : {};
  } catch {
    return {};
  }
}

export const featureEnabled = (id: FeatureId, storage?: Pick<Storage, 'getItem'>): boolean => loadFeatures(storage)[id] === true;

export function setFeature(id: FeatureId, on: boolean, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ ...loadFeatures(storage), [id]: on }));
  } catch {
    // storage blocked: the feature simply stays off
  }
}

function safeStorage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}
