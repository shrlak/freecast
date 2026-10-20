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
  setAiConfig(patch: { proxyUrl?: string; geminiKey?: string; openrouterKey?: string }): Promise<void>;
  setNetworkRemote(on: boolean): Promise<void>;
  closeOutputs(): Promise<void>;
  updateState(): Promise<UpdateState | null>;
  checkUpdates(): Promise<UpdateState | null>;
  installUpdate(): Promise<void>;
  onUpdate(cb: (s: UpdateState) => void): () => void;
  onDisplays(cb: (d: DesktopDisplay[]) => void): () => void;
}

export const desktop: DesktopBridge | undefined = (window as unknown as { freecastDesktop?: DesktopBridge }).freecastDesktop;
