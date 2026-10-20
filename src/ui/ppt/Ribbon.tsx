import { useRef, useState, type Dispatch, type ReactNode } from 'react';
import type { Action, AppState } from '../../domain/reducer';
import type { Background, Presentation, Slide, SlideElement, TransitionKind } from '../../domain/types';
import { BACKGROUND_PRESETS, presetBackground, DEFAULT_CONFESSION_SONG } from '../../domain/defaults';
import { putMedia } from '../../domain/media';
import { uid } from '../../domain/lyrics';
import { SlideCanvas, assetUrl } from '../SlideCanvas';
import { Recorder } from '../Recorder';
import { openOutput } from '../LivePanel';
import { useMediaUrl } from '../hooks';
import { ACCEPT, type Commands } from './commands';
import { isSong } from '../../domain/templates/fill';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  cmd: Commands;
  presentation: Presentation | null;
  slide: Slide | null;
  onDesign: () => void;
}

const TABS = ['파일', '홈', '삽입', '디자인', '전환', '슬라이드 쇼', '예배', '보기'] as const;
type Tab = (typeof TABS)[number];

function Big({ icon, label, onClick, disabled, active, title }: { icon: ReactNode; label: string; onClick?: () => void; disabled?: boolean; active?: boolean; title?: string }) {
  return (
    <button className={`rb-big ${active ? 'on' : ''}`} onClick={onClick} disabled={disabled} title={title ?? label}>
      <span className="rb-icon">{icon}</span>
      <span className="rb-label">{label}</span>
    </button>
  );
}

function Small({ icon, label, onClick, disabled, active }: { icon: ReactNode; label: string; onClick?: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button className={`rb-small ${active ? 'on' : ''}`} onClick={onClick} disabled={disabled}>
      <span className="rb-icon-s">{icon}</span>{label}
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rb-group">
      <div className="rb-items">{children}</div>
      <div className="rb-group-label">{label}</div>
    </div>
  );
}

function MediaSwatch({ id, video }: { id: string; video: boolean }) {
  const url = useMediaUrl(id);
  if (!url) return <span className="rb-swatch-fill" />;
  return video ? <video className="rb-swatch-fill" src={url} muted /> : <img className="rb-swatch-fill" src={url} alt="" />;
}

