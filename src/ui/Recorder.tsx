import { useRef, useState } from 'react';

/**
 * Records the audience output to a .webm video. In the desktop app the output window is
 * picked automatically; in a browser you choose the window or screen to record.
 */
export function Recorder() {
  const rec = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [started, setStarted] = useState(0);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      const chunks: Blob[] = [];
      const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const r = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
        a.download = `freecast-recording-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.webm`;
        a.click();
        setRecording(false);
      };
      stream.getVideoTracks()[0].onended = () => r.state !== 'inactive' && r.stop();
      r.start(1000);
      rec.current = r;
      setStarted(Date.now());
      setRecording(true);
    } catch (e) {
      alert(`Recording unavailable: ${(e as Error).message}`);
    }
  };

  return recording
    ? <button className="active" onClick={() => rec.current?.stop()} title={`Recording since ${new Date(started).toLocaleTimeString()}`}>■ Stop rec</button>
    : <button onClick={start} title="Record the audience output to a video file">⏺ Rec</button>;
}
