import type { Background, Library, LiveState, Presentation, Screen, Slide, StageLayout, Theme } from './types';
import { parseLyrics } from './lyrics';

const SANS = 'Inter, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", Helvetica, Arial, sans-serif';
const SERIF = 'Georgia, "Nanum Myeongjo", "AppleMyungjo", "Times New Roman", serif';

const base = { subColor: '#fde68a', subScale: 0.62 };
export const DEFAULT_THEMES: Theme[] = [
  { id: 'theme_classic', name: 'Classic', fontFamily: SANS, fontSize: 84, fontWeight: 600, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.3, padding: 120, shadow: true, uppercase: false, ...base },
  { id: 'theme_lower', name: 'Lower Third', fontFamily: SANS, fontSize: 60, fontWeight: 600, color: '#ffffff', align: 'center', vAlign: 'bottom', lineHeight: 1.2, padding: 80, shadow: true, uppercase: false, ...base },
  { id: 'theme_bold', name: 'Bold Caps', fontFamily: '"Arial Black", Impact, ' + SANS, fontSize: 92, fontWeight: 800, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.15, padding: 140, shadow: true, uppercase: true, ...base },
  { id: 'theme_scripture', name: 'Scripture', fontFamily: SERIF, fontSize: 60, fontWeight: 400, color: '#f8fafc', align: 'left', vAlign: 'middle', lineHeight: 1.45, padding: 150, shadow: true, uppercase: false, ...base },
  { id: 'theme_sunday', name: '주일 (수채화)', fontFamily: SANS, fontSize: 80, fontWeight: 700, color: '#1e3a5f', align: 'center', vAlign: 'middle', lineHeight: 1.35, padding: 130, shadow: false, uppercase: false, subColor: '#2563eb', subScale: 0.62 },
  { id: 'theme_sunday_scripture', name: '주일 성경 (수채화)', fontFamily: SERIF, fontSize: 56, fontWeight: 500, color: '#1f2937', align: 'left', vAlign: 'middle', lineHeight: 1.5, padding: 150, shadow: false, uppercase: false, subColor: '#1e40af', subScale: 0.62 },
  { id: 'theme_sunday_info', name: '주일 광고 (수채화)', fontFamily: SANS, fontSize: 50, fontWeight: 500, color: '#1f2937', align: 'left', vAlign: 'top', lineHeight: 1.45, padding: 130, shadow: false, uppercase: false, subColor: '#1e40af', subScale: 0.62 },
  { id: 'theme_kccp', name: 'KCCP 네이비', fontFamily: SANS, fontSize: 80, fontWeight: 700, color: '#ffffff', align: 'center', vAlign: 'middle', lineHeight: 1.35, padding: 130, shadow: true, uppercase: false, subColor: '#fde718', subScale: 0.62 },
  { id: 'theme_kccp_light', name: 'KCCP 화이트', fontFamily: SANS, fontSize: 80, fontWeight: 700, color: '#163a62', align: 'center', vAlign: 'middle', lineHeight: 1.35, padding: 130, shadow: false, uppercase: false, subColor: '#2e9e66', subScale: 0.62 },
  { id: 'theme_info', name: 'Info / 광고', fontFamily: SANS, fontSize: 52, fontWeight: 500, color: '#ffffff', align: 'left', vAlign: 'top', lineHeight: 1.45, padding: 120, shadow: false, uppercase: false, ...base },
];

/** The only backgrounds: the church template's white slide with the KCCP logo (the 1018 예배 look), black and white. */
export const BG_WHITE_LOGO: Background = { kind: 'image', url: 'backgrounds/white-logo.png', fit: 'cover' };
export const BG_BLACK: Background = { kind: 'color', value: '#000000' };
export const BG_WHITE: Background = { kind: 'color', value: '#ffffff' };
/** The 찬양 제목 slide: deep blue, lighter in the middle, so the title stands out before the white lyric slides. */
export const BG_SONG_TITLE: Background = { kind: 'gradient', value: 'radial-gradient(ellipse at 50% 45%, #2b5fa8 0%, #14305c 55%, #0a1a35 100%)' };

export const BACKGROUND_PRESETS: { name: string; background: Background }[] = [
  { name: 'KCCP 흰색 + 로고', background: BG_WHITE_LOGO },
  { name: 'Black', background: BG_BLACK },
  { name: 'White', background: BG_WHITE },
  { name: '찬양 제목', background: BG_SONG_TITLE },
];

export const presetBackground = (name: string): Background => (BACKGROUND_PRESETS.find((p) => p.name === name) ?? BACKGROUND_PRESETS[1]).background;

