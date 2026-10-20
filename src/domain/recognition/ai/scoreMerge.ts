// Filling one model's answer from the others, and merging an answer onto a song
// (shrlak/ppt src/lib/ai/scoreRecognition.ts, split for size).
import type { Section, Song } from '../utils/types';
import type { ParsedScore } from './scoreParser';
import { SAME_LINE_THRESHOLD } from './weightedConsensus';
import { adoptSplitVerses, adoptTruncatedTails } from './structuralFixes';
import { lineKey, lineSimilarity } from '../lyrics/textSimilarity';
import { findSection, sortSectionsByOrder } from '../utils/slidePlanner';
/**
 * Merge one page's winning answer with the other models' answers for that
 * page: whatever the winner missed (title, key, order, sections, sermon
 * fields) is filled from the next candidate that read it. Candidates whose
 * page classification contradicts the winner's are skipped — a model that
 * thinks the page is 악보 must not inject lyrics into a non-score verdict.
 */
export function fillScoreGaps(winner: ParsedScore, candidates: ParsedScore[]): ParsedScore {
  const merged: ParsedScore = { ...winner, order: [...winner.order], sections: [...winner.sections] };
  const usable: ParsedScore[] = [];
  for (const candidate of candidates) {
    if (merged.pageType && candidate.pageType && candidate.pageType !== merged.pageType) continue;
    usable.push(candidate);
    if (!merged.title && candidate.title) merged.title = candidate.title;
    if (!merged.key && candidate.key) merged.key = candidate.key;
    if (merged.order.length === 0 && candidate.order.length > 0) merged.order = [...candidate.order];
    if (merged.sections.length === 0 && candidate.sections.length > 0) {
      merged.sections = candidate.sections.map((section) => ({ label: section.label, lines: [...section.lines] }));
    }
    if (!merged.lyricRowCount && candidate.lyricRowCount) merged.lyricRowCount = candidate.lyricRowCount;
    if (!merged.sermonTitle && candidate.sermonTitle) merged.sermonTitle = candidate.sermonTitle;
    if (!merged.scripture && candidate.scripture) merged.scripture = candidate.scripture;
  }
  return adoptLineConsensus(adoptTruncatedTails(adoptSplitVerses(merged, usable), usable), usable);
}

/**
 * Let the models outvote each other line by line, one vote each.
 *
 * This is the unweighted fallback used where no reliability data is available
 * — the per-page rescue path and any pool with no measurements yet. Once a
 * model has verified evaluations behind it, buildWeightedConsensus supersedes
 * this by weighting each vote by that model's measured lyric accuracy.
 *
 * Most of what recognition still gets wrong is not structural — it is a
 * syllable or two inside an otherwise correct line. Those slips are
 * independent per model, so when two other models read a line the same way and
 * the winner reads it differently, the agreement is more likely to be the page.
 * A vote needs at least two other readings to beat the winner's one, so this is
 * inert for a single-model pool and for a pool of two.
 */
function adoptLineConsensus(score: ParsedScore, candidates: ParsedScore[]): ParsedScore {
  if (candidates.length < 2) return score;
  let touched = false;
  const sections = score.sections.map((section) => {
    // Only sections the candidate read with the same number of lines can be
    // aligned line-for-line; anything else would compare across a shifted part.
    const aligned = candidates
      .map((candidate) => findSection(candidate.sections, section.label))
      .filter((found): found is Section => !!found && found.lines.length === section.lines.length);
    if (aligned.length < 2) return section;

    let replaced = false;
    const lines = section.lines.map((line, index) => {
      const votes = new Map<string, { text: string; count: number }>();
      const add = (text: string) => {
        if (!text.trim()) return;
        const key = lineKey(text);
        const seen = votes.get(key);
        if (seen) seen.count += 1;
        else votes.set(key, { text, count: 1 });
      };
      add(line);
      for (const other of aligned) add(other.lines[index]);

      const own = votes.get(lineKey(line))?.count ?? 0;
      const best = [...votes.values()].sort((a, b) => b.count - a.count)[0];
      if (!best || best.count <= own) return line;
      if (lineSimilarity(best.text, line) < SAME_LINE_THRESHOLD) return line;
      replaced = true;
      return best.text;
    });

    if (!replaced) return section;
    touched = true;
    return { label: section.label, lines };
  });
  return touched ? { ...score, sections } : score;
}


function hasLyrics(song: Song): boolean {
  return song.sections.some((s) => s.lines.some((l) => l.trim().length > 0));
}

/** A stub title like "새 찬양 (p.3)" that recognition may replace. */
function isStubTitle(title: string): boolean {
  return !title.trim() || /^새 찬양/.test(title.trim());
}

/**
 * Merge a recognition result onto a song. Recognized lyrics/sections replace the
 * blank scaffold, but a title/key/order the user already set is kept. Returns a
 * new Song (never mutates the input).
 */
export function applyScoreToSong(song: Song, parsed: ParsedScore): Song {
  const next: Song = { ...song };

  if (parsed.title && isStubTitle(song.title)) next.title = parsed.title;
  if (parsed.key && !song.key) next.key = parsed.key;

  // Only fill sections/order if the user hasn't started writing lyrics.
  if (!hasLyrics(song) && parsed.sections.length > 0) {
    const recognized = parsed.sections.map((s) => ({ label: s.label, lines: [...s.lines] }));
    // The order the conti wrote for this song beats the one printed on the
    // 악보: the score shows every part, the conti says which ones we sing.
    const order = song.orderFromConti
      ? song.order
      : parsed.order.length > 0
        ? parsed.order
        : ['I', ...recognized.map((s) => s.label)]; // no printed order: derive one (title slide is "I")
    next.sections = sortSectionsByOrder(recognized, order);
    next.order = [...order];
  } else if (!song.orderFromConti && parsed.order.length > 0 && song.order.join('-') === 'I') {
    // Lyrics already present but order is still the default — accept the order.
    next.order = [...parsed.order];
  }

  return next;
}
