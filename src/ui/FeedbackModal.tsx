import { useState } from 'react';
import { sendFeedback } from '../domain/feedback';
import { AutoTextarea } from './AutoTextarea';

const NAME_KEY = 'freecast.feedbackName';

/** 피드백 보내기: what to fix or add. It is emailed to the maintainer and lands in a later update. */
export function FeedbackModal({ onClose, notify }: { onClose: () => void; notify: (m: string) => void }) {
  const [message, setMessage] = useState('');
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const r = await sendFeedback(message, name);
      localStorage.setItem(NAME_KEY, name.trim());
      notify(`피드백 #${r.id}을(를) 보냈습니다 — 반영되면 FreeCast가 자동으로 업데이트됩니다. 감사합니다!`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !sending && onClose()}>
      <div className="modal confession-modal" role="dialog" aria-label="피드백 보내기">
        <header className="modal-head">
          <h2>💬 피드백 보내기</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="wizard-body stack">
          <p className="hint">고칠 점이나 있었으면 하는 기능을 적어 주세요. 개발자에게 바로 이메일로 전달되고, 반영된 새 버전은 모든 컴퓨터의 FreeCast에 자동으로 설치됩니다 (앱을 종료할 때).</p>
          <AutoTextarea rows={10} autoFocus value={message} maxLength={5000}
            placeholder={'예) 찬양 가사 슬라이드에서 글자가 조금 더 컸으면 좋겠어요.\n예) 성경 구절을 넣으면 장 번호가 두 번 나와요.'}
            onChange={(e) => setMessage(e.target.value)} />
          <label className="stack gap-xs">
            <span className="muted small">이름 (선택)</span>
            <input value={name} maxLength={80} placeholder="예) 미디어팀 김OO" onChange={(e) => setName(e.target.value)} />
          </label>
          {error && <p className="warn">{error}</p>}
          <div className="row gap-s">
            <button className="primary" disabled={sending || !message.trim()} onClick={send}>{sending ? '보내는 중…' : '보내기'}</button>
            <button onClick={onClose} disabled={sending}>취소</button>
            <span className="muted small">{message.length} / 5000</span>
          </div>
        </div>
      </div>
    </div>
  );
}
