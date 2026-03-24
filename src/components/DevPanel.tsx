import React, { useState, useEffect } from 'react';
import { getPuzzles, getSchedule } from '../services/db';
import { Settings, X, Copy, Trash2, Sparkles, Database } from 'lucide-react';
import { usePuzzleReviews, PuzzleReview } from '../hooks/usePuzzleReviews';
import { AIEvaluationPanel } from './AIEvaluationPanel';
import { AdminDashboard } from './AdminDashboard';

interface DevPanelProps {
  previewPuzzleId: string | null;
  setPreviewPuzzleId: (id: string | null) => void;
}

export function DevPanel({ previewPuzzleId, setPreviewPuzzleId }: DevPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const { reviews, saveReview, clearAllReviews } = usePuzzleReviews();
  const [currentReview, setCurrentReview] = useState<PuzzleReview>({});
  const [copied, setCopied] = useState(false);
  
  const puzzles = getPuzzles();
  const schedule = getSchedule();

  useEffect(() => {
    if (previewPuzzleId) {
      setCurrentReview(reviews[previewPuzzleId] || {});
    } else {
      setCurrentReview({});
    }
  }, [previewPuzzleId, reviews]);

  const handleReviewChange = (field: keyof PuzzleReview, value: string) => {
    if (!previewPuzzleId) return;
    const updated = { ...currentReview, [field]: value };
    setCurrentReview(updated);
    saveReview(previewPuzzleId, updated);
  };

  const handleCopyReviews = () => {
    navigator.clipboard.writeText(JSON.stringify(reviews, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClearReviews = () => {
    clearAllReviews();
    setShowClearConfirm(false);
  };

  // Only render in development mode — never in production
  const isDev = import.meta.env.DEV;
  if (!isDev) {
    return null;
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 p-3 bg-slate-900 text-white rounded-full shadow-lg hover:bg-slate-800 transition-colors z-50"
        aria-label="Open Dev Panel"
      >
        <Settings className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-[360px] md:w-[400px] bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden flex flex-col max-h-[85vh]">
      <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50 shrink-0">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-slate-500" />
          <h3 className="font-bold text-sm text-slate-700 uppercase tracking-wider">Dev Preview</h3>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      <div className="p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="flex gap-2">
          <button
            onClick={() => setShowAIPanel(true)}
            className="flex-1 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            AI Eval
          </button>
          <button
            onClick={() => setShowAdminDashboard(true)}
            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
          >
            <Database className="w-4 h-4" />
            Admin
          </button>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Select Puzzle
          </label>
          <select
            value={previewPuzzleId || ''}
            onChange={(e) => setPreviewPuzzleId(e.target.value || null)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            <option value="">Normal Daily Mode</option>
            <optgroup label="Scheduled Puzzles">
              {Object.entries(schedule).map(([date, id]) => {
                const puzzle = puzzles.find(p => p.id === id);
                return (
                  <option key={id} value={id}>
                    {date} - {puzzle?.title || '?'} ({id})
                  </option>
                );
              })}
            </optgroup>
            <optgroup label="Unscheduled / Candidate Puzzles">
              {puzzles
                .filter(p => !Object.values(schedule).includes(p.id) && p.status !== 'retired')
                .map(puzzle => (
                  <option key={puzzle.id} value={puzzle.id}>
                    {puzzle.title} ({puzzle.id})
                  </option>
                ))}
            </optgroup>
          </select>
        </div>

        {previewPuzzleId && (
          <>
            <div className="bg-orange-50 text-orange-800 p-3 rounded-xl text-xs font-medium border border-orange-100">
              Preview Mode Active. Game state and stats will not be saved to local storage.
            </div>

            <div className="border-t border-slate-100 pt-4 mt-2">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Puzzle Review</h4>
                <span className="text-xs font-medium text-slate-500">
                  {Object.keys(reviews).length} / {puzzles.length} Reviewed
                </span>
              </div>
              
              <div className="flex flex-col gap-3">
                <ReviewSelect 
                  label="Decision" 
                  value={currentReview.decision} 
                  onChange={(v) => handleReviewChange('decision', v)}
                  options={['Keep', 'Revise', 'Cut']} 
                />
                <ReviewSelect 
                  label="Clarity" 
                  value={currentReview.clarity} 
                  onChange={(v) => handleReviewChange('clarity', v)}
                  options={['Clear', 'Mostly clear', 'Confusing']} 
                />
                <ReviewSelect 
                  label="Difficulty" 
                  value={currentReview.difficulty} 
                  onChange={(v) => handleReviewChange('difficulty', v)}
                  options={['Too easy', 'Good', 'Too hard']} 
                />
                <ReviewSelect 
                  label="Ending" 
                  value={currentReview.ending} 
                  onChange={(v) => handleReviewChange('ending', v)}
                  options={['Weak', 'Good', 'Strong']} 
                />
                <ReviewSelect 
                  label="Readability" 
                  value={currentReview.readability} 
                  onChange={(v) => handleReviewChange('readability', v)}
                  options={['Good', 'Slightly long', 'Too long']} 
                />
                
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Notes
                  </label>
                  <textarea
                    value={currentReview.notes || ''}
                    onChange={(e) => handleReviewChange('notes', e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/10 min-h-[60px] resize-y"
                    placeholder="Any specific feedback..."
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 border-t border-slate-100 pt-4 mt-2">
              <button
                onClick={handleCopyReviews}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                {copied ? 'Copied!' : 'Export JSON'}
              </button>
              {showClearConfirm ? (
                <div className="flex gap-1">
                  <button
                    onClick={handleClearReviews}
                    className="flex items-center justify-center px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="flex items-center justify-center px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="flex items-center justify-center p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                  title="Clear all reviews"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </>
        )}

        <button
          onClick={() => setPreviewPuzzleId(null)}
          disabled={!previewPuzzleId}
          className={`w-full py-2.5 rounded-xl text-sm font-bold transition-colors shrink-0 ${
            previewPuzzleId 
              ? 'bg-slate-900 text-white hover:bg-slate-800' 
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          Reset to Daily Mode
        </button>
      </div>
      {showAIPanel && (
        <AIEvaluationPanel 
          onClose={() => setShowAIPanel(false)} 
          onSelectPuzzle={(id) => {
            setPreviewPuzzleId(id);
            setShowAIPanel(false);
          }} 
        />
      )}
      {showAdminDashboard && (
        <AdminDashboard 
          onClose={() => setShowAdminDashboard(false)}
          onPreviewPuzzle={(id) => {
            setPreviewPuzzleId(id);
            setShowAdminDashboard(false);
          }}
        />
      )}
    </div>
  );
}

function ReviewSelect({ label, value, onChange, options }: { label: string, value?: string, onChange: (val: string) => void, options: string[] }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              value === opt 
                ? 'bg-slate-800 text-white' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
