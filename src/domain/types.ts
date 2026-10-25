export type HAlign = 'left' | 'center' | 'right' | 'justify';
/** Bullets or numbering in front of each line (PowerPoint's 글머리 기호 / 번호 매기기). */
export type ListStyle = 'bullet' | 'circle' | 'square' | 'check' | 'arrow' | 'number' | 'number-paren' | 'roman' | 'alpha' | 'hangul';
export type VAlign = 'top' | 'middle' | 'bottom';

/** Text styling, sized against the 1440x1080 (4:3) canvas. */
export interface Theme {
  /** Set on a theme FreeCast generated from a church template: a fingerprint of what it generated. */
  generated?: string;
  id: string;
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: HAlign;
  vAlign: VAlign;
  lineHeight: number;
  padding: number;
  shadow: boolean;
  uppercase: boolean;
  /** Secondary line (translation / second Bible version). */
  subColor?: string;
  subScale?: number;
  /** Grow the text box to fit its content without changing font sizes (default on). */
  autoFit?: boolean;
  /** Prefer unwrapped lyric lines: widen the box, wrapping only if the slide width is exhausted. */
  noWrap?: boolean;
  /** Text effects. */
  strokeColor?: string;
  strokeWidth?: number;
  glowColor?: string;
  /** CSS gradient used as the text fill, e.g. "linear-gradient(#fff,#fde68a)". */
  gradient?: string;
  italic?: boolean;
  underline?: boolean;
  /** PowerPoint text options (글꼴 / 단락 groups). */
  strike?: boolean;
  /** Character spacing in canvas pixels (0 = normal). */
  letterSpacing?: number;
  /** Text highlight colour. */
  highlight?: string;
  list?: ListStyle;
  /** Indent level (each level 60 canvas pixels). */
  indent?: number;
  columns?: number;
  /** Vertical text (세로 쓰기). */
  vertical?: boolean;
}

/** Per-slide text formatting that overrides the presentation's theme for that slide only. */
export type SlideStyle = Partial<Pick<Theme,
  'fontFamily' | 'fontSize' | 'fontWeight' | 'color' | 'align' | 'vAlign' | 'lineHeight' | 'shadow' | 'uppercase' |
  'subColor' | 'strokeColor' | 'strokeWidth' | 'italic' | 'underline' | 'padding' | 'strike' | 'letterSpacing' | 'highlight' |
  'list' | 'indent' | 'columns' | 'vertical' | 'autoFit' | 'glowColor'>>;

export type MediaType = 'image' | 'video' | 'audio';
/** 'fill' stretches to the box (how PowerPoint draws a picture in its frame). */
export type MediaFit = 'cover' | 'contain' | 'fill';

export type Background =
  | { kind: 'color'; value: string }
  | { kind: 'gradient'; value: string }
  | { kind: 'media'; mediaId: string; mediaType: 'image' | 'video'; fit?: MediaFit; loop?: boolean }
  /** Built-in image shipped with the app (the church's template backgrounds). */
  | { kind: 'image'; url: string; fit?: MediaFit }
  | { kind: 'camera'; deviceId: string; label: string };

/** Cue at a time in a video/audio file (ProPresenter "playback markers"). */
export interface PlaybackMarker {
  id: string;
  /** Seconds from the start. */
  t: number;
  label: string;
  macroId?: string;
  stageMessage?: string;
}

export interface MediaMeta {
  id: string;
  name: string;
  type: MediaType;
  /** Slide assets stay available for playback without appearing in the background library. */
  backgroundHidden?: boolean;
  markers?: PlaybackMarker[];
}

export type ElementKind = 'text' | 'image' | 'shape' | 'video' | 'camera';

/** One line of a text element with its own formatting (kept from imported PowerPoint text boxes). */
export interface ElementParagraph {
  text: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: HAlign;
}