/** Old names for the backgrounds that were removed: the light 주일 look is now the white template slide, everything else is black. */
export const CHURCH_BACKGROUNDS = {
  watercolor: BG_WHITE_LOGO,
  communion: BG_BLACK,
  worship: BG_BLACK,
  cross: BG_BLACK,
  bible: BG_BLACK,
  nightSky: BG_BLACK,
  prayer: BG_BLACK,
  sanctuary: BG_BLACK,
  thankYou: BG_BLACK,
} satisfies Record<string, Background>;
export const CHURCH_LOGO_URL = 'backgrounds/church-logo.jpg';

// Public-domain texts (John Newton, 1779; Thomas Ken, 1674).
const AMAZING_GRACE = `[Verse 1]
Amazing grace! How sweet the sound
That saved a wretch like me!

I once was lost, but now am found;
Was blind, but now I see.

[Verse 2]
'Twas grace that taught my heart to fear,
And grace my fears relieved;

How precious did that grace appear
The hour I first believed.

[Verse 3]
Through many dangers, toils and snares,
I have already come;

'Tis grace hath brought me safe thus far,
And grace will lead me home.

[Verse 4]
When we've been there ten thousand years,
Bright shining as the sun,

We've no less days to sing God's praise
Than when we'd first begun.`;

const DOXOLOGY = `[Chorus]
Praise God, from whom all blessings flow;
Praise Him, all creatures here below;

Praise Him above, ye heavenly host;
Praise Father, Son, and Holy Ghost.

[Ending]
Amen.`;

const WELCOME = `[Slide]
Welcome!
We're glad you're here

Please silence your phones

Connect with us after the service`;

const s = (id: string, group: string, text: string, extra: Partial<Slide> = {}): Slide => ({ id, group, text, ...extra });

/** This season's 공동체 고백송 (printed in the Back deck). */
export const DEFAULT_CONFESSION_SONG = '우리는 주의 움직이는 교회';

export const PRAYER_PREP_TITLE = '지금은 기도로 예배를 준비하는 시간입니다.';

function sundayTemplates(): Presentation[] {
  return [
    {
      id: 'p_front', title: '주일예배 Front', folder: 'Templates', themeId: 'theme_sunday',
      background: CHURCH_BACKGROUNDS.watercolor,
      slides: [
        s('front_prayer', 'Prayer', '● 기도제목 1\n● 기도제목 2', { title: PRAYER_PREP_TITLE }),
        s('front_welcome', 'Welcome', "WELCOME\nHappy Lord's Day", { subtext: '{date}' }),
      ],
    },
    {
      id: 'p_prayer', title: '기도', folder: 'Templates', themeId: 'theme_bold',
      background: CHURCH_BACKGROUNDS.prayer,
      slides: [s('prayer_1', 'Prayer', '기도')],
    },
    {
      id: 'p_back', title: '주일예배 Back', folder: 'Templates', themeId: 'theme_sunday',
      background: CHURCH_BACKGROUNDS.watercolor,
      slides: [
        s('back_confession', '공동체 고백', '공동체 고백'),
        s('back_communion', '성찬예식', '', { background: CHURCH_BACKGROUNDS.communion, disabled: true, notes: 'Enable on communion Sundays' }),
        s('back_offering', 'Offering', '봉헌'),
        s('back_benediction', 'Benediction', '축도'),
        s('back_end', 'End', '', { background: CHURCH_BACKGROUNDS.thankYou }),
      ],
    },
  ];
}

function seed(id: string, title: string, text: string, themeId: string, bg?: Background): Presentation {
  return { id, title, slides: parseLyrics(text), themeId, background: bg, folder: 'Songs' };
}

export const DEFAULT_SCREENS: Screen[] = [
  { id: 'screen_main', name: 'Audience', themeId: null, key: 'black', layers: { background: true, slide: true, props: true, messages: true, timer: true, announcements: true } },
  { id: 'screen_stream', name: 'OBS lyrics overlay (lower third)', themeId: 'theme_lower', key: 'transparent', layers: { background: false, slide: true, props: false, messages: false, timer: false, announcements: false } },
];

