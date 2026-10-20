// After the title pass, which pages each card reads — the ppt site's LyricsGenerator: give every
// song the page that prints its title (alignPagesToConti), then join the pages of one song — its
// title printed again, a page carrying on the one before — and leave other songs' 악보 out
// (groupContiPages); with no cover list, cards that are one song become one (foldUnlistedPages).
import type { Song } from '../utils/types';
import type { ParsedScore } from '../ai/scoreParser';
import { alignPagesToConti, isPlaceholderTitle } from '../utils/contiAlignment';
import { foldUnlistedPages, groupContiPages } from '../utils/scorePages';
import { setOutcome, setSongs } from './job';
import { isNonScoreRecognition, type RecognitionRun } from './songOutcomes';

export interface PagePlan {
  active: Song[];
  images: string[];
  titles: ParsedScore[];
}

export function placePages(
  run: RecognitionRun,
  plan: PagePlan,
  spares: number[],
  spareImages: string[],
  readByPage: Map<number, ParsedScore>,
  imageByPage: Map<number, string>,
): PagePlan {
  const { job } = run;
  let { active, images, titles } = plan;

  // 콘티 순서대로 악보 배치: cards follow the conti's song order, but pages could only be handed
  // out in PDF order. Now that each page's title is known, give every song the page that carries it.
  const slots = alignPagesToConti(active.map((song) => song.title), titles.map((identity) => identity.title), active.map((song) => job.englishTitles.get(song.id)));
  if (slots.some((slot, index) => slot !== index)) {
    const pages = [...active.map((song) => song.pageIndex), ...spares];
    const permute = <T,>(values: T[]) => slots.map((slot) => values[slot]);
    const before = active.map((song) => song.pageIndex as number);
    active = active.map((song, index) => ({ ...song, pageIndex: pages[slots[index]] }));
    images = permute([...images, ...spareImages]);
    titles = permute(titles);
    const held = new Set(active.map((song) => song.pageIndex));
    job.spares = [...new Set([...job.spares, ...before])].filter((page) => !held.has(page)).sort((a, b) => a - b);
    const pageById = new Map(active.map((song) => [song.id, song.pageIndex]));
    setSongs(job, (current) => current.map((song) => (pageById.has(song.id) ? { ...song, pageIndex: pageById.get(song.id) } : song)));
    const moved = active.filter((song, index) => slots[index] !== index && !isPlaceholderTitle(song.title));
    if (moved.length > 0) job.notify(`악보 제목을 읽어 ${moved.map((song) => `'${song.title}'`).join(', ')}의 악보 페이지를 콘티 순서에 맞게 다시 짝지었습니다.`);
  }

  const titlePages = [...readByPage.keys()];
  if (job.listedOrder) {
    // Every page of the conti is read. A page no song took by its title joins the song it
    // belongs to, and is read along with it.
    const held = new Set(active.map((song) => song.pageIndex as number));
    const grouped = groupContiPages({
      songs: active.map((song) => ({ title: song.title, englishTitle: job.englishTitles.get(song.id) ?? readByPage.get(song.pageIndex as number)?.englishTitle, page: song.pageIndex as number })),
      spares: titlePages.filter((page) => !held.has(page)),
      musicPages: job.doc.parsed.musicPages,
      titleOf: (page) => readByPage.get(page)?.title,
      isNonScore: (page) => readByPage.get(page)?.pageType === 'non_score',
      bilingual: false,
    });
    const before = new Map(active.map((song) => [song.id, (song.extraPages ?? []).join(',')]));
    active = active.map((song, index) => {
      const [main, ...rest] = grouped.pages[index];
      if (main !== song.pageIndex) {
        images[index] = imageByPage.get(main) ?? images[index];
        titles[index] = readByPage.get(main) ?? titles[index];
      }
      return { ...song, pageIndex: main, extraPages: rest.length > 0 ? rest : undefined };
    });
    const holding = new Set(active.flatMap((song) => [song.pageIndex as number, ...(song.extraPages ?? [])]));
    job.spares = [...new Set([...job.spares, ...titlePages])].filter((page) => !holding.has(page)).sort((a, b) => a - b);
    const placed = new Map(active.map((song) => [song.id, song]));
    setSongs(job, (current) => current.map((song) => {
      const next = placed.get(song.id);
      return next ? { ...song, pageIndex: next.pageIndex, extraPages: next.extraPages } : song;
    }));
    const joined = active.filter((song) => song.extraPages && (song.extraPages ?? []).join(',') !== before.get(song.id));
    if (joined.length > 0) {
      const named = joined.map((song) => `'${song.title.trim() || '새 찬양'}'(${[song.pageIndex, ...(song.extraPages ?? [])].map((page) => `p.${page}`).join(', ')})`);
      job.notify(`악보가 여러 장인 곡은 한 곡으로 합쳐 모든 페이지를 읽습니다: ${named.join(', ')}.`);
    }
    const unclaimed = grouped.unclaimed.map((page) => `p.${page}`).join(', ');
    if (unclaimed && unclaimed !== job.reportedUnclaimed) job.notify(`${unclaimed}은(는) 콘티 순서에 없는 다른 곡의 악보라 찬양 편집에 넣지 않았습니다.`);
    job.reportedUnclaimed = unclaimed;
  } else if (active.length > 1) {
    // No list to go by, every 악보 page became a card: cards that are one song become one.
    const byPage = active.map((_, index) => index).sort((a, b) => (active[a].pageIndex as number) - (active[b].pageIndex as number));
    const heads = foldUnlistedPages(
      byPage.map((index) => ({
        page: active[index].pageIndex as number,
        title: titles[index]?.title ?? (isPlaceholderTitle(active[index].title) ? undefined : active[index].title),
        artist: titles[index]?.artist,
        englishTitle: titles[index]?.englishTitle,
        nonScore: !!titles[index] && isNonScoreRecognition(titles[index]),
      })),
      { bilingual: false, englishTitleOf: () => undefined },
    );
    const into = new Map<number, number>();
    heads.forEach((head, position) => {
      if (head !== position) into.set(byPage[position], byPage[head]);
    });
    if (into.size > 0) {
      const gained = new Map<number, number[]>();
      for (const [index, head] of into) {
        const song = active[index];
        gained.set(head, [...(gained.get(head) ?? []), song.pageIndex as number, ...(song.extraPages ?? [])]);
      }
      const removed = new Set([...into.keys()].map((index) => active[index].id));
      const headIds = new Set([...gained.keys()].map((index) => active[index].id));
      const keep = (_: unknown, index: number) => index >= active.length || !into.has(index);
      images = images.filter(keep);
      titles = titles.filter(keep);
      active = active
        .map((song, index) => (gained.has(index) ? { ...song, extraPages: [...(song.extraPages ?? []), ...(gained.get(index) ?? [])].sort((a, b) => a - b) } : song))
        .filter((_, index) => !into.has(index));
      const extras = new Map(active.map((song) => [song.id, song.extraPages]));
      setSongs(job, (current) => current.filter((song) => !removed.has(song.id)).map((song) => (extras.get(song.id) ? { ...song, extraPages: extras.get(song.id) } : song)));
      for (const id of removed) {
        run.resolved.add(id);
        setOutcome(job, id, null);
      }
      run.dropTracked(removed);
      const named = active.flatMap((song, index) => headIds.has(song.id)
        ? [`'${titles[index]?.title?.trim() || song.title.trim() || '새 찬양'}'(${[song.pageIndex, ...(song.extraPages ?? [])].sort((a, b) => (a as number) - (b as number)).map((page) => `p.${page}`).join(', ')})`]
        : []);
      job.notify(`악보가 여러 장인 곡은 한 곡으로 합쳐 모든 페이지를 읽습니다: ${named.join(', ')}.`);
    }
  }
  return { active, images, titles: titles.slice(0, active.length) };
}
