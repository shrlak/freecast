// Structural repairs one reading takes from the others: split verses, truncated tails
// (shrlak/ppt src/lib/ai/weightedConsensus.ts, split for size).
import type { Section } from '../utils/types';
import { bagSimilarity, lineSimilarity, wordCounts } from '../lyrics/textSimilarity';
import { findSection } from '../utils/slidePlanner';
import { partFamily, type ParsedScore } from './scoreParser';
import { SAME_LINE_THRESHOLD, SAME_LYRICS_THRESHOLD } from './weightedConsensus';
/**
 * Put back lines the leading model stopped short of.
 *
 * Several songs lose their last line or two rather than misreading them. The
 * asymmetry that makes this safe is the same one behind verse splitting: a
 * model that stops early is common, a model that invents an extra printed line
 * is not. Only a candidate whose reading STARTS WITH the leader's may extend
 * it, and only the extra tail is taken, so a fuller but sloppier reading
 * contributes its missing lines without importing its misreadings.
 */
export function adoptTruncatedTails(score: ParsedScore, candidates: ParsedScore[]): ParsedScore {
  if (candidates.length === 0) return score;
  let touched = false;
  const sections = score.sections.map((section) => {
    let best: string[] | undefined;
    for (const candidate of candidates) {
      const other = findSection(candidate.sections, section.label);
      if (!other || other.lines.length <= section.lines.length) continue;
      const continues = section.lines.every(
        (line, index) => lineSimilarity(line, other.lines[index] ?? '') >= SAME_LINE_THRESHOLD,
      );
      if (!continues) continue;
      if (!best || other.lines.length > best.length) best = other.lines;
    }
    if (!best) return section;
    touched = true;
    return { label: section.label, lines: [...section.lines, ...best.slice(section.lines.length)] };
  });
  return touched ? { ...score, sections } : score;
}

/**
 * Put stacked verses back when the leading model merged them.
 *
 * A page that prints 1절 above 2절 under shared staves is the one structure
 * models reliably get wrong: the merged reading is a single V holding both
 * verses. It is never wrong in the other direction — no model invents a 2절
 * that isn't printed — so when another model split the same part family into
 * numbered sections covering the same words, that split is the true reading.
 * Adopting it also has to teach 진행 순서 about the new labels, otherwise the
 * slide planner would never reach the recovered verse.
 */
export function adoptSplitVerses(winner: ParsedScore, candidates: ParsedScore[]): ParsedScore {
  const families = new Map<string, Section[]>();
  for (const section of winner.sections) {
    const family = partFamily(section.label);
    families.set(family, [...(families.get(family) ?? []), section]);
  }

  let result = winner;
  for (const [family, own] of families) {
    if (own.length !== 1) continue; // already split, or absent
    const better = candidates
      .map((candidate) => candidate.sections.filter((section) => partFamily(section.label) === family))
      .filter((split) => split.length > own.length)
      .filter((split) => bagSimilarity(wordCounts(split), wordCounts(own)) >= SAME_LYRICS_THRESHOLD)
      // Prefer the finest split that still reads as the same lyrics.
      .sort((a, b) => b.length - a.length)[0];
    if (!better) continue;
    result = replaceFamily(result, family, better);
  }
  return result;
}

/** Swap a family's single merged section for the split one, in place, and make
 * sure every recovered label is reachable from 진행 순서. */
function replaceFamily(score: ParsedScore, family: string, split: Section[]): ParsedScore {
  const sections: Section[] = [];
  for (const section of score.sections) {
    if (partFamily(section.label) !== family) {
      sections.push(section);
      continue;
    }
    sections.push(...split.map((s) => ({ label: s.label, lines: [...s.lines] })));
  }

  // Only add an order token for a label the printed 진행 순서 cannot already
  // reach. Resolution goes through the slide planner's own V↔V1 aliasing, so a
  // page that printed "V1" already reaches a bare "V" — re-inserting it would
  // put a token in 진행 순서 that the score never had.
  const order = [...score.order];
  const reached = new Set(
    order.map((token) => findSection(sections, token)?.label).filter((label): label is string => !!label),
  );
  const missing = split.map((s) => s.label).filter((label) => !reached.has(label));
  if (missing.length > 0) {
    const anchor = order.findIndex((token) => partFamily(token) === family);
    if (anchor === -1) order.push(...missing);
    else order.splice(anchor + 1, 0, ...missing);
  }
  return { ...score, sections, order };
}