export function createSeedLibrary(): Library {
  const presentations = [
    seed('p_welcome', 'Welcome', WELCOME, 'theme_kccp', presetBackground('Black')),
    seed('p_grace', 'Amazing Grace', AMAZING_GRACE, 'theme_classic'),
    seed('p_doxology', 'Doxology', DOXOLOGY, 'theme_classic'),
    ...sundayTemplates(),
  ];
  presentations[1].arrangements = [{ id: 'arr_short', name: 'Short (V1 V2 V4)', groups: ['Verse 1', 'Verse 2', 'Verse 4'] }];
  return {
    version: 1,
    aspect: '4:3',
    transitionsReset: true,
    presentations,
    themes: DEFAULT_THEMES.map((t) => ({ ...t })),
    playlists: [{
      id: 'pl_main', name: 'Sunday Service',
      items: [
        { id: 'pli_h1', kind: 'header', title: 'Pre-service' },
        { id: 'pli_0', presentationId: 'p_welcome' },
        { id: 'pli_h2', kind: 'header', title: 'Worship' },
        { id: 'pli_1', presentationId: 'p_grace' },
        { id: 'pli_2', presentationId: 'p_doxology' },
      ],
    }],
    media: [],
    timers: [
      { id: 'timer_service', name: 'Service starts', kind: 'countdownTo', durationMs: 0, target: '11:00', running: true, startedAt: null, accumulatedMs: 0 },
      { id: 'timer_sermon', name: 'Sermon', kind: 'countdown', durationMs: 30 * 60000, target: '', running: false, startedAt: null, accumulatedMs: 0 },
      { id: 'timer_stopwatch', name: 'Stopwatch', kind: 'elapsed', durationMs: 0, target: '', running: false, startedAt: null, accumulatedMs: 0 },
    ],
    props: [
      { id: 'prop_clock', name: 'Clock', kind: 'clock', position: 'top-right', size: 40, color: '#ffffff', background: 'rgba(0,0,0,.45)' },
      { id: 'prop_bug', name: 'Church name', kind: 'text', text: 'Our Church', position: 'top-left', size: 34, color: '#ffffff', background: 'rgba(0,0,0,.35)' },
      { id: 'prop_countdown', name: 'Countdown', kind: 'timer', timerId: 'timer_service', position: 'center', size: 220, color: '#ffffff', background: 'transparent' },
    ],
    messageTemplates: [
      { id: 'msg_nursery', name: 'Nursery', template: 'Parent of #{number}, please come to the nursery' },
      { id: 'msg_car', name: 'Car', template: 'Car {plate}: your lights are on' },
      { id: 'msg_free', name: 'Free text', template: '{message}' },
    ],
    macros: [
      { id: 'macro_pre', name: 'Pre-service', color: '#2563eb', steps: [{ type: 'clearText' }, { type: 'background', background: presetBackground('Black') }, { type: 'prop', propId: 'prop_countdown', on: true }, { type: 'timer', timerId: 'timer_service', op: 'start' }] },
      { id: 'macro_start', name: 'Start service', color: '#16a34a', steps: [{ type: 'prop', propId: 'prop_countdown', on: false }, { type: 'go', presentationId: 'p_welcome', index: 0 }] },
      { id: 'macro_sermon', name: 'Sermon', color: '#9333ea', steps: [{ type: 'clearText' }, { type: 'timer', timerId: 'timer_sermon', op: 'reset' }, { type: 'timer', timerId: 'timer_sermon', op: 'start' }] },
      { id: 'macro_end', name: 'End / Black', color: '#dc2626', steps: [{ type: 'clearAll' }, { type: 'clearProps' }, { type: 'audio', mediaId: null }] },
    ],
    screens: DEFAULT_SCREENS.map((sc) => ({ ...sc, layers: { ...sc.layers } })),
    usage: [],
    sunday: {
      frontId: 'p_front', prayerId: 'p_prayer', backId: 'p_back', confessionSong: DEFAULT_CONFESSION_SONG,
      linesPerSlide: 4, translations: ['nkrv'], versesPerSlide: 1, styleVersion: 2,
    },
    schedules: [],
    logoMediaId: null,
    looks: [],
    stageLayouts: DEFAULT_STAGE_LAYOUTS.map((l) => ({ ...l })),
  };
}

const stage = (id: string, name: string, on: Partial<StageLayout>): StageLayout => ({
  id, name, clock: true, timers: true, current: false, next: false, notes: false, preview: false, chords: true, videoCountdown: true, scale: 1, ...on,
});
export const DEFAULT_STAGE_LAYOUTS: StageLayout[] = [
  stage('lyrics', 'Lyrics + next', { current: true, next: true }),
  stage('notes', 'Slide + notes', { current: true, notes: true }),
  stage('timer', 'Clock & timers', { scale: 1.6 }),
  stage('preview', 'Preview + next', { preview: true, next: true }),
];

export function createEmptyLive(lib: Library): LiveState {
  return {
    slide: null, title: null, nextText: null, theme: lib.themes[0],
    transition: { kind: 'cut', duration: 1 },
    background: presetBackground('Black'), black: false, message: null,
    activeProps: [], props: lib.props, timers: lib.timers, outputTimerId: null,
    screens: lib.screens, themes: lib.themes, copyright: null,
    video: { playing: true, restart: 0, loop: true },
    logo: false, logoMediaId: lib.logoMediaId, stageMessage: null, messageScroll: false, announcement: null, bgEffect: null,
  };
}
