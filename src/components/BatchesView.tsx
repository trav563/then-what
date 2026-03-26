import React, { useState, useEffect } from 'react';
import { fetchBatches, upsertBatch, fetchAllPuzzlesMapped, upsertPuzzleMapped, fetchSchedule, upsertScheduleEntry } from '../services/supabase';
import { GenerationBatch, GenerationSettings, PuzzleRecord } from '../types';
import { generatePuzzles } from '../services/puzzleGenerator';
import { evaluatePuzzle } from '../services/puzzleEvaluator';
import { Plus, Loader2, ChevronRight, CheckCircle2, AlertTriangle, AlertCircle, Database } from 'lucide-react';
import { humanizeTheme } from '../utils';

export function BatchesView({ onPreviewPuzzle }: { onPreviewPuzzle: (id: string) => void }) {
  const [batches, setBatches] = useState<GenerationBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');

  // Form state
  const [count, setCount] = useState(10);
  const [themeMix, setThemeMix] = useState('');
  const [instructionEmphasis, setInstructionEmphasis] = useState('');
  const [excludeThemes, setExcludeThemes] = useState('');

  useEffect(() => {
    fetchBatches().then(b => setBatches(b as GenerationBatch[]));
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgress('Generating puzzles...');
    
    try {
      const settings: GenerationSettings = {
        count,
        themeMix,
        instructionEmphasis,
        excludeThemes
      };

      const newPuzzles = await generatePuzzles(settings);
      
      const batchId = `batch_${Date.now()}`;
      const puzzleIds = newPuzzles.map(p => p.id);
      
      const newBatch: GenerationBatch = {
        id: batchId,
        createdAt: Date.now(),
        settings,
        puzzleIds,
        status: 'evaluating'
      };

      // Save draft puzzles to Supabase
      for (const p of newPuzzles) {
        p.generationBatchId = batchId;
        await upsertPuzzleMapped(p);
      }
      
      await upsertBatch(newBatch);
      setBatches(await fetchBatches() as GenerationBatch[]);
      setSelectedBatchId(batchId);

      // Evaluate puzzles
      let evaluatedCount = 0;
      for (const puzzle of newPuzzles) {
        setProgress(`Evaluating puzzle ${evaluatedCount + 1} of ${newPuzzles.length}...`);
        try {
          const evaluation = await evaluatePuzzle(puzzle);
          puzzle.evaluation = evaluation;
          puzzle.status = 'ai_reviewed';
          await upsertPuzzleMapped(puzzle);
        } catch (e) {
          console.error("Failed to evaluate puzzle", puzzle.id, e);
        }
        evaluatedCount++;
      }

      // Update batch status
      newBatch.status = 'completed';
      
      // Calculate summary
      const updatedPuzzles = await fetchAllPuzzlesMapped();
      const batchPuzzles = updatedPuzzles.filter((p: any) => puzzleIds.includes(p.id));
      const validEvals = batchPuzzles.filter((p: any) => p.evaluation);
      
      if (validEvals.length > 0) {
        const avgEnding = validEvals.reduce((sum: number, p: any) => sum + (p.evaluation?.endingStrength || 0), 0) / validEvals.length;
        const avgAmbiguity = validEvals.reduce((sum: number, p: any) => sum + (p.evaluation?.ambiguityRisk || 0), 0) / validEvals.length;
        
        const themes: Record<string, number> = {};
        batchPuzzles.forEach((p: any) => {
          themes[p.theme] = (themes[p.theme] || 0) + 1;
        });

        const sortedByScore = [...validEvals].sort((a: any, b: any) => {
          const scoreA = (a.evaluation?.clarity || 0) + (a.evaluation?.endingStrength || 0) - (a.evaluation?.ambiguityRisk || 0);
          const scoreB = (b.evaluation?.clarity || 0) + (b.evaluation?.endingStrength || 0) - (b.evaluation?.ambiguityRisk || 0);
          return scoreB - scoreA;
        });

        newBatch.summary = {
          strongestCandidates: sortedByScore.slice(0, 3).map((p: any) => p.id),
          weakestCandidates: sortedByScore.slice(-3).map((p: any) => p.id),
          themeDistribution: themes,
          averageEndingStrength: avgEnding,
          averageAmbiguityRisk: avgAmbiguity
        };
      }

      await upsertBatch(newBatch);
      setBatches(await fetchBatches() as GenerationBatch[]);
      setProgress('');
    } catch (error) {
      console.error(error);
      alert('Failed to generate batch. See console.');
    } finally {
      setIsGenerating(false);
    }
  };

  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden">
      {/* Sidebar: Batch List & Generator — scrolls on mobile */}
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-200 bg-white flex flex-col shrink-0 max-h-[50vh] md:max-h-full md:h-full overflow-hidden">
        <div className="p-3 md:p-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-800 mb-3">Generate New Batch</h3>
          
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Count</label>
              <select 
                value={count} 
                onChange={e => setCount(Number(e.target.value))}
                className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white"
                disabled={isGenerating}
              >
                <option value={10}>10 Puzzles</option>
                <option value={20}>20 Puzzles</option>
                <option value={30}>30 Puzzles</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Theme Mix (Optional)</label>
              <input 
                type="text" 
                value={themeMix}
                onChange={e => setThemeMix(e.target.value)}
                placeholder="e.g. mostly office chaos"
                className="w-full text-sm p-2 rounded-lg border border-slate-200"
                disabled={isGenerating}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Instruction Emphasis (Optional)</label>
              <input 
                type="text" 
                value={instructionEmphasis}
                onChange={e => setInstructionEmphasis(e.target.value)}
                placeholder="e.g. stronger endings"
                className="w-full text-sm p-2 rounded-lg border border-slate-200"
                disabled={isGenerating}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Exclude Themes (Optional)</label>
              <input 
                type="text" 
                value={excludeThemes}
                onChange={e => setExcludeThemes(e.target.value)}
                placeholder="e.g. dating, pets"
                className="w-full text-sm p-2 rounded-lg border border-slate-200"
                disabled={isGenerating}
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
              ) : (
                <><Plus className="w-4 h-4" /> Generate Batch</>
              )}
            </button>
            
            {isGenerating && progress && (
              <div className="text-xs text-center text-indigo-600 font-medium animate-pulse">
                {progress}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2 py-2">Past Batches</h3>
          {batches.map(batch => (
            <button
              key={batch.id}
              onClick={() => setSelectedBatchId(batch.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                selectedBatchId === batch.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  <span>{new Date(batch.createdAt).toLocaleDateString()}</span>
                  <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">{batch.settings.count}</span>
                </div>
                <div className="text-xs opacity-70 truncate flex items-center gap-2 mt-0.5">
                  <span className="capitalize">{batch.status === 'completed' ? 'Evaluated' : batch.status}</span>
                  {batch.summary?.strongestCandidates && (
                    <span className="text-emerald-600 font-medium flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> {batch.summary.strongestCandidates.length}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className={`w-4 h-4 shrink-0 ml-2 ${selectedBatchId === batch.id ? 'opacity-100' : 'opacity-0'}`} />
            </button>
          ))}
          {batches.length === 0 && (
            <div className="text-sm text-slate-400 text-center py-4">No batches yet</div>
          )}
        </div>
      </div>

      {/* Main Content: Batch Details */}
      <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-6">
        {selectedBatch ? (
          <BatchDetail batch={selectedBatch} onPreviewPuzzle={onPreviewPuzzle} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 max-w-md mx-auto text-center space-y-4">
            <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
              <Database className="w-8 h-8 text-slate-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-700">Batch Generation</h2>
            <p className="text-sm">
              Generate new puzzles in bulk using AI. The system will automatically create puzzles based on your settings, evaluate them for quality, and flag the strongest candidates for your review.
            </p>
            <p className="text-sm">
              Select a past batch from the sidebar or generate a new one to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function BatchDetail({ batch, onPreviewPuzzle }: { batch: GenerationBatch, onPreviewPuzzle: (id: string) => void }) {
  const [puzzles, setPuzzles] = useState<PuzzleRecord[]>([]);
  const [scheduleDate, setScheduleDate] = useState('');
  const [schedulingPuzzleId, setSchedulingPuzzleId] = useState<string | null>(null);

  useEffect(() => {
    fetchAllPuzzlesMapped().then(allPuzzles => {
      const batchPuzzles = (allPuzzles as PuzzleRecord[]).filter(p => batch.puzzleIds.includes(p.id));
      
      batchPuzzles.sort((a, b) => {
        const recA = a.evaluation?.recommendedDecision === 'approve' ? 2 : a.evaluation?.recommendedDecision === 'revise' ? 1 : 0;
        const recB = b.evaluation?.recommendedDecision === 'approve' ? 2 : b.evaluation?.recommendedDecision === 'revise' ? 1 : 0;
        if (recA !== recB) return recB - recA;
        
        const scoreA = (a.evaluation?.clarity || 0) + (a.evaluation?.endingStrength || 0) - (a.evaluation?.ambiguityRisk || 0);
        const scoreB = (b.evaluation?.clarity || 0) + (b.evaluation?.endingStrength || 0) - (b.evaluation?.ambiguityRisk || 0);
        return scoreB - scoreA;
      });
      
      setPuzzles(batchPuzzles);
    });
  }, [batch]);

  const handleStatusChange = async (id: string, newStatus: PuzzleRecord['status']) => {
    const puzzle = puzzles.find(p => p.id === id);
    if (!puzzle) return;
    
    const updated = { ...puzzle, status: newStatus };
    if (newStatus === 'approved') updated.approvedAt = Date.now();
    if (newStatus === 'retired') updated.retiredAt = Date.now();
    if (newStatus === 'rejected') updated.rejectedAt = Date.now();
    
    await upsertPuzzleMapped(updated);
    
    setPuzzles(current => current.map(p => p.id === id ? updated : p));
  };

  const handleFactChange = async (id: string, prop: 'isTrueStory' | 'funFact', value: any) => {
    const puzzle = puzzles.find(p => p.id === id);
    if (!puzzle) return;
    const updated = { ...puzzle, [prop]: value };
    await upsertPuzzleMapped(updated);
    setPuzzles(current => current.map(p => p.id === id ? updated : p));
  };

  const handleSchedule = async (id: string) => {
    if (!scheduleDate) return;
    
    const todayStr = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    if (scheduleDate < todayStr) {
      alert('Cannot schedule puzzles in the past.');
      return;
    }
    
    const puzzle = puzzles.find(p => p.id === id);
    if (!puzzle || puzzle.status !== 'approved') {
      alert('Only approved puzzles can be scheduled.');
      return;
    }
    
    const schedule = await fetchSchedule();
    
    if (schedule[scheduleDate] && schedule[scheduleDate] !== id) {
      const oldPuzzleId = schedule[scheduleDate];
      const allPuzzles = await fetchAllPuzzlesMapped();
      const oldPuzzle = (allPuzzles as PuzzleRecord[]).find(p => p.id === oldPuzzleId);
      if (oldPuzzle && oldPuzzle.status === 'scheduled') {
        await upsertPuzzleMapped({ ...oldPuzzle, status: 'approved', scheduledFor: undefined });
      }
    }
    
    await upsertScheduleEntry(scheduleDate, id);
    
    const updated = { ...puzzle, status: 'scheduled' as const, scheduledFor: scheduleDate };
    await upsertPuzzleMapped(updated);
    setPuzzles(current => current.map(p => p.id === id ? updated : p));
    
    setSchedulingPuzzleId(null);
    setScheduleDate('');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-2">
          Batch {new Date(batch.createdAt).toLocaleString()}
        </h2>
        <div className="flex flex-wrap gap-4 text-sm text-slate-600 mb-4">
          <div><span className="font-medium">Count:</span> {batch.settings.count}</div>
          {batch.settings.themeMix && <div><span className="font-medium">Theme:</span> {batch.settings.themeMix}</div>}
          {batch.settings.instructionEmphasis && <div><span className="font-medium">Emphasis:</span> {batch.settings.instructionEmphasis}</div>}
          {batch.settings.excludeThemes && <div><span className="font-medium">Excluded:</span> {batch.settings.excludeThemes}</div>}
          <div><span className="font-medium">Status:</span> {batch.status}</div>
        </div>

        {batch.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
            <div className="bg-slate-50 p-3 rounded-lg">
              <div className="text-xs text-slate-500 mb-1">Avg Ending Strength</div>
              <div className="text-lg font-bold text-slate-800">{batch.summary.averageEndingStrength.toFixed(1)}/10</div>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <div className="text-xs text-slate-500 mb-1">Avg Ambiguity Risk</div>
              <div className="text-lg font-bold text-slate-800">{batch.summary.averageAmbiguityRisk.toFixed(1)}/10</div>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg col-span-2">
              <div className="text-xs text-slate-500 mb-1">Top Themes</div>
              <div className="text-sm text-slate-800 truncate">
                {Object.entries(batch.summary.themeDistribution)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([theme, count]) => `${theme} (${count})`)
                  .join(', ')}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="font-bold text-slate-800">Generated Puzzles ({puzzles.length})</h3>
        
        {puzzles.map(puzzle => {
          const isStrongest = batch.summary?.strongestCandidates?.includes(puzzle.id);
          const isWeakest = batch.summary?.weakestCandidates?.includes(puzzle.id);
          
          return (
            <div key={puzzle.id} className={`bg-white p-5 rounded-xl shadow-sm border flex flex-col gap-4 relative overflow-hidden ${
              isStrongest ? 'border-emerald-300' : isWeakest ? 'border-red-300' : 'border-slate-200'
            }`}>
              {isStrongest && <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>}
              {isWeakest && <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>}
              
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-lg text-slate-800">{puzzle.title}</h4>
                    {isStrongest && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Top Candidate</span>}
                    {isWeakest && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Weak Candidate</span>}
                  </div>
                  <div className="text-sm text-slate-500 flex items-center gap-2">
                    <span className="bg-slate-100 px-2 py-0.5 rounded text-xs">{humanizeTheme(puzzle.theme)}</span>
                    <span>Status: <span className="font-medium">{puzzle.status}</span></span>
                  </div>
                </div>
              <div className="flex gap-2">
                {puzzle.status === 'approved' && (
                  <div className="flex items-center gap-2 mr-2">
                    <input
                      type="date"
                      min={new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]}
                      value={schedulingPuzzleId === puzzle.id ? scheduleDate : ''}
                      onChange={(e) => {
                        setSchedulingPuzzleId(puzzle.id);
                        setScheduleDate(e.target.value);
                      }}
                      className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-slate-50"
                    />
                    <button
                      onClick={() => handleSchedule(puzzle.id)}
                      disabled={!scheduleDate || schedulingPuzzleId !== puzzle.id}
                      className="px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                      Schedule
                    </button>
                  </div>
                )}
                <select
                  value={puzzle.status}
                  onChange={(e) => handleStatusChange(puzzle.id, e.target.value as PuzzleRecord['status'])}
                  className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-slate-50"
                >
                  <option value="draft">Draft</option>
                  <option value="ai_reviewed">AI Reviewed</option>
                  <option value="approved">Approved</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="published">Published</option>
                  <option value="rejected">Rejected</option>
                  <option value="retired">Retired</option>
                </select>
                <button
                  onClick={() => onPreviewPuzzle(puzzle.id)}
                  className="px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors"
                >
                  Preview
                </button>
              </div>
            </div>

            {puzzle.similarityWarning && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {puzzle.similarityWarning}
              </div>
            )}

            {puzzle.evaluation && (
              <div className={`p-3 rounded-lg border text-sm ${
                puzzle.evaluation.recommendedDecision === 'approve' ? 'bg-emerald-50 border-emerald-100 text-emerald-900' :
                puzzle.evaluation.recommendedDecision === 'revise' ? 'bg-amber-50 border-amber-100 text-amber-900' :
                'bg-red-50 border-red-100 text-red-900'
              }`}>
                <div className="flex items-center gap-2 font-bold mb-1">
                  {puzzle.evaluation.recommendedDecision === 'approve' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  {puzzle.evaluation.recommendedDecision === 'revise' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                  {puzzle.evaluation.recommendedDecision === 'reject' && <AlertCircle className="w-4 h-4 text-red-600" />}
                  AI Recommendation: {puzzle.evaluation.recommendedDecision.toUpperCase()}
                </div>
                <p className="mb-2">{puzzle.evaluation.shortReason}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-80">
                  <span>Clarity: {puzzle.evaluation.clarity}/10</span>
                  <span>Ending: {puzzle.evaluation.endingStrength}/10</span>
                  <span>Anchor: {puzzle.evaluation.anchorStrength}/10</span>
                  <span>Ambiguity: {puzzle.evaluation.ambiguityRisk}/10</span>
                  <span>Novelty: {puzzle.evaluation.novelty}/10</span>
                  <span>Diff: {puzzle.evaluation.likelyDifficulty}</span>
                </div>
              </div>
            )}

            <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1 border border-slate-100">
              {puzzle.cards.map((card, idx) => (
                <div key={card.id} className="flex gap-2">
                  <span className="text-slate-400 w-4 text-right shrink-0">{idx + 1}.</span>
                  <span className="text-slate-700">{card.text}</span>
                </div>
              ))}
            </div>

            {/* Fact Review Section */}
            <div className="bg-indigo-50/50 rounded-lg p-3 text-sm space-y-3 border border-indigo-100">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id={`true-${puzzle.id}`}
                  checked={puzzle.isTrueStory || false}
                  onChange={(e) => handleFactChange(puzzle.id, 'isTrueStory', e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor={`true-${puzzle.id}`} className="font-bold text-slate-700 text-xs cursor-pointer select-none">Bizarre True Story</label>
                {puzzle.isTrueStory && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ml-auto">True Story</span>}
                {!puzzle.isTrueStory && puzzle.funFact && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ml-auto">Fiction + Fact</span>}
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500">Fun Fact / Trivia (Shown on completion)</label>
                <textarea
                  value={puzzle.funFact || ''}
                  onChange={(e) => handleFactChange(puzzle.id, 'funFact', e.target.value)}
                  placeholder="Enter a true fact..."
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 min-h-[60px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
