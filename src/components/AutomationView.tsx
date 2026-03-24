import React, { useState, useEffect } from 'react';
import { getAutomationSettings, saveAutomationSettings, getBatches, getPuzzles, savePuzzle, getSchedule, saveSchedule } from '../services/db';
import { checkAndRunAutomation, getInventoryHealth } from '../services/automation';
import { AutomationSettings, PuzzleRecord } from '../types';
import { Settings, Play, Loader2, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import { humanizeTheme } from '../utils';

export function AutomationView({ onPreviewPuzzle }: { onPreviewPuzzle: (id: string) => void }) {
  const [settings, setSettings] = useState<AutomationSettings>(getAutomationSettings());
  const [health, setHealth] = useState(getInventoryHealth());
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [topCandidates, setTopCandidates] = useState<PuzzleRecord[]>([]);
  const [recentBatch, setRecentBatch] = useState<any>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [schedulingPuzzleId, setSchedulingPuzzleId] = useState<string | null>(null);

  useEffect(() => {
    // Check automation on load
    const runCheck = async () => {
      if (settings.enabled && health.approvedUnscheduled < settings.threshold) {
        setIsGenerating(true);
        await checkAndRunAutomation(setProgress);
        setIsGenerating(false);
        setProgress('');
        setHealth(getInventoryHealth());
        loadTopCandidates();
      }
    };
    runCheck();
    loadTopCandidates();
  }, []);

  const loadTopCandidates = () => {
    const puzzles = getPuzzles();
    const batches = getBatches();
    const latestBatch = batches.length > 0 ? batches[0] : null;
    setRecentBatch(latestBatch);
    
    // Show top candidates from all pending ai_reviewed puzzles, prioritizing the latest batch
    const candidates = puzzles.filter(p => p.isAutoRecommended && (p.status === 'ai_reviewed' || p.status === 'approved'));
    setTopCandidates(candidates.sort((a, b) => b.createdAt - a.createdAt));
  };

  const handleSaveSettings = (newSettings: AutomationSettings) => {
    setSettings(newSettings);
    saveAutomationSettings(newSettings);
  };

  const handleRunNow = async () => {
    setIsGenerating(true);
    setProgress('Starting auto-generation...');
    await checkAndRunAutomation(setProgress, true);
    setIsGenerating(false);
    setProgress('');
    setHealth(getInventoryHealth());
    loadTopCandidates();
  };

  const handleStatusChange = (id: string, newStatus: PuzzleRecord['status']) => {
    const puzzle = topCandidates.find(p => p.id === id);
    if (!puzzle) return;
    
    const updated = { ...puzzle, status: newStatus };
    if (newStatus === 'approved') updated.approvedAt = Date.now();
    if (newStatus === 'retired') updated.retiredAt = Date.now();
    if (newStatus === 'rejected') updated.rejectedAt = Date.now();
    
    savePuzzle(updated);
    setHealth(getInventoryHealth());
    loadTopCandidates();
  };

  const handleSchedule = (id: string) => {
    if (!scheduleDate) return;
    
    const todayStr = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    if (scheduleDate < todayStr) {
      alert('Cannot schedule puzzles in the past.');
      return;
    }
    
    const puzzle = topCandidates.find(p => p.id === id);
    if (!puzzle || puzzle.status !== 'approved') {
      alert('Only approved puzzles can be scheduled.');
      return;
    }
    
    const schedule = getSchedule();
    
    if (schedule[scheduleDate] && schedule[scheduleDate] !== id) {
      const oldPuzzleId = schedule[scheduleDate];
      const allPuzzles = getPuzzles();
      const oldPuzzle = allPuzzles.find(p => p.id === oldPuzzleId);
      if (oldPuzzle && oldPuzzle.status === 'scheduled') {
        savePuzzle({ ...oldPuzzle, status: 'approved', scheduledFor: undefined });
      }
    }
    
    schedule[scheduleDate] = id;
    saveSchedule(schedule);
    
    const updated = { ...puzzle, status: 'scheduled' as const, scheduledFor: scheduleDate };
    savePuzzle(updated);
    
    setSchedulingPuzzleId(null);
    setScheduleDate('');
    setHealth(getInventoryHealth());
    loadTopCandidates();
  };

  return (
    <div className="flex h-full">
      {/* Sidebar: Settings */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col h-full overflow-y-auto shrink-0 p-4">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Settings className="w-4 h-4" /> Automation Settings
        </h3>
        
        <div className="space-y-4">
          <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={e => handleSaveSettings({ ...settings, enabled: e.target.checked })}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            <span className="text-sm font-medium text-slate-700">Enable Semiautomatic Generation</span>
          </label>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Approved Inventory Threshold</label>
            <input
              type="number"
              value={settings.threshold}
              onChange={e => handleSaveSettings({ ...settings, threshold: Number(e.target.value) })}
              className="w-full text-sm p-2 rounded-lg border border-slate-200"
              min="1"
            />
            <p className="text-xs text-slate-400 mt-1">Generate when approved unscheduled drops below this.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Batch Size</label>
            <select
              value={settings.batchSize}
              onChange={e => handleSaveSettings({ ...settings, batchSize: Number(e.target.value) })}
              className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white"
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
              value={settings.themeMix || ''}
              onChange={e => handleSaveSettings({ ...settings, themeMix: e.target.value })}
              placeholder="e.g. mostly office chaos"
              className="w-full text-sm p-2 rounded-lg border border-slate-200"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Instruction Emphasis (Optional)</label>
            <input
              type="text"
              value={settings.instructionEmphasis || ''}
              onChange={e => handleSaveSettings({ ...settings, instructionEmphasis: e.target.value })}
              placeholder="e.g. stronger endings"
              className="w-full text-sm p-2 rounded-lg border border-slate-200"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Exclude Themes (Optional)</label>
            <input
              type="text"
              value={settings.excludeThemes || ''}
              onChange={e => handleSaveSettings({ ...settings, excludeThemes: e.target.value })}
              placeholder="e.g. dating, pets"
              className="w-full text-sm p-2 rounded-lg border border-slate-200"
            />
          </div>

          <button
            onClick={handleRunNow}
            disabled={isGenerating}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 mt-4"
          >
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Running...</>
            ) : (
              <><Play className="w-4 h-4" /> Run Recommended Auto-Generation Now</>
            )}
          </button>
          
          {isGenerating && progress && (
            <div className="text-xs text-center text-indigo-600 font-medium animate-pulse">
              {progress}
            </div>
          )}
        </div>
      </div>

      {/* Main Content: Health & Candidates */}
      <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-6">
        
        {/* System Status */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-bold text-slate-800 mb-4">System Status</h2>
          <div className="flex items-center gap-4 mb-4">
            {isGenerating ? (
              <div className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg font-medium">
                <Loader2 className="w-5 h-5 animate-spin" /> Auto-generation running
              </div>
            ) : !settings.enabled ? (
              <div className="flex items-center gap-2 text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg font-medium">
                <Settings className="w-5 h-5" /> Automation disabled
              </div>
            ) : health.approvedUnscheduled < settings.threshold ? (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg font-medium">
                <AlertTriangle className="w-5 h-5" /> Below threshold
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg font-medium">
                <CheckCircle2 className="w-5 h-5" /> Healthy inventory
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-500 block mb-1">Last Run</span>
              <span className="font-medium text-slate-800">
                {recentBatch ? new Date(recentBatch.createdAt).toLocaleString() : 'Never'}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-500 block mb-1">Latest Batch Status</span>
              <span className="font-medium text-slate-800 capitalize">
                {recentBatch ? recentBatch.status : 'N/A'}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-500 block mb-1">Cooldown Status</span>
              <span className="font-medium text-slate-800">
                {recentBatch && (Date.now() - recentBatch.createdAt < 60 * 60 * 1000) ? (
                  <span className="text-amber-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Active (1h)</span>
                ) : 'Ready'}
              </span>
            </div>
          </div>
        </div>

        {/* Inventory Health */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Inventory Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className={`p-4 rounded-lg border ${health.approvedUnscheduled < settings.threshold ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <div className="text-sm text-slate-600 mb-1">Approved Unscheduled</div>
              <div className={`text-2xl font-bold ${health.approvedUnscheduled < settings.threshold ? 'text-red-700' : 'text-emerald-700'}`}>
                {health.approvedUnscheduled}
              </div>
              <div className="text-xs mt-1 opacity-80">Threshold: {settings.threshold}</div>
            </div>
            <div className="p-4 rounded-lg border bg-slate-50 border-slate-200">
              <div className="text-sm text-slate-600 mb-1">Days Scheduled Ahead</div>
              <div className="text-2xl font-bold text-slate-800">{health.daysScheduledAhead}</div>
            </div>
            <div className="p-4 rounded-lg border bg-slate-50 border-slate-200">
              <div className="text-sm text-slate-600 mb-1">AI Reviewed (Pending)</div>
              <div className="text-2xl font-bold text-slate-800">{health.aiReviewed}</div>
            </div>
          </div>
          
          {recentBatch && (
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-700">Latest Batch: {new Date(recentBatch.createdAt).toLocaleDateString()}</div>
                <div className="text-xs text-slate-500">
                  {recentBatch.puzzleIds.length} puzzles generated • {recentBatch.status}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-slate-700">
                  {recentBatch.summary?.strongestCandidates?.length || 0} Strong Candidates
                </div>
                <div className="text-xs text-slate-500">
                  Avg Ending: {recentBatch.summary?.averageEndingStrength?.toFixed(1) || '-'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Top Candidates */}
        <div>
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            Top Auto-Recommended Candidates
            <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded-full">{topCandidates.length}</span>
          </h2>
          
          {topCandidates.length === 0 ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
              No auto-recommended candidates currently pending review.
            </div>
          ) : (
            <div className="space-y-4">
              {topCandidates.map(puzzle => (
                <div key={puzzle.id} className="bg-white p-5 rounded-xl shadow-sm border border-indigo-200 flex flex-col gap-4 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-lg text-slate-800">{puzzle.title}</h4>
                      <div className="text-sm text-slate-500 flex items-center gap-2">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-xs">{humanizeTheme(puzzle.theme)}</span>
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Auto-Recommended
                        </span>
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

                  {puzzle.evaluation && (
                    <div className="p-3 rounded-lg border bg-emerald-50 border-emerald-100 text-emerald-900 text-sm">
                      <p className="mb-2 font-medium">{puzzle.evaluation.shortReason}</p>
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
