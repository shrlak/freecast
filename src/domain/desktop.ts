/** Present only inside the FreeCast desktop app (see electron/preload.cjs). */
export interface DesktopDisplay {
  id: number;
  label: string;
  primary: boolean;
}

export interface DesktopInfo {
  version: string;
  platform: string;
  displays: DesktopDisplay[];
  outputDisplays: Record<string, number | null>;
  ai: { proxyUrl: string; hasGeminiKey: boolean; hasOpenrouterKey: boolean };
  networkRemote: boolean;
  lanUrls: string[];
  internet: { on: boolean; status: 'off' | 'connecting' | 'on' | 'error'; url: string | null; error: string | null; note: string | null; pin: string };
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error';
  version: string | null;
  progress: number;
  error: string | null;
}

export interface DesktopBridge {
  info(): Promise<DesktopInfo>;
  openView(url: string, displayId?: number | null): Promise<void>;
  /** Slide show starts: cover the projector (or this screen) right away, like PowerPoint. */
  present(url: string): Promise<void>;
  /** Slide show ends: close the window `present` opened. */
  endShow(): Promise<void>;
  setAiConfig(patch: { proxyUrl?: string; geminiKey?: string; openrouterKey?: string }): Promise<void>;
  setNetworkRemote(on: boolean): Promise<void>;
  setInternetRemote(on: boolean): Promise<void>;
  /** Change the PIN (and so lock out phones that had the old one). */
  newRemotePin(): Promise<void>;
  closeOutputs(): Promise<void>;
  updateState(): Promise<UpdateState | null>;
  checkUpdates(): Promise<UpdateState | null>;
  installUpdate(): Promise<void>;
  onUpdate(cb: (s: UpdateState) => void): () => void;
  onDisplays(cb: (d: DesktopDisplay[]) => void): () => void;
}

export const desktop: DesktopBridge | undefined = (window as unknown as { freecastDesktop?: DesktopBridge }).freecastDesktop;
