// The last stage of a recognition run, from the ppt site's LyricsGenerator: look each new song up
// on the web by its title, and put its published lyrics into the song part by part (the 악보 keeps
// the part labels and 진행, the web supplies the words — see mergeWebLyrics). Songs from the
// library never get here. Several plausible pages and none sure: the 악보's reading stays.
import { fetchWebLyricsForTitles, hasWebLyricsLookup, lyricSample } from '../lyrics/webLyrics';
import { mergeRankedWebLyrics, mergeWebLyrics } from '../lyrics/mergeWebLyrics';
import { hasSlideNumberParts, savedWordsInParts } from '../lyrics/savedLyrics';
import { applyScoreToSong } from '../ai/scoreMerge';
import { setSongs } from './job';
import type { RecognitionRun } from './songOutcomes';

export async function runWebLyricsPass(run: RecognitionRun): Promise<void> {
  const { job } = run;
  const pending = [...run.webQueue.entries()];
  if (pending.length === 0) return;
  if (!hasWebLyricsLookup()) {
    for (const [id, { score, engine }] of pending) run.settleWithoutWeb(id, score, engine, '가사를 읽지 못했습니다.');
    return;
  }
  run.enterPhase('web', pending.map(([id]) => id));
  await Promise.all(pending.map(async ([id, { score, engine, title, unread }]) => {
    const notFound = unread ? `${unread.trim()} 웹에서도 가사를 찾지 못했습니다.` : '가사를 읽지 못했고 웹에서도 찾지 못했습니다.';
    // What the models read is sent as matching evidence, so a page that merely shares this title
    // cannot be mistaken for this song; the title read off the 악보 is searched as well as the
    // conti's. A stand-in's saved words are this song's own, and better evidence.
    const standIn = job.standIns.get(id);
    const lookup = title
      ? await fetchWebLyricsForTitles([score.title, title], { sample: lyricSample(standIn ? standIn.entry.sections : score.sections) })
      : { candidates: [], links: [] };
    const auto = lookup.candidates.find((candidate) => candidate.decision === 'auto') ?? null;
    const review = lookup.candidates.filter((candidate) => candidate.decision === 'review');

    if (!auto && review.length > 0) {
      job.webCandidates.set(id, review);
      if (standIn) return run.settleWithoutWeb(id, score, engine, '');
      const normalized = mergeWebLyrics(score, null);
      setSongs(job, (current) => current.map((song) => (song.id === id ? { ...applyScoreToSong(song, normalized.score), verification: 'draft' } : song)));
      job.sources.set(id, 'models');
      run.markDone([id], engine);
      return;
    }
    if (!auto) return run.settleWithoutWeb(id, score, engine, notFound);
    const merged = mergeRankedWebLyrics(score, auto);
    if (merged.score.sections.length === 0) {
      run.failures.set(id, notFound);
      return;
    }
    // Saved words somebody confirmed stay: the 악보 and the page give the parts.
    if (standIn?.trusted) {
      const laid = savedWordsInParts(merged.score.sections, standIn.entry.sections, hasSlideNumberParts(standIn.entry.sections));
      if (laid.matched > 0) {
        run.applyRecognizedScore(id, { ...merged.score, sections: laid.sections }, engine, 'library');
        job.notify(`'${standIn.entry.title}'의 저장된 가사를 악보·웹의 파트 ${laid.matched}개에 나눠 넣었습니다.`);
        return;
      }
    }
    run.applyRecognizedScore(id, merged.score, engine, 'web');
    if (merged.outcome !== 'unused') {
      job.notify(merged.outcome === 'filled'
        ? `'${title}' 가사를 ${auto.sourceHost}에서 가져왔습니다.`
        : `'${title}' 가사를 ${auto.sourceHost}에서 찾아 ${merged.correctedParts}개 파트에 나눠 넣었습니다.`);
    }
  }));
}
