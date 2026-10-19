import { useRef, useState, type Dispatch } from 'react';
import type { Action, AppState } from '../domain/reducer';
import type { Background, MediaMeta } from '../domain/types';
import { BACKGROUND_PRESETS } from '../domain/defaults';
import { deleteMedia, forgetMediaUrl, putMedia } from '../domain/media';
import { uid } from '../domain/lyrics';
import { useMediaUrl } from './hooks';
import { assetUrl } from './SlideCanvas';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
}

const MAX_BYTES = 1024 * 1024 * 1024;

function sameBackground(a: Background | null | undefined, b: Background): boolean {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === 'media') return a.mediaId === (b as typeof a).mediaId;
  if (a.kind === 'camera') return a.deviceId === (b as typeof a).deviceId;
  if (a.kind === 'image') return a.url === (b as typeof a).url;
  return a.value === (b as typeof a).value;
}

function MediaThumb({ media }: { media: MediaMeta }) {
  const url = useMediaUrl(media.id);
  if (!url) return <div className="swatch-fill" />;
  return media.type === 'image' ? <img className="swatch-fill" src={url} alt="" /> : <video className="swatch-fill" src={url} muted preload="metadata" />;
}

export function MediaBin({ state, dispatch }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [cameras, setCameras] = useState<{ deviceId: string; label: string }[]>([]);
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  const selected = state.library.presentations.find((p) => p.id === state.selectedId);

  const add = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      const type = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
      if (!type || file.size > MAX_BYTES) continue;
      const id = uid('m');
      await putMedia(id, file);
      dispatch({ type: 'media/add', media: { id, name: file.name, type } });
    }
    if (input.current) input.current.value = '';
  };

  const findCameras = async () => {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true });
      probe.getTracks().forEach((t) => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === 'videoinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` })));
    } catch (e) {
      alert(`Camera unavailable: ${(e as Error).message}`);
    }
  };

  const remove = async (m: MediaMeta) => {
    if (!confirm(`Remove “${m.name}” from the media bin?`)) return;
    dispatch({ type: 'media/remove', id: m.id });
    forgetMediaUrl(m.id);
    await deleteMedia(m.id);
  };

  const items: { key: string; name: string; background: Background; media?: MediaMeta }[] = [
    ...BACKGROUND_PRESETS.map((p) => ({ key: p.name, name: p.name, background: p.background })),
    ...cameras.map((c) => ({ key: c.deviceId, name: c.label, background: { kind: 'camera', deviceId: c.deviceId, label: c.label } as Background })),
    ...state.library.media.filter((m) => m.type !== 'audio').map((m) => ({
      key: m.id, name: m.name, media: m,
      background: { kind: 'media', mediaId: m.id, mediaType: m.type === 'video' ? 'video' : 'image', fit } as Background,
    })),
  ];

  return (
    <section className="panel media-bin">
      <div className="section-head">
        <h2>Backgrounds</h2>
        <span className="muted small grow right">Click: live · 📌: attach to “{selected?.title ?? '—'}”</span>
        <select value={fit} onChange={(e) => setFit(e.target.value as 'cover' | 'contain')} title="How images and videos fit the screen">
          <option value="cover">Fill</option><option value="contain">Fit</option>
        </select>
        <button onClick={findCameras} title="Live camera / capture card input">📷 Cameras</button>
        <button onClick={() => input.current?.click()}>＋ Image / video</button>
        <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => add(e.target.files)} />
      </div>
      <div className="swatches">
        {items.map((it) => (
          <div key={it.key} className={`swatch ${sameBackground(state.live.background, it.background) ? 'live' : ''}`}>
            <button className="swatch-main" title={it.name} onClick={() => dispatch({ type: 'live/background', background: it.background })}>
              {it.media ? <MediaThumb media={it.media} /> : it.background.kind === 'camera' ? <div className="swatch-fill camera-swatch">📷</div> : it.background.kind === 'image' ? <img className="swatch-fill" src={assetUrl(it.background.url)} alt="" loading="lazy" /> : (
                <div className="swatch-fill" style={it.background.kind === 'color' ? { background: it.background.value } : { backgroundImage: (it.background as { value: string }).value }} />
              )}
              <span className="swatch-name truncate">{it.media?.type === 'video' ? '▶ ' : ''}{it.name}</span>
            </button>
            <div className="swatch-actions">
              {it.background.kind !== 'camera' && (
                <button className="mini-btn" title="Pin as presentation background" disabled={!selected}
                  onClick={() => selected && dispatch({ type: 'presentation/update', id: selected.id, patch: { background: it.background } })}>📌</button>
              )}
              {it.media?.type === 'image' && (
                <button className={`mini-btn ${state.library.logoMediaId === it.media.id ? 'active' : ''}`} title="Use as the logo screen (L)"
                  onClick={() => dispatch({ type: 'library/logo', mediaId: state.library.logoMediaId === it.media!.id ? null : it.media!.id })}>L</button>
              )}
              {it.media && <button className="mini-btn" title="Remove" onClick={() => remove(it.media!)}>✕</button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
