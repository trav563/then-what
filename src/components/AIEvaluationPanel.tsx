import React, { useState, useEffect } from 'react';
import { getPuzzles, savePuzzle } from '../services/db';
import { evaluatePuzzle } from '../services/puzzleEvaluator';
import { PuzzleEvaluation, PuzzleRecord } from '../types';
import { X, Play, Loader2, Download, Copy, Check } from 'lucide-react';

interface Props {
  onClose: () => void;
  onSelectPuzzle: (id: string) => void;
}

export function AIEvaluationPanel({ onClose, onSelectPuzzle }: Props) {
  const [evaluations, setEvaluations] = useState<Record<string, PuzzleEvaluation>>({});
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<'text' | 'json'>('text');
  const [copied, setCopied] = useState(false);
  const [candidates, setCandidates] = useState<PuzzleRecord[]>([]);

  useEffect(() => {
    const allPuzzles = getPuzzles();
    const cands = allPuzzles.filter(p => p.status === 'draft' || p.status === 'ai_reviewed');
    setCandidates(cands);
    
    const evals: Record<string, PuzzleEvaluation> = {};
    cands.forEach(p => {
      if (p.evaluation) {
        evals[p.id] = p.evaluation;
      }
    });
    setEvaluations(evals);
  }, []);

  const handleEvaluateAll = async () => {
    setIsEvaluating(true);
    setProgress({ current: 0, total: candidates.length });
    
    const newEvals = { ...evaluations };
    
    for (let i = 0; i < candidates.length; i++) {
      const puzzle = candidates[i];
      if (!newEvals[puzzle.id]) {
        try {
          const result = await evaluatePuzzle(puzzle);
          newEvals[puzzle.id] = result;
          setEvaluations({ ...newEvals });
          savePuzzle({ ...puzzle, evaluation: result, status: 'ai_reviewed' });
        } catch (e) {
          console.error(`Failed to evaluate ${puzzle.id}`, e);
        }
      }
      setProgress({ current: i + 1, total: candidates.length });
    }
    
    setIsEvaluating(false);
    setCandidates(getPuzzles().filter(p => p.status === 'draft' || p.status === 'ai_reviewed'));
  };

  const sortedCandidates = [...candidates].sort((a, b) => {
    const evalA = evaluations[a.id];
    const evalB = evaluations[b.id];
    if (!evalA && !evalB) return 0;
    if (!evalA) return 1;
    if (!evalB) return -1;
    
    const scoreA = evalA.clarity + evalA.endingStrength + evalA.anchorStrength - evalA.ambiguityRisk + evalA.novelty;
    const scoreB = evalB.clarity + evalB.endingStrength + evalB.anchorStrength - evalB.ambiguityRisk + evalB.novelty;
    return scoreB - scoreA;
  });

  const generateExport = (format: 'text' | 'json') => {
    const evaluatedPuzzles = sortedCandidates.filter(p => evaluations[p.id]);
    
    if (evaluatedPuzzles.length === 0) {
      return "No evaluations exist yet. Please evaluate puzzles first.";
    }

    if (format === 'json') {
      const exportObj = evaluatedPuzzles.map((p, index) => {
        const ev = evaluations[p.id];
        return {
          rank: index + 1,
          id: p.id,
          title: p.title,
          theme: p.theme,
          recommendedDecision: ev.recommendedDecision,
          shortReason: ev.shortReason,
          clarity: ev.clarity,
          endingStrength: ev.endingStrength,
          anchorStrength: ev.anchorStrength,
          ambiguityRisk: ev.ambiguityRisk,
          novelty: ev.novelty,
          likelyDifficulty: ev.likelyDifficulty
        };
      });
      return JSON.stringify(exportObj, null, 2);
    }

    return evaluatedPuzzles.map((p, index) => {
      const ev = evaluations[p.id];
      return `#${index + 1} | ${ev.recommendedDecision} | ${p.id} | ${p.title}
Theme: ${p.theme}
Reason: ${ev.shortReason}
Scores: clarity=${ev.clarity}, ending=${ev.endingStrength}, anchor=${ev.anchorStrength}, ambiguity=${ev.ambiguityRisk}, novelty=${ev.novelty}, difficulty=${ev.likelyDifficulty}`;
    }).join('\n\n');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateExport(exportFormat));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">AI Puzzle Evaluation</h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowExport(!showExport)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                showExport ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Download className="w-4 h-4" />
              Export Ranked Results
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>
        
        {showExport && (
          <div className="p-4 border-b border-slate-100 bg-indigo-50/50 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                <button
                  onClick={() => setExportFormat('text')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                    exportFormat === 'text' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Plain Text
                </button>
                <button
                  onClick={() => setExportFormat('json')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                    exportFormat === 'json' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  JSON
                </button>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy Export'}
              </button>
            </div>
            <textarea 
              readOnly 
              value={generateExport(exportFormat)}
              className="w-full h-48 p-3 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-700 focus:outline-none resize-none"
            />
          </div>
        )}

        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600">
              Evaluate {candidates.length} candidate puzzles using Gemini.
            </p>
            {isEvaluating && (
              <p className="text-xs font-medium text-indigo-600 mt-1">
                Evaluating {progress.current} of {progress.total}...
              </p>
            )}
          </div>
          <button
            onClick={handleEvaluateAll}
            disabled={isEvaluating}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-sm font-bold transition-colors"
          >
            {isEvaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isEvaluating ? 'Evaluating...' : 'Evaluate All'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
          {sortedCandidates.map(puzzle => {
            const ev = evaluations[puzzle.id];
            return (
              <div key={puzzle.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      {puzzle.title}
                      <span className="text-xs font-medium text-slate-400 font-mono">({puzzle.id})</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Theme: {puzzle.theme}</p>
                  </div>
                  <button
                    onClick={() => {
                      onSelectPuzzle(puzzle.id);
                      onClose();
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                  >
                    Playtest
                  </button>
                </div>
                
                {!ev ? (
                  <div className="text-sm text-slate-400 italic">Not evaluated yet.</div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                        ev.recommendedDecision === 'Keep' ? 'bg-emerald-100 text-emerald-700' :
                        ev.recommendedDecision === 'Revise' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {ev.recommendedDecision}
                      </span>
                      <span className="text-sm text-slate-700">{ev.shortReason}</span>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                      <ScoreBox label="Clarity" score={ev.clarity} />
                      <ScoreBox label="Ending" score={ev.endingStrength} />
                      <ScoreBox label="Anchor" score={ev.anchorStrength} />
                      <ScoreBox label="Ambiguity" score={ev.ambiguityRisk} invert />
                      <ScoreBox label="Novelty" score={ev.novelty} />
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 flex flex-col items-center justify-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Difficulty</span>
                        <span className="text-sm font-bold text-slate-700">{ev.likelyDifficulty}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {candidates.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No candidate puzzles found. All puzzles are either approved or cut.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreBox({ label, score, invert = false }: { label: string, score: number, invert?: boolean }) {
  // For ambiguity, lower is better. For others, higher is better.
  const isGood = invert ? score <= 3 : score >= 8;
  const isBad = invert ? score >= 8 : score <= 3;
  
  return (
    <div className={`p-2 rounded-lg border flex flex-col items-center justify-center ${
      isGood ? 'bg-emerald-50 border-emerald-100' :
      isBad ? 'bg-red-50 border-red-100' :
      'bg-slate-50 border-slate-100'
    }`}>
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</span>
      <span className={`text-lg font-black ${
        isGood ? 'text-emerald-600' :
        isBad ? 'text-red-600' :
        'text-slate-700'
      }`}>{score}</span>
    </div>
  );
}
