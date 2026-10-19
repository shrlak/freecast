import { useState, type Dispatch } from 'react';
import type { Action } from '../../domain/reducer';
import type { Library } from '../../domain/types';
import { parsePrayerTopics, planPrayerSlides } from '../../domain/sunday/prayer';
import { mdy, upcomingSunday } from '../../domain/sunday/notice';

/**
 * This week's 기도제목. Saved in the 주일예배 settings; the library's 주일예배 Front deck
 * prints them on its 기도 준비 slide (as many copies as they need) next to this Sunday's date.
 */
export function PrayerSetting({ library, dispatch, onClose, notify }: { library: Library; dispatch: Dispatch<Action>; onClose: () => void; notify: (m: string) => void }) {
  const [text, setText] = useState(library.sunday.prayerText ?? '');
  const topics = parsePrayerTopics(text);
  const pages = planPrayerSlides(topics).length;
  const sunday = mdy(upcomingSunday(new Date()));

  const save = () => {
    dispatch({ type: 'sunday/settings', patch: { prayerText: text.trim() } });
    notify(topics.length ? `기도제목 ${topics.length}개를 저장했습니다 — 주일예배 Front 슬라이드에 들어갑니다` : '기도제목을 비웠습니다 — Front 슬라이드는 템플릿 그대로 나옵니다');
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal confession-modal" role="dialog" aria-label="이번 주 기도제목">
        <header className="modal-head">
          <h2>🙏 이번 주 기도제목</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="wizard-body stack">
          <p className="hint">여기 적은 기도제목이 주일예배 Front의 “지금은 기도로 예배를 준비하는 시간입니다” 슬라이드에 들어가고, 두 번째 슬라이드의 날짜는 이번 주일({sunday})로 자동으로 바뀝니다. 번호를 붙이면 제목, 그 아래 줄은 세부 내용이 됩니다.</p>
          <textarea rows={12} autoFocus value={text} placeholder={'1. 회개와 마음의 정결\n- 지난 한 주간 …\n\n2. 예배를 위한 기도\n- …'} onChange={(e) => setText(e.target.value)} />
          <p className="muted small">{topics.length ? `기도제목 ${topics.length}개 → 기도 준비 슬라이드 ${pages}장` : '비워 두면 Front 슬라이드의 “기도제목 1 · 2” 그대로 나옵니다.'}</p>
          <div className="row gap-s">
            <button className="primary" onClick={save}>저장</button>
            <button onClick={onClose}>취소</button>
          </div>
        </div>
      </div>
    </div>
  );
}
