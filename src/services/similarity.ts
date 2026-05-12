/**
 * Lightweight, deterministic duplicate detection for newly generated puzzles.
 * No external dependencies, no embeddings — just normalized token Jaccard.
 *
 * Used by both the browser-side admin flow (puzzleGenerator.ts) and the
 * server-side cron (api/cron.ts). Keep this module pure and isomorphic.
 */

export interface ExistingPuzzleSummary {
  id?: string;
  title: string;
  theme: string;
  isTrueStory?: boolean;
  funFact?: string;
  firstCardText?: string;
}

export interface CandidatePuzzle {
  title: string;
  theme: string;
  isTrueStory?: boolean;
  funFact?: string;
  firstCardText?: string;
}

export interface SimilarityResult {
  warning?: string;
  score: number;
  matchedTitle?: string;
}

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'at', 'for', 'with', 'by']);

function normalizeTokens(input: string | undefined): Set<string> {
  if (!input) return new Set();
  const cleaned = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = cleaned.split(' ').filter(t => t.length > 1 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const TITLE_THRESHOLD = 0.6;
const FIRST_CARD_THRESHOLD = 0.5;
const FUN_FACT_THRESHOLD = 0.7;

export function checkSimilarity(
  candidate: CandidatePuzzle,
  existing: ExistingPuzzleSummary[]
): SimilarityResult {
  const candTitleTokens = normalizeTokens(candidate.title);
  const candFirstCardTokens = normalizeTokens(candidate.firstCardText);
  const candFunFactTokens = normalizeTokens(candidate.funFact);

  let bestScore = 0;
  let bestMatchTitle: string | undefined;
  let bestReason: string | undefined;

  for (const e of existing) {
    const titleScore = jaccard(candTitleTokens, normalizeTokens(e.title));

    if (titleScore >= TITLE_THRESHOLD) {
      if (titleScore > bestScore) {
        bestScore = titleScore;
        bestMatchTitle = e.title;
        bestReason = `title overlap ${titleScore.toFixed(2)}`;
      }
      continue;
    }

    if (e.theme && candidate.theme && e.theme === candidate.theme && candFirstCardTokens.size > 0) {
      const firstCardScore = jaccard(candFirstCardTokens, normalizeTokens(e.firstCardText));
      if (firstCardScore >= FIRST_CARD_THRESHOLD) {
        const composite = (titleScore + firstCardScore) / 2 + 0.1;
        if (composite > bestScore) {
          bestScore = composite;
          bestMatchTitle = e.title;
          bestReason = `same theme + first-card overlap ${firstCardScore.toFixed(2)}`;
        }
        continue;
      }
    }

    if (candidate.isTrueStory && e.isTrueStory && candFunFactTokens.size > 0) {
      const funFactScore = jaccard(candFunFactTokens, normalizeTokens(e.funFact));
      if (funFactScore >= FUN_FACT_THRESHOLD) {
        if (funFactScore > bestScore) {
          bestScore = funFactScore;
          bestMatchTitle = e.title;
          bestReason = `fun-fact overlap ${funFactScore.toFixed(2)}`;
        }
      }
    }
  }

  if (bestMatchTitle && bestReason) {
    return {
      warning: `Likely duplicate of "${bestMatchTitle}" (${bestReason})`,
      score: bestScore,
      matchedTitle: bestMatchTitle,
    };
  }

  return { score: 0 };
}