/** A free-positioned object on a slide (slide editor), in 1440×1080 canvas pixels. */
export interface SlideElement {
  /** One-time request to maximize the font inside this box; false records completion/manual sizing. */
  maximizeFont?: boolean;
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: HAlign;
  vAlign?: VAlign;
  shadow?: boolean;
  mediaId?: string;
  fit?: MediaFit;
  fill?: string;
  stroke?: string;
  radius?: number;
  ellipse?: boolean;
  /** Camera / capture device for 'camera' objects. */
  deviceId?: string;
  /** Per-line formatting; `text` stays the plain text (lines joined by \n). */
  paragraphs?: ElementParagraph[];
  /** Grow the box to fit its text, preserving font sizes (default on). */
  autoFit?: boolean;
  /** PowerPoint text options, as on the slide text (see Theme). */
  underline?: boolean;
  strike?: boolean;
  letterSpacing?: number;
  lineHeight?: number;
  highlight?: string;
  list?: ListStyle;
  indent?: number;
  columns?: number;
  vertical?: boolean;
  /** Text-box purpose, retained when editing or filling a template. */
  role?: 'prayer' | 'lyrics';
}

/** Things a slide does when it goes live (ProPresenter "slide actions"). */
export type SlideAction = MacroStep | { type: 'runMacro'; macroId: string };

export interface Slide {
  /** One-time request to maximize theme-styled text inside the slide's text area. */
  maximizeFont?: boolean;
  id: string;
  /** Original import type: PowerPoint objects remain editable; PDF page content is read-only. */
  importSource?: { format: 'pptx' | 'ppt' | 'pdf'; name: string; page: number };
  /** Original slide identity when a repeated arrangement occurrence is made independent. */
  sourceSlideId?: string;
  /** Main text is song lyrics; corner QR codes must leave equal space on both sides. */
  lyricBody?: boolean;
  group: string;
  text: string;
  /** Bold heading above the text (announcement title, prayer topic, scripture reference). */
  title?: string;
  /** Smaller line under the text: English lyrics, a second Bible translation. */
  subtext?: string;
  /** Links rendered as QR codes in the bottom-right corner. */
  qr?: string[];
  label?: string;
  notes?: string;
  disabled?: boolean;
  background?: Background;
  /** Small title in the top-left corner, e.g. "한글 제목 | English Title". */
  caption?: string;
  /** This slide's own font / size / colour / alignment (overrides the theme). */
  style?: SlideStyle;
  elements?: SlideElement[];
  actions?: SlideAction[];
  /** Seconds before advancing to the next slide automatically. */
  autoAdvance?: number;
  /** Single key that jumps to this slide while its presentation is selected. */
  hotkey?: string;
  transition?: Transition;
}

export interface Arrangement {
  id: string;
  name: string;
  groups: string[];
}

export interface SongMeta {
  author?: string;
  copyright?: string;
  ccli?: string;
  key?: string;
  tempo?: string;
  /** The song's 진행 as written on the 콘티 / in the library, e.g. ["I","V1","C","V2","C"]. */
  order?: string[];
}

export type TransitionKind = 'cut' | 'fade' | 'slide' | 'zoom';
export interface Transition {
  kind: TransitionKind;
  duration: number;
}

export interface Presentation {
  id: string;
  /** Essential material: unlock explicitly before editing, replacing or deleting it. */
  protected?: boolean;
  /** A newer explicit protection change wins during device sync; old clients cannot silently unlock. */
  protectionChangedAt?: number;
  /** Which church template (and 고백송) this deck was last built from; set on decks FreeCast keeps in sync. */
  templateKey?: string;
  /** A song's lyrics by part as written (blank lines kept) and its 진행 — what the song editor edits. */
  songSource?: { sections: { label: string; lines: string[] }[]; order?: string[] };
  /** Lyrics already laid out the church's way (each part once, blank-line breaks) at this many lines per slide. */
  lyricsLayout?: { linesPerSlide: number };
  /** Individual slide content/design was edited; automatic song styling must preserve it. */
  slidesEdited?: boolean;
  /** Existing lyric boxes have received the centered default; later individual edits are kept. */
  lyricsCentered?: boolean;
  title: string;
  slides: Slide[];
  themeId: string;
  background?: Background;
  arrangements?: Arrangement[];
  arrangementId?: string | null;
  meta?: SongMeta;
  transition?: Transition;
  showCopyright?: boolean;
  /** Folder in the library sidebar (e.g. "Songs", "0712 주일예배"). */
  folder?: string;
  /** After the last slide, go back to the first (announcement loops). */
  loop?: boolean;
  /** Comes from the online library: loaded each session, never saved on this computer. */
  online?: boolean;
  /** When a library song was last saved (ms); the newest copy of a song title is the one kept. */
  updatedAt?: number;
  /** Dim / blur applied to the background while this presentation is live. */
  bgEffect?: BackgroundEffect;
  /** Recorded slide timings, optionally synced to an audio track. */
  timeline?: Timeline;
}

