import type { CloudStatus } from '../useCloudSync';
import type { ServiceUploads } from './useServiceUploads';

export type Modal = 'edit' | 'new' | 'themes' | 'bible' | 'ai' | 'screens' | 'sunday' | 'retreat' | 'account' | 'confession' | 'aiUsage' | 'prayer' | null;
export type ImportKind = 'library' | 'slides' | 'lyrics' | 'backup';
export type PptViewMode = 'normal' | 'sorter' | 'presenter';
export type Layout = 'ppt' | 'classic';

export interface OnlineStatus {
  status: 'loading' | 'ok' | 'error';
  count: number;
  error?: string;
}

/** Everything the ribbon / toolbars can do; implemented once in OperatorView. */
export interface Commands {
  open: (m: Modal) => void;
  notify: (msg: string) => void;
  pickFiles: (kind: ImportKind, accept: string) => void;
  exportPlaylistPptx: () => void;
  exportBackup: () => void;
  exportLibrary: () => void;
  exportUsage: () => void;
  clearUsage: () => void;
  reloadOnline: () => void;
  startShow: (fromCurrent: boolean) => void;
  endShow: () => void;
  setView: (v: PptViewMode) => void;
  setLayout: (l: Layout) => void;
  online: OnlineStatus;
  relayConnected: boolean;
  view: PptViewMode;
  /** Slide selected for editing in the PowerPoint layout. */
  slideId: string | null;
  setSlideId: (id: string | null) => void;
  cloud: CloudStatus;
  /** This week's 주일예배: uploads go straight into it. */
  service: ServiceUploads;
}

export const ACCEPT = {
  slides: '.pptx,.pdf,image/*',
  lyrics: '.txt,.md,.pro6,.cho,.chopro,.chordpro,.crd,.xml,text/plain,text/markdown',
  backup: '.zip,application/zip',
  library: '.json,application/json',
} as const;
