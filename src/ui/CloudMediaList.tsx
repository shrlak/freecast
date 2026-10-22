import { useEffect, useState } from 'react';
import { cloudApi } from '../domain/cloud';
import { rankServerMedia, type ServerMediaFile } from '../domain/cloudMedia';
import { formatStorageBytes } from '../domain/cloudStorage';

function mediaType(type: string) {
  if (type === 'image' || type.startsWith('image/')) return '이미지';
  if (type === 'video' || type.startsWith('video/')) return '동영상';
  if (type === 'audio' || type.startsWith('audio/')) return '오디오';
  return type || '기타';
}

export function CloudMediaList({ token }: { token: string }) {
  const [files, setFiles] = useState<ServerMediaFile[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(10);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      setLoading(true);
      try {
        const [items, remote] = await Promise.all([cloudApi.listMedia(token), cloudApi.getLibrary(token)]);
        const ranked = rankServerMedia(items, remote?.data);
        if (active) { setFiles(ranked); setError(''); }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : '조회에 실패했습니다.');
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token, refresh]);
  return <section className="cloud-media-list" aria-label="서버 미디어 용량순 목록">
    <div className="row"><h4 className="grow">큰 미디어 파일</h4><button disabled={loading} onClick={() => setRefresh((n) => n + 1)}>{loading ? '조회 중…' : '파일 목록 새로고침'}</button></div>
    <p className="hint">서버 파일 크기가 큰 순서입니다. 30초마다 갱신하며, 이름 정보가 없는 파일은 ID로 표시합니다.</p>
    {error && <p role="alert">파일 목록 조회 실패: {error}{files && ' · 이전 조회 결과를 표시합니다.'}</p>}
    {files ? files.length ? <>
      <p className="small">전체 {files.length}개 · {Math.min(limit, files.length)}개 표시</p>
      <div className="cloud-media-scroll"><table><thead><tr><th scope="col">파일명</th><th scope="col">종류</th><th scope="col">크기</th></tr></thead>
        <tbody>{files.slice(0, limit).map((file) => <tr key={file.id}><td title={file.id}>{file.name}</td><td>{mediaType(file.type)}</td><td>{formatStorageBytes(file.size)}</td></tr>)}</tbody>
      </table></div>
      {limit < files.length && <button onClick={() => setLimit((n) => n + 10)}>10개 더 보기</button>}
    </> : <p>서버에 저장된 미디어가 없습니다.</p> : !error && <p role="status">서버 미디어를 조회하고 있습니다…</p>}
  </section>;
}
