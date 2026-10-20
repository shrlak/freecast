// In-app feedback: sent to the church Worker (/freecast/feedback via this app's /api/cloud proxy),
// which keeps it and emails it to the app's maintainer.
import { desktop } from './desktop';

export interface FeedbackResult {
  ok: boolean;
  id: number;
  emailed: boolean;
}

export async function sendFeedback(message: string, name: string): Promise<FeedbackResult> {
  const info = await desktop?.info().catch(() => null);
  const version = info?.version ?? 'web';
  const platform = info?.platform ?? navigator.userAgent.slice(0, 80);
  let res: Response;
  try {
    res = await fetch('/api/cloud/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: message.trim(), name: name.trim(), version, platform }),
    });
  } catch {
    throw new Error('FreeCast 서버에 연결할 수 없습니다.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `오류 ${res.status}`);
  return data as FeedbackResult;
}
