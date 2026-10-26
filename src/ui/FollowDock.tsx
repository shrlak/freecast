import { useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import type { AppState, Action } from '../domain/reducer';
import { sequence } from '../domain/arrangement';
import { findPres } from '../domain/live';
import { shouldAutoAdvance, suggestSlide } from '../domain/lyricFollow';
import { useSpeechRefs } from './useSpeechRefs';

const AUTO_KEY = 'freecast.follow.auto';
const readAuto = () => { try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; } };

/**
 * 🎙 가사 따라가기: listens to the singing and tells the operator when the next slide's words are being sung.
 * It only suggests by default; 자동 넘김 must be switched on, and then moves one slide at a time.
 */
export function FollowDock({ state, dispatch, onClose }: { state: AppState; dispatch: Dispatch<Action>; onClose: () => void }) {
  const [auto, setAutoState] = useState(readAuto);
  const [spoken, setSpoken] = useState('');
  const lastAdvance = useRef(0);
  const speech = useSpeechRefs((recent) => setSpoken(recent));
  const cursor = state.cursor;
  const suggestion = useMemo(() => suggestSlide(state.library, cursor, spoken), [state.library, cursor?.presentationId, cursor?.seq, spoken]);
  const setAuto = (on: boolean) => { setAutoState(on); try { localStorage.setItem(AUTO_KEY, on ? '1' : '0'); } catch { /* kept for this session only */ } };

  const advance = (seq: number) => {
    if (!cursor) return;
    lastAdvance.current = Date.now();
    dispatch({ type: 'live/go', presentationId: cursor.presentationId, seq, playlistIndex: cursor.playlistIndex });
  };
  useEffect(() => {
    if (auto && speech.listening && suggestion && shouldAutoAdvance(suggestion, lastAdvance.current, Date.now())) advance(suggestion.seq);
  }, [auto, speech.listening, suggestion?.seq, suggestion?.score]);

  const pres = cursor ? findPres(state.library, cursor.presentationId) : undefined;
  const target = suggestion && pres ? sequence(pres)[suggestion.seq]?.slide : undefined;
  return <aside className="follow-dock" role="region" aria-label="가사 따라가기">
    <header><strong>🎙 가사 따라가기</strong><button onClick={() => { speech.stop(); onClose(); }} aria-label="닫기">✕</button></header>
    {!speech.supported && <p className="hint">이 화면은 음성 인식을 지원하지 않습니다. Chrome 브라우저에서 인터넷에 연결해 쓰세요.</p>}
    {speech.supported && <button className={speech.listening ? 'on' : ''} onClick={speech.listening ? speech.stop : speech.start}>{speech.listening ? '⏹ 듣기 멈춤' : '🎙 듣기 시작'}</button>}
    {speech.error && <p className="hint" role="alert">{speech.error}</p>}
    {!cursor && <p className="hint">찬양 슬라이드를 띄우면 그 가사를 따라갑니다.</p>}
    <p className="follow-heard" aria-live="polite">{(speech.interim || spoken).slice(-60) || '…'}</p>
    {suggestion && target && <button className="primary" onClick={() => advance(suggestion.seq)}>▶ 다음 준비됨 ({Math.round(suggestion.score * 100)}%) · {target.text.split('\n')[0].slice(0, 24)}</button>}
    <label className="check small"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 자동 넘김 (확실할 때 한 장씩)</label>
    <p className="hint">기본은 제안만 합니다. 마이크는 이 컴퓨터가 아니라 음성 인식 서비스로 전송됩니다.</p>
  </aside>;
}