export interface BackgroundEffect {
  /** 0 – 0.9 black overlay. */
  dim: number;
  /** Blur radius in canvas pixels. */
  blur: number;
}

export interface Timeline {
  audioMediaId: string | null;
  /** Seconds from start → position in the play sequence. */
  cues: { t: number; seq: number }[];
}

export type PlaylistItem =
  | { id: string; kind?: 'presentation'; presentationId: string }
  | { id: string; kind: 'header'; title: string };

export interface Playlist {
  /** Keep this service until the next weekly cleanup, even after its own service ends. */
  autoDeleteAfter?: number;
  id: string;
  name: string;
  items: PlaylistItem[];
}

export type TimerKind = 'countdown' | 'countdownTo' | 'elapsed';
export interface Timer {
  id: string;
  name: string;
  kind: TimerKind;
  durationMs: number;
  /** "HH:MM" for countdownTo. */
  target: string;
  running: boolean;
  startedAt: number | null;
  accumulatedMs: number;
}

export type PropKind = 'text' | 'image' | 'clock' | 'timer';
export type PropPosition =
  | 'top-left' | 'top' | 'top-right' | 'center' | 'bottom-left' | 'bottom' | 'bottom-right' | 'full';
export interface Prop {
  id: string;
  name: string;
  kind: PropKind;
  text?: string;
  mediaId?: string;
  timerId?: string;
  position: PropPosition;
  size: number;
  color: string;
  background: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  /** Text with {tokens} the operator fills in, e.g. "Parent of {child}, please come to the nursery". */
  template: string;
}

export type MacroStep =
  | { type: 'clearAll' }
  | { type: 'clearText' }
  | { type: 'clearBackground' }
  | { type: 'clearProps' }
  | { type: 'black'; on: boolean }
  | { type: 'background'; background: Background | null }
  | { type: 'go'; presentationId: string; index: number }
  | { type: 'timer'; timerId: string; op: 'start' | 'stop' | 'reset' }
  | { type: 'prop'; propId: string; on: boolean }
  | { type: 'message'; text: string | null }
  | { type: 'audio'; mediaId: string | null }
  | { type: 'logo'; on: boolean }
  | { type: 'stageMessage'; text: string | null }
  | { type: 'announce'; presentationId: string | null }
  /** OBS Studio (WebSocket): switch scene, start/stop stream or recording. Run by the console, not the reducer. */
  | { type: 'obs'; action: 'scene' | 'startStream' | 'stopStream' | 'startRecord' | 'stopRecord'; scene?: string }
  /** DMX lighting over Art-Net: set channels (1–512) of a universe. Run by the console. */
  | { type: 'dmx'; universe: number; channels: Record<string, number> };

export interface Macro {
  id: string;
  name: string;
  color: string;
  steps: MacroStep[];
}

export interface ScreenLayers {
  background: boolean;
  slide: boolean;
  props: boolean;
  messages: boolean;
  timer: boolean;
  announcements?: boolean;
}

export interface ScreenMask {
  kind: 'none' | 'rect' | 'oval';
  /** Inset from each edge, in canvas pixels. */
  inset: number;
}

export interface Screen {
  id: string;
  name: string;
  layers: ScreenLayers;
  /** Override theme for this screen (e.g. lower-third for the livestream). */
  themeId: string | null;
  /** Fill for transparent areas: black, chroma green, or truly transparent (for browser sources). */
  /** 'matte' = key output: white where content is, black elsewhere (pair with a fill screen). */
  key: 'black' | 'green' | 'transparent' | 'matte';
  mask?: ScreenMask;
  /** Edge blend: this screen shows the left or right part of a two-projector picture. */
  edge?: { part: 'none' | 'left' | 'right'; overlap: number };
}

/** A saved set of layer choices for every screen (ProPresenter "Looks"). */
export interface Look {
  id: string;
  name: string;
  screens: Record<string, ScreenLayers>;
}

