import { useEffect, useRef } from 'react';
import { DeviceProfileFields } from './DeviceProfileFields';
import type { CloudSync } from './useCloudSync';

/**
 * Shown right after the first login on a computer (or when a logged-in computer was never named):
 * the computer's name and its user, so 사용기록 and the device list say who did what. Both fields
 * save themselves while typing.
 */
export function DeviceSetupDialog({ cloud, onClose }: { cloud: CloudSync; onClose: () => void }) {
  // The computer's own name is a good first guess for the device name.
  const suggested = useRef(cloud.device.computerName?.trim() || cloud.device.name);
  // Registered as soon as it opens (with the suggested name), so it does not come back next time.
  useEffect(() => { try { cloud.renameDevice(suggested.current, cloud.device.userName); } catch { /* the fields show what is wrong */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="modal-backdrop">
      <div className="modal account-modal" role="dialog" aria-label="이 컴퓨터 등록">
        <header className="modal-head">
          <h2>💻 이 컴퓨터 등록</h2>
        </header>
        <div className="wizard-body stack">
          <p>{cloud.status.session?.username ? `${cloud.status.session.username}(으)로 로그인했습니다. ` : '로그인했습니다. '}이 컴퓨터의 이름과 사용하는 사람을 적어 주세요. 사용기록과 기기 목록에 이 이름으로 나옵니다.</p>
          <DeviceProfileFields cloud={cloud} initialName={suggested.current} autoFocus />
          <p className="hint">입력하면 바로 자동으로 저장됩니다. 나중에 ☁ 계정 창에서 바꿀 수 있습니다.</p>
          <div className="row gap-s"><span className="rb-spacer" /><button className="primary" onClick={onClose}>완료</button></div>
        </div>
      </div>
    </div>
  );
}
