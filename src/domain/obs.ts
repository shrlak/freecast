// Minimal OBS WebSocket v5 client (built into OBS Studio 28+: Tools → WebSocket Server Settings).
// Lets FreeCast switch OBS scenes and start/stop streaming and recording, by hand or from macros.

export interface ObsState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
  scenes: string[];
  current: string | null;
  streaming: boolean;
  recording: boolean;
}

type Listener = (s: ObsState) => void;
const OP = { Hello: 0, Identify: 1, Identified: 2, Event: 5, Request: 6, RequestResponse: 7 } as const;
// General (1) | Scenes (4) | Outputs (64)
const SUBSCRIPTIONS = 1 | 4 | 64;

async function sha256b64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

/** obs-websocket auth: base64(sha256(base64(sha256(password + salt)) + challenge)). */
export async function obsAuth(password: string, salt: string, challenge: string): Promise<string> {
  return sha256b64((await sha256b64(password + salt)) + challenge);
}

class ObsClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: (d: unknown) => void; reject: (e: Error) => void }>();
  private listeners = new Set<Listener>();
  private seq = 0;
  state: ObsState = { status: 'disconnected', scenes: [], current: null, streaming: false, recording: false };

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private set(patch: Partial<ObsState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  connect(url: string, password: string) {
    this.disconnect();
    this.set({ status: 'connecting', error: undefined });
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      this.set({ status: 'error', error: (e as Error).message });
      return;
    }
    this.ws = ws;
    ws.onmessage = async (e) => {
      const msg = JSON.parse(String(e.data)) as { op: number; d: Record<string, unknown> };
      if (msg.op === OP.Hello) {
        const auth = msg.d.authentication as { challenge: string; salt: string } | undefined;
        const d: Record<string, unknown> = { rpcVersion: 1, eventSubscriptions: SUBSCRIPTIONS };
        if (auth) d.authentication = await obsAuth(password, auth.salt, auth.challenge);
        ws.send(JSON.stringify({ op: OP.Identify, d }));
      } else if (msg.op === OP.Identified) {
        this.set({ status: 'connected' });
        this.refresh().catch(() => undefined);
      } else if (msg.op === OP.RequestResponse) {
        const p = this.pending.get(msg.d.requestId as string);
        if (!p) return;
        this.pending.delete(msg.d.requestId as string);
        const st = msg.d.requestStatus as { result: boolean; comment?: string };
        if (st.result) p.resolve(msg.d.responseData ?? {});
        else p.reject(new Error(st.comment ?? 'OBS request failed'));
      } else if (msg.op === OP.Event) {
        const type = msg.d.eventType as string;
        const data = (msg.d.eventData ?? {}) as Record<string, unknown>;
        if (type === 'CurrentProgramSceneChanged') this.set({ current: data.sceneName as string });
        else if (type === 'SceneListChanged') this.refresh().catch(() => undefined);
        else if (type === 'StreamStateChanged') this.set({ streaming: !!data.outputActive });
        else if (type === 'RecordStateChanged') this.set({ recording: !!data.outputActive });
      }
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.pending.forEach((p) => p.reject(new Error('OBS disconnected')));
      this.pending.clear();
      const authFailed = e.code === 4009;
      this.set({ status: authFailed || this.state.status === 'connecting' ? 'error' : 'disconnected', error: authFailed ? 'Wrong OBS WebSocket password' : this.state.status === 'connecting' ? 'Could not reach OBS — is OBS open with the WebSocket server enabled?' : undefined });
    };
  }

  disconnect() {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.set({ status: 'disconnected' });
  }

  request<T = Record<string, unknown>>(requestType: string, requestData?: Record<string, unknown>): Promise<T> {
    const ws = this.ws;
    if (!ws || this.state.status !== 'connected') return Promise.reject(new Error('OBS is not connected'));
    const requestId = `fc${++this.seq}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as (d: unknown) => void, reject });
      ws.send(JSON.stringify({ op: OP.Request, d: { requestType, requestId, requestData } }));
    });
  }

  async refresh() {
    const scenes = await this.request<{ scenes: { sceneName: string }[]; currentProgramSceneName: string }>('GetSceneList');
    const stream = await this.request<{ outputActive: boolean }>('GetStreamStatus').catch(() => ({ outputActive: false }));
    const rec = await this.request<{ outputActive: boolean }>('GetRecordStatus').catch(() => ({ outputActive: false }));
    // OBS lists scenes bottom-up; show them in the order they appear in OBS.
    this.set({ scenes: scenes.scenes.map((s) => s.sceneName).reverse(), current: scenes.currentProgramSceneName, streaming: stream.outputActive, recording: rec.outputActive });
  }

  setScene = (sceneName: string) => this.request('SetCurrentProgramScene', { sceneName });
}

export const obs = new ObsClient();

export type ObsCommand = 'scene' | 'startStream' | 'stopStream' | 'startRecord' | 'stopRecord';

/** Run an OBS step from a macro or slide action (ignored quietly when OBS is not connected). */
export function runObsStep(action: ObsCommand, scene?: string) {
  const run = {
    scene: () => (scene ? obs.setScene(scene) : Promise.resolve()),
    startStream: () => obs.request('StartStream'),
    stopStream: () => obs.request('StopStream'),
    startRecord: () => obs.request('StartRecord'),
    stopRecord: () => obs.request('StopRecord'),
  }[action];
  return run().catch(() => undefined);
}

const SETTINGS = 'freecast.obs';
export function obsSettings(): { url: string; password: string; auto: boolean } {
  try {
    return { url: 'ws://127.0.0.1:4455', password: '', auto: false, ...JSON.parse(localStorage.getItem(SETTINGS) ?? '{}') };
  } catch {
    return { url: 'ws://127.0.0.1:4455', password: '', auto: false };
  }
}
export function saveObsSettings(s: { url: string; password: string; auto: boolean }) {
  localStorage.setItem(SETTINGS, JSON.stringify(s));
}
