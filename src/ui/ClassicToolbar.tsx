import type { Dispatch } from 'react';
import type { Action, AppState } from '../domain/reducer';
import { ACCEPT, type Commands } from './ppt/commands';

/** Toolbar of the classic (ProPresenter-style) layout. */
export function ClassicToolbar({ state, dispatch, cmd, hasSelection }: { state: AppState; dispatch: Dispatch<Action>; cmd: Commands; hasSelection: boolean }) {
  const close = (e: React.MouseEvent<HTMLDivElement>) => (e.currentTarget.parentElement as HTMLDetailsElement).removeAttribute('open');
  return (
    <header className="topbar toolbar">
      <div className="brand"><img className="brand-logo" src="/favicon.png" alt="KCCP" /> FreeCast</div>
      <div className="tool-group">
        <button className="tool-btn" onClick={() => cmd.open('sunday')}><span className="ti">⛪</span><span>주일예배</span></button>
        <button className="tool-btn" onClick={() => cmd.open('activity')}><span className="ti">📋</span><span>사용기록</span></button>
        <button className="tool-btn" onClick={() => cmd.open('preflight')}><span className="ti">🔎</span><span>예배 시작 전 점검</span></button>
        <button className="tool-btn" onClick={() => cmd.open('preparation')}><span className="ti">☑</span><span>예배 준비</span></button>
        <button className="tool-btn" onClick={() => cmd.open('trash')}><span className="ti">♲</span><span>휴지통</span></button>
        <button className="tool-btn" disabled={!hasSelection} onClick={() => cmd.open('rehearsal')}><span className="ti">▷</span><span>리허설</span></button>
        <button className="tool-btn" onClick={() => cmd.open('remoteControl')}><span className="ti">⌁</span><span>리모컨 조작권{cmd.remoteRequests > 0 ? ` · 요청 ${cmd.remoteRequests}` : ''}</span></button>
        <button className="tool-btn" onClick={() => cmd.open('retreat')}><span className="ti">⛺</span><span>수련회</span></button>
      </div>
      <div className="tool-group">
        <button className="tool-btn" onClick={() => cmd.open('new')}><span className="ti">＋</span><span>New</span></button>
        <button className="tool-btn" disabled={!hasSelection} onClick={() => cmd.open('edit')}><span className="ti">✎</span><span>Edit</span></button>
        <button className="tool-btn" onClick={() => cmd.open('themes')}><span className="ti">Aa</span><span>Themes</span></button>
        <button className="tool-btn" onClick={() => cmd.open('bible')}><span className="ti">📖</span><span>Bible</span></button>
        <button className="tool-btn" onClick={() => cmd.open('ai')}><span className="ti">✨</span><span>AI</span></button>
      </div>
      <div className="tool-group">
        <details className="menu">
          <summary className="tool-btn"><span className="ti">⇪</span><span>Import</span></summary>
          <div className="menu-items" onClick={close}>
            <button onClick={() => cmd.pickFiles('slides', ACCEPT.slides)}>PowerPoint / PDF / images…</button>
            <button onClick={() => cmd.pickFiles('lyrics', ACCEPT.lyrics)}>Songs: text, Markdown, ProPresenter 6, ChordPro, OpenLyrics, OpenSong…</button>
            <button onClick={() => cmd.pickFiles('backup', ACCEPT.backup)}>Full backup (.zip)…</button>
            <button onClick={() => cmd.pickFiles('library', ACCEPT.library)}>FreeCast library (.json)…</button>
          </div>
        </details>
        <details className="menu">
          <summary className="tool-btn"><span className="ti">⇩</span><span>Export</span></summary>
          <div className="menu-items" onClick={close}>
            <button onClick={cmd.exportPlaylistPptx}>Playlist as PowerPoint</button>
            <button onClick={cmd.exportBackup}>Full backup with media (.zip)</button>
            <button onClick={cmd.exportLibrary}>Library only (.json)</button>
            <button onClick={cmd.exportUsage}>CCLI song usage (.csv) — {state.library.usage.length} entries</button>
            <button onClick={cmd.clearUsage}>Clear usage log</button>
          </div>
        </details>
      </div>
      <div className="tool-group">
        <button className="tool-btn" onClick={() => cmd.open('screens')}><span className="ti">🖥</span><span>Screens</span></button>
        <button className="tool-btn" disabled={!state.past.length} title="Undo (⌘Z)" onClick={() => dispatch({ type: 'undo' })}><span className="ti">↶</span><span>Undo</span></button>
        <button className="tool-btn" disabled={!state.future.length} title="Redo (⇧⌘Z)" onClick={() => dispatch({ type: 'redo' })}><span className="ti">↷</span><span>Redo</span></button>
        <button className="tool-btn" title="PowerPoint-style layout" onClick={() => cmd.setLayout('ppt')}><span className="ti">▭</span><span>PPT view</span></button>
        <button className="tool-btn" title="Church cloud library" onClick={() => cmd.open('account')}><span className="ti">☁</span><span>{cmd.cloud.session ? cmd.cloud.session.username : 'Login'}</span></button>
      </div>
      <div className="muted small shortcuts">
        <span className={`dot ${cmd.relayConnected ? 'on' : ''}`} title={cmd.relayConnected ? 'Network relay connected' : 'Network relay offline'} /> → next · ← prev · F1–F6 clear · B black · L logo
      </div>
    </header>
  );
}
