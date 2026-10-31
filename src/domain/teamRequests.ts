export interface TeamRequest { id: string; clientRequestId: string; senderId: string; name: string; text: string; at: number; status: 'pending' | 'acknowledged' | 'done' }
export const TEAM_PRESETS = ['후렴 한 번 더', '잠시 대기', '다음 곡으로', '가사 확인 부탁', '음량 조정 부탁'];
export const requestStatus = { pending: '전송됨 · 확인 대기', acknowledged: '운영자 확인함', done: '처리 완료' };
