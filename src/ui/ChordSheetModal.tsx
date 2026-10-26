import { useMemo, useState, type Dispatch } from 'react';
import type { Action, AppState } from '../domain/reducer';
import type { Presentation } from '../domain/types';
import { activePlaylist } from '../domain/live';
import { isSong } from '../domain/templates/fill';
import {
  buildChart, capoOptions, chartText, hasSongChords, keyChoices, keyShift, packetHtml, parseKey, playKeyOf, songKey, type ChartSection, type PacketSong,
} from '../domain/chordChart';
import { printHtml } from './printHtml';

const CAPOS = Array.from({ length: 8 }, (_, i) => i);

function Chart({ sections }: { sections: ChartSection[] }) {
  return (
    <div className="chart">
      {sections.map((sec, i) => (
        <section key={i}>
          {sec.label && <h4>{sec.label}</h4>}
          {sec.lines.map((line, k) => (
            <div className="chart-line" key={k}>
              {line.segments.map((seg, n) => <span className="chart-seg" key={n}><span className="chart-chord">{seg.chord || ' '}</span><span className="chart-words">{seg.text || ' '}</span></span>)}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * 코드 · 키 악보: a song's key, BPM and capo; its chords in the key the team plays; Nashville numbers;
 * and a printable packet for the band. The key and capo set here also drive the stage display when the song comes on.
 */
export function ChordSheetModal({ state, dispatch, onClose, notify }: { state: AppState; dispatch: Dispatch<Action>; onClose: () => void; notify: (m: string) => void }) {
  const lib = state.library;
  const inService = useMemo(() => {
    const ids = new Set<string>();
    for (const item of activePlaylist(state)?.items ?? []) if (item.kind !== 'header') ids.add(item.presentationId);
    return ids;
  }, [state]);
  const all = useMemo(() => lib.presentations.filter((p) => isSong(p) || hasSongChords(p)), [lib.presentations]);
  const serviceSongs = useMemo(() => all.filter((p) => inService.has(p.id)), [all, inService]);
  const [onlyService, setOnlyService] = useState(serviceSongs.length > 0);
  const songs = onlyService ? serviceSongs : all;
  const [picked, setPicked] = useState<string | null>(state.selectedId);
  const song: Presentation | undefined = songs.find((p) => p.id === picked) ?? songs[0];
  const [numbers, setNumbers] = useState(false);
  const [editing, setEditing] = useState(false);

  const written = song ? songKey(song) : null;
  const play = song ? playKeyOf(song) : null;
  const capo = song?.meta?.capo ?? 0;
  const shift = written && play ? keyShift(written, play) ?? 0 : 0;
  const minor = parseKey(written)?.minor ?? false;
  const sections = useMemo(() => (song ? buildChart(song, { shift, capo, numbers }) : []), [song, shift, capo, numbers]);
  const withChords = song ? hasSongChords(song) : false;

  const meta = (patch: Partial<NonNullable<Presentation['meta']>>) => song && dispatch({ type: 'presentation/update', id: song.id, patch: { meta: { ...song.meta, ...patch } } });
  const setWritten = (key: string) => meta({ key });
  const setPlay = (key: string) => meta({ playKey: key === written ? undefined : key });

  const packetFor = (list: Presentation[]): PacketSong[] => list.filter(hasSongChords).map((p) => {
    const w = songKey(p), k = playKeyOf(p), c = p.meta?.capo ?? 0;
    return { title: p.title, key: w, playKey: k, bpm: p.meta?.tempo, capo: c, numbers, sections: buildChart(p, { shift: w && k ? keyShift(w, k) ?? 0 : 0, capo: c, numbers }) };
  });
  const print = (list: Presentation[], heading: string) => {
    const packet = packetFor(list);
    if (!packet.length) { notify('코드가 있는 곡이 없습니다'); return; }
    printHtml(packetHtml(packet, heading));
  };
  const copy = async () => {
    if (!song) return;
    try { await navigator.clipboard.writeText(`${song.title}\nKey ${play ?? '?'}${capo ? ` · Capo ${capo}` : ''}\n\n${chartText(sections)}`); notify('악보를 복사했습니다'); }
    catch { notify('복사하지 못했습니다'); }
  };
  const toStage = () => { dispatch({ type: 'live/chords', shift, capo }); notify(`무대 코드: ${play ?? '원래 키'}${capo ? ` · 카포 ${capo}` : ''}`); };
  const setSlideText = (slideId: string, text: string) => song && dispatch({ type: 'slide/update', presentationId: song.id, slideId, patch: { text } });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal wide chord-modal" role="dialog" aria-modal="true" aria-label="코드와 키 악보" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <header className="modal-head"><h2>🎼 코드 · 키 악보</h2><button autoFocus aria-label="닫기" onClick={onClose}>✕</button></header>
        <div className="chord-body">
          <aside className="chord-songs">
            <label className="row gap-xs small"><input type="checkbox" checked={onlyService} disabled={!serviceSongs.length} onChange={(e) => setOnlyService(e.target.checked)} /> 지금 예배 순서의 곡만 ({serviceSongs.length})</label>
            <div className="chord-song-list" role="listbox" aria-label="곡">
              {songs.map((p) => (
                <button key={p.id} role="option" aria-selected={p.id === song?.id} className={p.id === song?.id ? 'on' : ''} onClick={() => setPicked(p.id)}>
                  <span className="truncate">{p.title}</span>
                  <span className="muted small">{playKeyOf(p) ?? '—'}{hasSongChords(p) ? ' · ♪' : ''}</span>
                </button>
              ))}
              {!songs.length && <p className="empty">곡이 없습니다</p>}
            </div>
          </aside>
          <div className="chord-main">
            {song ? (
              <>
                <div className="chord-controls">
                  <label>원래 키
                    <select value={written ?? ''} onChange={(e) => setWritten(e.target.value)}>
                      {!written && <option value="">모름</option>}
                      {[...keyChoices(minor)].map((k) => <option key={k}>{k}</option>)}
                    </select>
                  </label>
                  <label>연주 키
                    <select value={play ?? ''} disabled={!written} onChange={(e) => setPlay(e.target.value)}>
                      {!play && <option value="">—</option>}
                      {keyChoices(minor).map((k) => <option key={k}>{k}</option>)}
                    </select>
                  </label>
                  <label>카포
                    <select value={capo} onChange={(e) => meta({ capo: Number(e.target.value) || undefined })}>{CAPOS.map((c) => <option key={c} value={c}>{c || '없음'}</option>)}</select>
                  </label>
                  <label>BPM
                    <input className="chord-bpm" inputMode="numeric" value={song.meta?.tempo ?? ''} onChange={(e) => meta({ tempo: e.target.value.replace(/[^\d]/g, '').slice(0, 3) || undefined })} />
                  </label>
                  <label className="row gap-xs"><input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} /> 숫자(넘버링)</label>
                </div>
                {play && <div className="chord-capos" aria-label="카포 위치 제안"><span className="muted small">카포 제안</span>
                  {capoOptions(play).map((o) => <button key={o.capo} className={`${o.capo === capo ? 'on' : ''} ${o.easy ? 'easy' : ''}`} title={`카포 ${o.capo} · ${o.shape} 폼${o.easy ? ' (쉬운 코드)' : ''}`} onClick={() => meta({ capo: o.capo || undefined })}>{o.capo || '없음'} <small>{o.shape}</small></button>)}
                </div>}
                <p className="hint">연주 키와 카포는 이 곡이 화면에 나올 때 무대(목사님·찬양팀) 화면의 코드에 자동으로 적용됩니다. {written && play && written !== play ? `(${written} → ${play}, ${shift > 0 ? '+' : ''}${shift})` : ''}</p>
                {withChords ? <Chart sections={sections} /> : <p className="empty">이 곡에는 아직 코드가 없습니다. 아래 “코드 입력”에서 가사 위에 [G] 처럼 입력하세요.</p>}
                <details open={editing || !withChords} onToggle={(e) => setEditing((e.target as HTMLDetailsElement).open)}>
                  <summary>코드 입력 · 수정</summary>
                  <p className="hint">코드는 대괄호로 가사 앞에 씁니다 — <code>[G]주 은혜임을 [D/F#]나 [Em]고백하네</code>. 청중 화면에는 코드가 나오지 않고, 무대 화면에만 보입니다.</p>
                  {song.slides.filter((s) => s.group !== 'Title').map((s) => (
                    <label key={s.id} className="stack small">{s.group || '슬라이드'}
                      <textarea rows={Math.max(2, s.text.split('\n').length)} defaultValue={s.text} onBlur={(e) => e.target.value !== s.text && setSlideText(s.id, e.target.value)} />
                    </label>
                  ))}
                </details>
              </>
            ) : <p className="empty">코드를 볼 곡을 고르세요</p>}
          </div>
        </div>
        <footer className="modal-foot">
          <span className="muted small grow">연주 키 · 카포 · BPM은 곡에 저장되고 다른 기기와 동기화됩니다</span>
          <button disabled={!song} onClick={toStage}>지금 무대에 적용</button>
          <button disabled={!song || !withChords} onClick={copy}>복사</button>
          <button disabled={!song || !withChords} onClick={() => song && print([song], song.title)}>이 곡 인쇄</button>
          <button className="primary" disabled={!serviceSongs.some(hasSongChords)} onClick={() => print(serviceSongs, `${activePlaylist(state)?.name ?? '예배'} · 밴드 악보`)}>예배 전체 인쇄 (밴드용)</button>
        </footer>
      </section>
    </div>
  );
}