export interface StageLayout {
  id: string;
  name: string;
  clock: boolean;
  timers: boolean;
  current: boolean;
  next: boolean;
  notes: boolean;
  preview: boolean;
  chords: boolean;
  videoCountdown: boolean;
  /** Text size multiplier. */
  scale: number;
}

export interface Schedule {
  id: string;
  name: string;
  macroId: string;
  /** "HH:MM" local time. */
  time: string;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  enabled: boolean;
  /** "YYYY-MM-DD HH:MM" of the last run, so a schedule fires once per slot. */
  lastRun?: string;
}

export interface DeviceIdentity {
  id: string;
  name: string;
  userName: string;
  platform: string;
  computerName?: string;
  appVersion?: string;
}
export interface DeviceRegistration extends DeviceIdentity { lastSeen: number; account: string | null }
export interface ActivityEntry {
  id: string;
  at: number;
  action: string;
  detail: string;
  device: DeviceIdentity;
  account: string | null;
}

export interface UsageEntry {
  device?: DeviceIdentity;
  account?: string | null;
  at: number;
  presentationId: string;
  title: string;
  ccli?: string;
}

export interface SundaySettings {
  frontId: string | null;
  prayerId: string | null;
  backId: string | null;
  confessionSong: string;
  /** This week's 기도제목 as typed (numbered topics, points under them); shown on the Front deck. */
  prayerText?: string;
  linesPerSlide: number;
  translations: string[];
  versesPerSlide: number;
  /** Church-PPT defaults applied so far: 1 = one verse per slide, 2 = up to 4 lyric lines per slide. */
  styleVersion?: number;
}

export interface TrashEntry {
  id: string; kind: 'presentation' | 'slides'; deletedAt: number; expiresAt: number;
  presentation: Presentation;
  placements?: { playlistId: string; index: number; item: PlaylistItem }[];
  slides?: { slide: Slide; seq: number; previous?: { id: string; occurrence: number }; next?: { id: string; occurrence: number } }[];
}

export interface Library {
  /** Explicit protection changes survive deletion so another device can honor an unlocked deletion. */
  protectionChanges?: { id: string; on: boolean; at: number }[];
  version: 1;
  devices?: DeviceRegistration[];
  activity?: ActivityEntry[];
  lastModified?: ActivityEntry;
  trash?: TrashEntry[];
  /** '4:3' once slides use the 1440×1080 canvas (libraries without it were laid out at 1920×1080). */
  aspect?: '4:3';
  /** Set once every presentation's and slide's own transition has been cleared (default is 없음, 1 ms). */
  transitionsReset?: true;
  /** Existing background registrations have been cleared without deleting slide assets. */
  backgroundLibraryReset?: true;
  presentations: Presentation[];
  themes: Theme[];
  playlists: Playlist[];
  media: MediaMeta[];
  timers: Timer[];
  props: Prop[];
  messageTemplates: MessageTemplate[];
  macros: Macro[];
  screens: Screen[];
  usage: UsageEntry[];
  sunday: SundaySettings;
  schedules: Schedule[];
  logoMediaId: string | null;
  looks: Look[];
  stageLayouts: StageLayout[];
}

/** Everything the output and stage windows need to render. */
export interface LiveState {
  slide: Slide | null;
  title: string | null;
  nextText: string | null;
  theme: Theme;
  transition: Transition;
  background: Background | null;
  black: boolean;
  message: string | null;
  activeProps: string[];
  props: Prop[];
  timers: Timer[];
  outputTimerId: string | null;
  screens: Screen[];
  themes: Theme[];
  copyright: string | null;
  video: { playing: boolean; restart: number; seek?: { t: number; n: number }; loop?: boolean; endsAt?: number | null };
  bgEffect: BackgroundEffect | null;
  logo: boolean;
  logoMediaId: string | null;
  /** Shown only on stage displays. */
  stageMessage: string | null;
  /** Scroll the message across the screen like a ticker. */
  messageScroll: boolean;
  stageLayouts?: StageLayout[];
  /** Stage display chords: semitones the key is moved up (negative = down). */
  chordShift?: number;
  /** Stage display chords: capo fret, so the chords shown are the shapes to play. */
  capo?: number;
  /** Separate looping layer (e.g. lower-third announcements during pre-service). */
  announcement: { slide: Slide; theme: Theme; title: string } | null;
}
