import { useState, useEffect } from 'react';

export interface PuzzleReview {
  decision?: 'Keep' | 'Revise' | 'Cut';
  clarity?: 'Clear' | 'Mostly clear' | 'Confusing';
  difficulty?: 'Too easy' | 'Good' | 'Too hard';
  ending?: 'Weak' | 'Good' | 'Strong';
  readability?: 'Good' | 'Slightly long' | 'Too long';
  notes?: string;
}

export type PuzzleReviews = Record<string, PuzzleReview>;

const REVIEWS_STORAGE_KEY = 'then-what-dev-reviews';

export function usePuzzleReviews() {
  const [reviews, setReviews] = useState<PuzzleReviews>({});

  useEffect(() => {
    const saved = localStorage.getItem(REVIEWS_STORAGE_KEY);
    if (saved) {
      try {
        setReviews(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse dev reviews', e);
      }
    }
  }, []);

  const saveReview = (puzzleId: string, review: PuzzleReview) => {
    const newReviews = { ...reviews, [puzzleId]: review };
    setReviews(newReviews);
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(newReviews));
  };

  const clearAllReviews = () => {
    setReviews({});
    localStorage.removeItem(REVIEWS_STORAGE_KEY);
  };

  return {
    reviews,
    saveReview,
    clearAllReviews,
  };
}
