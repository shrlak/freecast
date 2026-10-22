import type { CloudSync } from './useCloudSync';
import { formatStorageBytes } from '../domain/cloudStorage';

export function CloudStoragePanel({ cloud }: { cloud: CloudSync }) {
  const { usage, loading, error } = cloud.storage;
  const mediaPercent = usage?.totalBytes ? usage.mediaBytes / usage.totalBytes * 100 : 0;
  const libraryPercent = usage?.totalBytes ? 100 - mediaPercent : 0;
  return <section className="cloud-storage" aria-label="서버 저장공간">
    <div className="row"><h3 className="grow">서버 저장공간</h3><button disabled={loading} onClick={() => void cloud.refreshStorage()}>{loading ? '확인 중…' : '용량 새로고침'}</button></div>
    {usage ? <>
      <p><b>{formatStorageBytes(usage.totalBytes)}</b> 저장됨 · 미디어 {usage.mediaCount}개</p>
      <div className="cloud-storage-bar" role="img" aria-label={`서버 저장 데이터 구성: 미디어 ${formatStorageBytes(usage.mediaBytes)}, 라이브러리 ${formatStorageBytes(usage.libraryBytes)}`}>
        <span className="cloud-storage-media" style={{ width: `${mediaPercent}%` }} /><span className="cloud-storage-library" style={{ width: `${libraryPercent}%` }} />
      </div>
      <div className="row small"><span>● 미디어 {formatStorageBytes(usage.mediaBytes)}</span><span>● 슬라이드·설정·기록 {formatStorageBytes(usage.libraryBytes)}</span></div>
      <p className="muted small">확인: {new Date(usage.checkedAt).toLocaleString()}{error ? ' · 이전 조회 결과' : ''}</p>
      <p className="hint">막대는 저장된 데이터의 구성 비율입니다. 서버 API가 제공하는 라이브러리·미디어 용량이며 데이터베이스 부가 공간과 다른 서비스는 제외됩니다. 전체 서버 용량 한도가 제공되지 않아 남은 용량·사용률은 표시하지 않습니다. 이 컴퓨터의 복원 지점은 서버 용량에 포함되지 않습니다.</p>
    </> : !error && <p role="status">{loading ? '서버 용량을 확인하고 있습니다…' : '용량 새로고침을 눌러 서버 저장공간을 확인하세요.'}</p>}
    {error && <p role="alert">서버 용량 조회 실패: {error}</p>}
  </section>;
}