/** PowerPoint-style ribbon. */
export function Ribbon({ state, dispatch, cmd, presentation: p, slide, onDesign }: Props) {
  const [tab, setTab] = useState<Tab>('홈');
  const [thisSlideOnly, setThisSlideOnly] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const uploadKind = useRef<'conti' | 'lyrics' | 'sermon'>('conti');
  const { service } = cmd;
  const busy = service.busy;
  const working = !!busy && !busy.startsWith('✓');
  const upload = (kind: 'conti' | 'lyrics' | 'sermon') => {
    uploadKind.current = kind;
    const input = uploadRef.current!;
    input.accept = kind === 'conti' ? 'application/pdf,.pdf' : kind === 'lyrics' ? ACCEPT.lyrics : '.pptx,.pdf,image/*';
    input.multiple = kind !== 'conti';
    input.click();
  };
  const onUpload = (files: File[]) => {
    if (!files.length) return;
    cmd.setSlideId(null);
    if (uploadKind.current === 'conti') service.conti(files[0]);
    else if (uploadKind.current === 'lyrics') service.lyrics(files);
    else service.sermon(files);
  };
  const contiButton = <Big icon="🎼" label="콘티 업로드" title="콘티 PDF를 올리면 이번 주 주일예배의 찬양 순서에 바로 들어갑니다" disabled={working} onClick={() => upload('conti')} />;
  const insertKind = useRef<'image' | 'video'>('image');
  const lib = state.library;

  const updatePres = (patch: Partial<Presentation>) => p && dispatch({ type: 'presentation/update', id: p.id, patch });
  const updateSlide = (patch: Partial<Slide>) => p && slide && dispatch({ type: 'slide/update', presentationId: p.id, slideId: slide.id, patch });

  const addSlide = (copy: boolean) => {
    if (!p) return;
    const i = slide ? p.slides.findIndex((s) => s.id === slide.id) : p.slides.length - 1;
    const base = copy && slide ? { ...slide, id: uid('s') } : { id: uid('s'), group: slide?.group ?? 'Slide', text: '' };
    const slides = [...p.slides];
    slides.splice(i + 1, 0, base);
    updatePres({ slides });
    cmd.setSlideId(base.id);
  };
  const deleteSlide = () => {
    if (!p || !slide) return;
    const i = p.slides.findIndex((s) => s.id === slide.id);
    const slides = p.slides.filter((s) => s.id !== slide.id);
    updatePres({ slides });
    cmd.setSlideId(slides[Math.max(0, i - 1)]?.id ?? null);
  };

  const addElement = (el: Omit<SlideElement, 'id'>) => {
    if (!p || !slide) return cmd.notify('먼저 슬라이드를 선택하세요');
    updateSlide({ elements: [...(slide.elements ?? []), { id: uid('el'), ...el }] });
    onDesign();
  };
  const insertMedia = async (file: File | undefined) => {
    if (!file) return;
    const id = uid('m');
    const kind = insertKind.current;
    await putMedia(id, file);
    dispatch({ type: 'media/add', media: { id, name: file.name, type: kind } });
    addElement({ kind, mediaId: id, fit: kind === 'video' ? 'cover' : 'contain', x: 220, y: 240, w: 1000, h: 600 });
    if (fileRef.current) fileRef.current.value = '';
  };

  const applyBackground = (bg: Background | undefined) => (thisSlideOnly ? updateSlide({ background: bg }) : updatePres({ background: bg }));
  const transition = slide?.transition ?? p?.transition;
  const setTransition = (kind: TransitionKind) => {
    const t = { kind, duration: transition?.duration ?? 400 };
    if (thisSlideOnly) updateSlide({ transition: t });
    else updatePres({ transition: t });
  };
  const sample: Slide = { id: 'sample', group: '', text: '가나다\nAaBb' };

  return (
    <div className="ribbon">
      <div className="rb-tabs">
        <img className="rb-logo" src="/favicon.png" alt="KCCP" title="Korean Central Church of Pittsburgh · FreeCast" />
        {TABS.map((t) => (
          <button key={t} className={`rb-tab ${t === tab ? 'on' : ''} ${t === '파일' ? 'file' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
        <span className="rb-spacer" />
        {busy && <span className="rb-busy">{busy}</span>}
        <button className="rb-account" onClick={() => cmd.open('account')} title="교회 클라우드 라이브러리">
          {cmd.cloud.session ? `☁ ${cmd.cloud.session.username}${cmd.cloud.state === 'syncing' ? ' ⟳' : cmd.cloud.state === 'error' ? ' ⚠' : ' ✓'}` : '☁ 로그인'}
        </button>
        <button className="rb-present" disabled={!p} title="지금 편집 중인 슬라이드부터 발표 (Shift+F5) — 처음부터는 F5" onClick={() => cmd.startShow(true)}>▶ 발표</button>
        <input ref={uploadRef} type="file" hidden onChange={(e) => { onUpload(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </div>
      <div className="rb-body">
        {tab === '파일' && (
          <>
            <Group label="가져오기">
              <Big icon="📊" label="PowerPoint · PDF · 그림" onClick={() => cmd.pickFiles('slides', ACCEPT.slides)} />
              <Big icon="🎵" label="찬양 파일" title="Text, Markdown, ProPresenter 6, ChordPro, OpenLyrics, OpenSong" onClick={() => cmd.pickFiles('lyrics', ACCEPT.lyrics)} />
              <Big icon="🗂" label="백업 복원" onClick={() => cmd.pickFiles('backup', ACCEPT.backup)} />
              <Big icon="{ }" label="라이브러리 JSON" onClick={() => cmd.pickFiles('library', ACCEPT.library)} />
            </Group>
            <Group label="내보내기">
              <Big icon="⇩" label="재생목록 PPTX" onClick={cmd.exportPlaylistPptx} />
              <Big icon="🗜" label="전체 백업 (.zip)" onClick={cmd.exportBackup} />
              <Big icon="{ }" label="라이브러리만" onClick={cmd.exportLibrary} />
            </Group>
            <Group label="CCLI">
              <Big icon="📈" label={`사용 기록 (${lib.usage.length})`} onClick={cmd.exportUsage} />
              <Small icon="🧹" label="기록 지우기" onClick={cmd.clearUsage} />
            </Group>
            <Group label="계정">
              <Big icon="☁" label={cmd.cloud.session ? `${cmd.cloud.session.username} · 동기화` : '로그인 · 클라우드'} onClick={() => cmd.open('account')} />
            </Group>
            <Group label="설정">
              <Big icon="🖥" label="화면 · 설정" onClick={() => cmd.open('screens')} />
            </Group>
            <Group label="도움">
              <Big icon="💬" label="피드백 보내기" title="고칠 점·원하는 기능을 개발자에게 보냅니다 — 반영되면 자동 업데이트" onClick={() => cmd.open('feedback')} />
            </Group>
          </>
        )}
        {tab === '홈' && (
          <>
            <Group label="실행 취소">
              <Small icon="↶" label="실행 취소" disabled={!state.past.length} onClick={() => dispatch({ type: 'undo' })} />
              <Small icon="↷" label="다시 실행" disabled={!state.future.length} onClick={() => dispatch({ type: 'redo' })} />
            </Group>
            <Group label="콘티">{contiButton}</Group>
            <Group label="슬라이드">
              <Big icon="＋" label="새 슬라이드" disabled={!p} onClick={() => addSlide(false)} />
              <div className="rb-col">
                <Small icon="⧉" label="복제" disabled={!slide} onClick={() => addSlide(true)} />
                <Small icon="🗑" label="삭제" disabled={!slide} onClick={deleteSlide} />
                <Small icon="⏭" label={slide?.disabled ? '숨기기 해제' : '숨기기'} disabled={!slide} onClick={() => updateSlide({ disabled: slide?.disabled ? undefined : true })} />
              </div>
            </Group>
            <Group label="프레젠테이션">
              <Big icon="📄" label="새로 만들기" onClick={() => cmd.open('new')} />
              <div className="rb-col">
                <Small icon="✎" label="텍스트 편집" disabled={!p} onClick={() => cmd.open('edit')} />
                <Small icon="✏️" label="개체 편집" disabled={!slide} onClick={onDesign} />
                <Small icon="📋" label="재생목록에 추가" disabled={!p} onClick={() => p && dispatch({ type: 'playlist/addItem', item: { id: uid('pli'), presentationId: p.id } })} />
              </div>
            </Group>
            <Group label="편집">
              <Small icon="🔎" label="찾기 (⌘/Ctrl+F)" onClick={() => { const b = document.getElementById('library-search') as HTMLInputElement | null; b?.focus(); }} />
              <Small icon="⟲" label={p?.loop ? '반복 해제' : '반복 재생'} disabled={!p} active={!!p?.loop} onClick={() => updatePres({ loop: !p?.loop })} />
            </Group>
            <Group label="도구">
              <Big icon="📖" label="성경" onClick={() => cmd.open('bible')} />
              <Big icon="✨" label="AI" onClick={() => cmd.open('ai')} />
            </Group>
          </>
        )}
        {tab === '삽입' && (
          <>
            <Group label="슬라이드">
              <Big icon="＋" label="새 슬라이드" disabled={!p} onClick={() => addSlide(false)} />
              <Big icon="🎵" label="찬양 가사" onClick={() => cmd.open('new')} />
              <Big icon="📖" label="성경 구절" onClick={() => cmd.open('bible')} />
            </Group>
            <Group label="개체">
              <Big icon="T" label="텍스트 상자" disabled={!slide} onClick={() => addElement({ kind: 'text', text: '텍스트', x: 320, y: 440, w: 800, h: 200, fontSize: 80, color: '#ffffff', bold: true, shadow: true, align: 'center' })} />
              <Big icon="🖼" label="그림" disabled={!slide} onClick={() => { insertKind.current = 'image'; if (fileRef.current) { fileRef.current.accept = 'image/*'; fileRef.current.click(); } }} />
              <Big icon="🎬" label="비디오" disabled={!slide} onClick={() => { insertKind.current = 'video'; if (fileRef.current) { fileRef.current.accept = 'video/*'; fileRef.current.click(); } }} />
              <Big icon="⬛" label="도형" disabled={!slide} onClick={() => addElement({ kind: 'shape', fill: 'rgba(0,0,0,0.55)', radius: 24, x: 100, y: 820, w: 1240, h: 200 })} />
              <Big icon="⚪" label="원" disabled={!slide} onClick={() => addElement({ kind: 'shape', fill: '#4bc789', ellipse: true, x: 570, y: 390, w: 300, h: 300 })} />
              <Big icon="📷" label="카메라" disabled={!slide} onClick={() => addElement({ kind: 'camera', deviceId: '', x: 320, y: 315, w: 800, h: 450 })} />
            </Group>
            <Group label="텍스트">
              <Small icon="🕒" label="현재 시각 {time}" disabled={!slide} onClick={() => updateSlide({ text: `${slide?.text ? `${slide.text}\n` : ''}{time}` })} />
              <Small icon="📅" label="날짜 {date}" disabled={!slide} onClick={() => updateSlide({ text: `${slide?.text ? `${slide.text}\n` : ''}{date}` })} />
              <Small icon="⏱" label="타이머" disabled={!slide || !lib.timers.length} onClick={() => updateSlide({ text: `${slide?.text ? `${slide.text}\n` : ''}{timer:${lib.timers[0]?.name}}` })} />
            </Group>
            <input ref={fileRef} type="file" hidden onChange={(e) => insertMedia(e.target.files?.[0])} />
          </>
        )}
        {tab === '디자인' && (
          <>
            <Group label="테마">
              <div className="rb-gallery">
                {lib.themes.map((t) => (
                  <button key={t.id} className={`rb-theme ${p?.themeId === t.id ? 'on' : ''}`} title={t.name} disabled={!p} onClick={() => updatePres({ themeId: t.id })}>
                    <SlideCanvas slide={sample} theme={t} background={p?.background ?? presetBackground('KCCP Navy')} />
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
              <Small icon="Aa" label="테마 편집" onClick={() => cmd.open('themes')} />
            </Group>
            <Group label="배경 서식">
              <div className="rb-gallery">
                {BACKGROUND_PRESETS.map((b) => (
                  <button key={b.name} className="rb-swatch" title={b.name} disabled={!p} onClick={() => applyBackground(b.background)}>
                    {b.background.kind === 'image' ? <img className="rb-swatch-fill" src={assetUrl(b.background.url)} alt="" />
                      : <span className="rb-swatch-fill" style={b.background.kind === 'color' ? { background: b.background.value } : { backgroundImage: (b.background as { value: string }).value }} />}
                  </button>
                ))}
                {lib.media.filter((m) => m.type !== 'audio').map((m) => (
                  <button key={m.id} className="rb-swatch" title={m.name} disabled={!p}
                    onClick={() => applyBackground({ kind: 'media', mediaId: m.id, mediaType: m.type === 'video' ? 'video' : 'image' })}>
                    <MediaSwatch id={m.id} video={m.type === 'video'} />
                  </button>
                ))}
              </div>
              <div className="rb-col">
                <label className="rb-check"><input type="checkbox" checked={thisSlideOnly} onChange={(e) => setThisSlideOnly(e.target.checked)} /> 이 슬라이드만</label>
                <Small icon="✕" label="배경 지우기" disabled={!p} onClick={() => applyBackground(undefined)} />
              </div>
            </Group>
            <Group label="배경 효과">
              <label className="rb-range">어둡게 <input type="range" min={0} max={0.9} step={0.05} disabled={!p} value={p?.bgEffect?.dim ?? 0} onChange={(e) => updatePres({ bgEffect: { dim: Number(e.target.value), blur: p?.bgEffect?.blur ?? 0 } })} /></label>
              <label className="rb-range">흐리게 <input type="range" min={0} max={40} disabled={!p} value={p?.bgEffect?.blur ?? 0} onChange={(e) => updatePres({ bgEffect: { dim: p?.bgEffect?.dim ?? 0, blur: Number(e.target.value) } })} /></label>
            </Group>
          </>
        )}
        {tab === '전환' && (
          <>
            <Group label="화면 전환">
              {(['cut', 'fade', 'slide', 'zoom'] as TransitionKind[]).map((k) => (
                <Big key={k} icon={{ cut: '▮', fade: '◐', slide: '⇥', zoom: '⤢' }[k]} label={{ cut: '없음', fade: '페이드', slide: '밀어내기', zoom: '확대' }[k]}
                  active={(transition?.kind ?? 'fade') === k} disabled={!p} onClick={() => setTransition(k)} />
              ))}
            </Group>
            <Group label="타이밍">
              <label className="rb-range">기간 (ms) <input type="number" min={0} max={3000} step={100} disabled={!p} value={transition?.duration ?? 400}
                onChange={(e) => { const t = { kind: transition?.kind ?? 'fade', duration: Number(e.target.value) }; if (thisSlideOnly) updateSlide({ transition: t }); else updatePres({ transition: t }); }} /></label>
              <label className="rb-range">자동 넘김 (초) <input type="number" min={0} disabled={!slide} value={slide?.autoAdvance ?? ''}
                onChange={(e) => updateSlide({ autoAdvance: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })} /></label>
              <label className="rb-check"><input type="checkbox" checked={thisSlideOnly} onChange={(e) => setThisSlideOnly(e.target.checked)} /> 이 슬라이드만</label>
            </Group>
          </>
        )}
        {tab === '슬라이드 쇼' && (
          <>
            <Group label="슬라이드 쇼 시작">
              <Big icon="▶" label="처음부터 (F5)" disabled={!p} onClick={() => cmd.startShow(false)} />
              <Big icon="⏵" label="현재 슬라이드부터" disabled={!slide} onClick={() => cmd.startShow(true)} />
              <Big icon="■" label="쇼 마침 (Esc)" disabled={cmd.view !== 'presenter'} onClick={cmd.endShow} />
            </Group>
            <Group label="모니터">
              <Big icon="🧑‍🏫" label="발표자 보기" active={cmd.view === 'presenter'} onClick={() => cmd.setView('presenter')} />
              <Big icon="🖵" label="청중 화면" onClick={() => openOutput('output')} />
              <Big icon="🎤" label="무대 화면" onClick={() => openOutput('stage')} />
              <Big icon="▦" label="멀티뷰" onClick={() => window.open(`${location.origin}/?view=multiview`, 'freecast-multiview', 'popup,width=1280,height=760')} />
              <Big icon="⚙" label="화면 설정" onClick={() => cmd.open('screens')} />
            </Group>
            <Group label="화면">
              <Small icon="■" label="검은 화면 (B)" active={state.live.black} onClick={() => dispatch({ type: 'live/toggleBlack' })} />
              <Small icon="◆" label="로고 (L)" active={state.live.logo} onClick={() => dispatch({ type: 'live/logo' })} />
              <Small icon="✕" label="모두 지우기" onClick={() => dispatch({ type: 'live/clearAll' })} />
            </Group>
            <Group label="녹화"><Recorder /></Group>
          </>
        )}
        {tab === '예배' && (
          <>
            <Group label="이번 주 예배 (바로 반영)">
              <Big icon="⛪" label="예배 열기" title="이번 주 주일예배를 교회 템플릿으로 엽니다 — 올리는 자료가 바로 들어갑니다" disabled={working} onClick={service.open} />
              {contiButton}
              <Big icon="🎵" label="가사 올리기" title="가사 파일(.txt/.md 등)을 찬양 순서에 넣습니다" disabled={working} onClick={() => upload('lyrics')} />
              <Big icon="🎤" label="설교 슬라이드" title="설교 PPTX/PDF/이미지를 설교 순서에 넣습니다 (디자인 그대로)" disabled={working} onClick={() => upload('sermon')} />
            </Group>
            <Group label="예배 만들기">
              <Big icon="📝" label="주일예배 마법사" onClick={() => cmd.open('sunday')} />
              <Big icon="🙏" label="기도제목" title="이번 주 기도제목 — 주일예배 Front 슬라이드에 들어갑니다" onClick={() => cmd.open('prayer')} />
              <Big icon="🙌" label="공동체 고백송" title={`지금: ${lib.sunday.confessionSong || DEFAULT_CONFESSION_SONG} — 학기·해마다 바꾸기`} onClick={() => cmd.open('confession')} />
              <Big icon="⛺" label="수련회" onClick={() => cmd.open('retreat')} />
            </Group>
            <Group label="말씀 · 찬양">
              <Big icon="🎵" label="새 찬양" title="찬양 등록 — 제목·진행·파트별 가사 (주일예배 생성기와 같은 방식)" onClick={() => cmd.open('songNew')} />
              <Big icon="✎" label="찬양 편집" title="선택한 찬양의 가사·진행 편집, 교회 찬양 라이브러리에 등록" disabled={!p || !isSong(p)} onClick={() => cmd.open('song')} />
              <Big icon="📖" label="성경" onClick={() => cmd.open('bible')} />
              <Big icon="☁" label={cmd.online.status === 'ok' ? `찬양 ${cmd.online.count}곡` : '찬양 라이브러리'} title="찬양 라이브러리 보기 · 편집 · 삭제" onClick={() => cmd.open('songLibrary')} />
              <Big icon="✨" label="AI" onClick={() => cmd.open('ai')} />
              <Big icon="📊" label="AI 사용량" title="오늘 AI를 얼마나 썼는지 (모델별 무료 한도)" onClick={() => cmd.open('aiUsage')} />
            </Group>
            <Group label="내보내기">
              <Big icon="⇩" label="PPTX (MMDD)" onClick={cmd.exportPlaylistPptx} />
            </Group>
          </>
        )}
        {tab === '보기' && (
          <>
            <Group label="프레젠테이션 보기">
              <Big icon="▭" label="기본" active={cmd.view === 'normal'} onClick={() => cmd.setView('normal')} />
              <Big icon="▦" label="여러 슬라이드" active={cmd.view === 'sorter'} onClick={() => cmd.setView('sorter')} />
              <Big icon="🧑‍🏫" label="발표자 보기" active={cmd.view === 'presenter'} onClick={() => cmd.setView('presenter')} />
            </Group>
            <Group label="레이아웃">
              <Big icon="🎛" label="클래식 (ProPresenter형)" onClick={() => cmd.setLayout('classic')} />
            </Group>
          </>
        )}
      </div>
    </div>
  );
}
