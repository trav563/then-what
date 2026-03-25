import React, { useState, useEffect, useMemo } from 'react';
import { fetchAllPuzzlesMapped, upsertPuzzleMapped, fetchSchedule, upsertScheduleEntry, deleteScheduleEntry, supabase } from '../services/supabase';
import { checkAndRunAutomation } from '../services/automation';
import { PuzzleRecord, PuzzleStatus } from '../types';
import { X, Calendar, BarChart3, Database, Check, Edit2, Trash2, Play, Plus, Settings, AlertTriangle, AlertCircle, Loader2 } from 'lucide-react';
import { BatchesView } from './BatchesView';
import { AutomationView } from './AutomationView';
import { humanizeTheme } from '../utils';

interface AdminDashboardProps {
  onClose: () => void;
  onPreviewPuzzle: (id: string) => void;
}

export function AdminDashboard({ onClose, onPreviewPuzzle }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'puzzles' | 'schedule' | 'batches' | 'automation' | 'analytics'>('puzzles');
  
  useEffect(() => {
    // Check automation triggers when admin dashboard loads
    checkAndRunAutomation().catch(console.error);
  }, []);

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-0 md:p-8">
      <div className="bg-white md:rounded-2xl shadow-2xl w-full h-full md:h-auto md:max-w-6xl md:max-h-full flex flex-col overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex items-center justify-between px-3 pt-3 pb-2 md:px-4 md:pt-4">
            <h2 className="font-bold text-base md:text-lg text-slate-800">Admin</h2>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 px-2 pb-2 md:flex md:gap-1.5 md:px-4 md:pb-3">
            <TabButton active={activeTab === 'puzzles'} onClick={() => setActiveTab('puzzles')} icon={<Database className="w-4 h-4" />} label="Puzzles" />
            <TabButton active={activeTab === 'batches'} onClick={() => setActiveTab('batches')} icon={<Plus className="w-4 h-4" />} label="Batches" />
            <TabButton active={activeTab === 'automation'} onClick={() => setActiveTab('automation')} icon={<Settings className="w-4 h-4" />} label="Auto" />
            <TabButton active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} icon={<Calendar className="w-4 h-4" />} label="Schedule" />
            <TabButton active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} icon={<BarChart3 className="w-4 h-4" />} label="Stats" />
          </div>
        </div>
        
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/50">
          {activeTab === 'puzzles' && <PuzzlesView onPreviewPuzzle={onPreviewPuzzle} />}
          {activeTab === 'batches' && <BatchesView onPreviewPuzzle={onPreviewPuzzle} />}
          {activeTab === 'automation' && <AutomationView onPreviewPuzzle={onPreviewPuzzle} />}
          {activeTab === 'schedule' && <ScheduleView />}
          {activeTab === 'analytics' && <AnalyticsView />}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 px-2 py-2 md:px-3 md:py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
        active ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-200'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function PuzzlesView({ onPreviewPuzzle }: { onPreviewPuzzle: (id: string) => void }) {
  const [puzzles, setPuzzles] = useState<PuzzleRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<PuzzleStatus | 'all'>('all');
  const [scheduleDate, setScheduleDate] = useState('');
  const [schedulingPuzzleId, setSchedulingPuzzleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPuzzles = async () => {
    const data = await fetchAllPuzzlesMapped();
    setPuzzles(data as PuzzleRecord[]);
    setLoading(false);
  };

  useEffect(() => {
    loadPuzzles();
  }, []);

  const handleStatusChange = async (id: string, newStatus: PuzzleStatus) => {
    const puzzle = puzzles.find(p => p.id === id);
    if (!puzzle) return;
    
    const updated = { ...puzzle, status: newStatus };
    if (newStatus === 'approved') updated.approvedAt = Date.now();
    if (newStatus === 'retired') updated.retiredAt = Date.now();
    if (newStatus === 'rejected') updated.rejectedAt = Date.now();
    
    await upsertPuzzleMapped(updated);
    await loadPuzzles();
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
      const oldPuzzle = puzzles.find(p => p.id === oldPuzzleId);
      if (oldPuzzle && oldPuzzle.status === 'scheduled') {
        await upsertPuzzleMapped({ ...oldPuzzle, status: 'approved', scheduledFor: undefined });
      }
    }
    
    await upsertScheduleEntry(scheduleDate, id);
    await upsertPuzzleMapped({ ...puzzle, status: 'scheduled', scheduledFor: scheduleDate });
    
    await loadPuzzles();
    setSchedulingPuzzleId(null);
    setScheduleDate('');
  };

  const filteredPuzzles = puzzles.filter(p => statusFilter === 'all' || p.status === statusFilter);

  const inventoryStats = {
    approved: puzzles.filter(p => p.status === 'approved').length,
    scheduled: puzzles.filter(p => p.status === 'scheduled').length,
    aiReviewed: puzzles.filter(p => p.status === 'ai_reviewed').length,
    published: puzzles.filter(p => p.status === 'published').length,
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-slate-200 bg-white shrink-0 space-y-4">
        {/* Inventory Health Summary */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-500" />
            <h3 className="font-bold text-slate-700">Inventory Health</h3>
          </div>
          <div className="flex flex-wrap gap-4 md:gap-8 text-sm">
            <div className="flex flex-col">
              <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">Approved (Unscheduled)</span>
              <span className={`font-bold text-lg ${inventoryStats.approved < 5 ? 'text-red-600' : 'text-emerald-600'}`}>
                {inventoryStats.approved}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">Scheduled</span>
              <span className="font-bold text-lg text-indigo-600">{inventoryStats.scheduled}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">AI Reviewed (Candidates)</span>
              <span className="font-bold text-lg text-amber-600">{inventoryStats.aiReviewed}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">Published</span>
              <span className="font-bold text-lg text-slate-700">{inventoryStats.published}</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          <StatusFilter active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label="All" count={puzzles.length} />
          <StatusFilter active={statusFilter === 'draft'} onClick={() => setStatusFilter('draft')} label="Draft" count={puzzles.filter(p => p.status === 'draft').length} />
          <StatusFilter active={statusFilter === 'ai_reviewed'} onClick={() => setStatusFilter('ai_reviewed')} label="AI Reviewed" count={inventoryStats.aiReviewed} />
          <StatusFilter active={statusFilter === 'approved'} onClick={() => setStatusFilter('approved')} label="Approved" count={inventoryStats.approved} />
          <StatusFilter active={statusFilter === 'scheduled'} onClick={() => setStatusFilter('scheduled')} label="Scheduled" count={inventoryStats.scheduled} />
          <StatusFilter active={statusFilter === 'published'} onClick={() => setStatusFilter('published')} label="Published" count={inventoryStats.published} />
          <StatusFilter active={statusFilter === 'retired'} onClick={() => setStatusFilter('retired')} label="Retired" count={puzzles.filter(p => p.status === 'retired').length} />
          <StatusFilter active={statusFilter === 'rejected'} onClick={() => setStatusFilter('rejected')} label="Rejected" count={puzzles.filter(p => p.status === 'rejected').length} />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-4">
          {filteredPuzzles.map(puzzle => (
            <div key={puzzle.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${getStatusColor(puzzle.status)}`}>
                      {puzzle.status}
                    </span>
                    {puzzle.scheduledFor && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {puzzle.scheduledFor}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-slate-800">{puzzle.title}</h3>
                  <p className="text-sm text-slate-500">{humanizeTheme(puzzle.theme)}</p>
                </div>
                
                {puzzle.evaluation && (
                  <div className="flex-1 text-sm bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-slate-700">AI:</span>
                      <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded ${
                        puzzle.evaluation.recommendedDecision === 'approve' ? 'bg-emerald-100 text-emerald-700' :
                        puzzle.evaluation.recommendedDecision === 'revise' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>{puzzle.evaluation.recommendedDecision}</span>
                      <span className="text-xs text-slate-500">({puzzle.evaluation.likelyDifficulty})</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span>Clarity: {puzzle.evaluation.clarity}/10</span>
                      <span>Ending: {puzzle.evaluation.endingStrength}/10</span>
                      <span>Ambiguity: {puzzle.evaluation.ambiguityRisk}/10</span>
                    </div>
                    {puzzle.evaluation.shortReason && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{puzzle.evaluation.shortReason}</p>
                    )}
                  </div>
                )}
                
                <div className="flex flex-col gap-2 shrink-0">
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button onClick={() => onPreviewPuzzle(puzzle.id)} className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors" title="Preview">
                      <Play className="w-4 h-4" />
                    </button>
                    {puzzle.status === 'ai_reviewed' && (
                      <>
                        <button onClick={() => handleStatusChange(puzzle.id, 'approved')} className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors" title="Approve">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleStatusChange(puzzle.id, 'rejected')} className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors" title="Reject">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {puzzle.status === 'approved' && (
                      <>
                        <button onClick={() => setSchedulingPuzzleId(schedulingPuzzleId === puzzle.id ? null : puzzle.id)} className="p-2 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors" title="Schedule">
                          <Calendar className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleStatusChange(puzzle.id, 'retired')} className="p-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors" title="Retire">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                  {schedulingPuzzleId === puzzle.id && (
                    <div className="flex gap-2 items-center mt-2">
                      <input 
                        type="date" 
                        min={new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]}
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="text-sm border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button 
                        onClick={() => handleSchedule(puzzle.id)}
                        disabled={!scheduleDate}
                        className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Card Preview */}
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 text-xs text-slate-600">
                  {puzzle.cards.map((card, idx) => (
                    <div key={card.id} className="flex gap-1.5">
                      <span className="text-slate-400 font-mono w-3 shrink-0">{idx + 1}.</span>
                      <span className="truncate">{card.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {filteredPuzzles.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              No puzzles found with status: {statusFilter}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScheduleView() {
  const [schedule, setSchedule] = useState<Record<string, string>>({});
  const [puzzles, setPuzzles] = useState<PuzzleRecord[]>([]);
  const [filter, setFilter] = useState<'all' | 'approved-safe' | 'legacy'>('all');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    const [s, p] = await Promise.all([fetchSchedule(), fetchAllPuzzlesMapped()]);
    
    // Auto-archive: mark past scheduled puzzles as 'published'
    const now = new Date();
    const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const pastDates = Object.keys(s).filter(d => d < todayStr);
    let needsRefresh = false;
    
    for (const date of pastDates) {
      const puzzleId = s[date];
      const puzzle = (p as PuzzleRecord[]).find(px => px.id === puzzleId);
      if (puzzle && (puzzle.status === 'scheduled' || puzzle.status === 'approved')) {
        await upsertPuzzleMapped({ ...puzzle, status: 'published', publishedAt: Date.now() });
        needsRefresh = true;
      }
    }
    
    // Auto-assign puzzle numbers based on chronological schedule position
    // #1 = first scheduled date, #2 = second, etc. (like Wordle day count)
    const sortedDatesAll = Object.keys(s).sort();
    for (let i = 0; i < sortedDatesAll.length; i++) {
      const date = sortedDatesAll[i];
      const puzzleId = s[date];
      const expectedNumber = i + 1;
      const puzzle = (p as PuzzleRecord[]).find(px => px.id === puzzleId);
      if (puzzle && puzzle.number !== expectedNumber) {
        await upsertPuzzleMapped({ ...puzzle, number: expectedNumber });
        needsRefresh = true;
      }
    }
    
    if (needsRefresh) {
      const refreshed = await fetchAllPuzzlesMapped();
      setPuzzles(refreshed as PuzzleRecord[]);
    } else {
      setPuzzles(p as PuzzleRecord[]);
    }
    setSchedule(s);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUnschedule = async (date: string) => {
    const todayStr = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    
    const puzzleId = schedule[date];
    await deleteScheduleEntry(date);
    
    const newSchedule = { ...schedule };
    delete newSchedule[date];
    setSchedule(newSchedule);
    
    const puzzle = puzzles.find(p => p.id === puzzleId);
    if (puzzle && puzzle.status === 'scheduled' && date >= todayStr) {
      await upsertPuzzleMapped({ ...puzzle, status: 'approved', scheduledFor: undefined });
      const updatedPuzzles = await fetchAllPuzzlesMapped();
      setPuzzles(updatedPuzzles as PuzzleRecord[]);
    }
  };

  const today = new Date();
  const todayStr = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

  const classifyScheduleRow = (date: string, puzzleId: string): 'approved-safe' | 'legacy' => {
    const puzzle = puzzles.find(p => p.id === puzzleId);
    if (!puzzle) return 'legacy';
    // A row is approved-safe if the puzzle is approved, scheduled, or published.
    // This allows 'approved' puzzles to be safely in the schedule without being flagged as legacy.
    if (['approved', 'scheduled', 'published'].includes(puzzle.status)) return 'approved-safe';
    return 'legacy';
  };

  const sortedDates = Object.keys(schedule).sort();
  const classifiedRows = sortedDates.map(date => ({
    date,
    puzzleId: schedule[date],
    classification: classifyScheduleRow(date, schedule[date])
  }));

  const totalRows = classifiedRows.length;
  const approvedSafeCount = classifiedRows.filter(r => r.classification === 'approved-safe').length;
  const legacyCount = classifiedRows.filter(r => r.classification === 'legacy').length;

  const futureSafeDates = classifiedRows.filter(r => r.date >= todayStr && r.classification === 'approved-safe').map(r => r.date).sort();
  
  // "Next scheduled date" is the earliest upcoming date that has a puzzle
  const nextScheduledDate = futureSafeDates.length > 0 ? futureSafeDates[0] : 'None';

  // "Days scheduled ahead" is the continuous block of safe scheduled days starting from today
  let daysScheduledAhead = 0;
  let currDate = new Date(today.getTime() - (today.getTimezoneOffset() * 60000));
  let currDateStr = currDate.toISOString().split('T')[0];
  
  while (schedule[currDateStr] && classifyScheduleRow(currDateStr, schedule[currDateStr]) === 'approved-safe') {
    daysScheduledAhead++;
    currDate.setDate(currDate.getDate() + 1);
    currDateStr = currDate.toISOString().split('T')[0];
  }

  const filteredRows = classifiedRows.filter(r => filter === 'all' || r.classification === filter);

  const handleClearFutureLegacy = async () => {
    if (!confirm('Are you sure you want to clear all non-approved future scheduled entries?')) return;
    
    const newSchedule = { ...schedule };
    let clearedCount = 0;
    
    for (const date of Object.keys(newSchedule)) {
      if (date >= todayStr) {
        const classification = classifyScheduleRow(date, newSchedule[date]);
        if (classification === 'legacy') {
          await deleteScheduleEntry(date);
          delete newSchedule[date];
          clearedCount++;
        }
      }
    }
    
    if (clearedCount > 0) {
      setSchedule(newSchedule);
      const updatedPuzzles = await fetchAllPuzzlesMapped();
      setPuzzles(updatedPuzzles as PuzzleRecord[]);
      alert(`Cleared ${clearedCount} future legacy entries.`);
    } else {
      alert('No future legacy entries found.');
    }
  };

  const handleClearAllLegacy = async () => {
    if (!confirm('WARNING: This will clear ALL legacy/test schedule rows, including past ones. Are you sure?')) return;
    
    const newSchedule = { ...schedule };
    let clearedCount = 0;
    
    for (const date of Object.keys(newSchedule)) {
      const classification = classifyScheduleRow(date, newSchedule[date]);
      if (classification === 'legacy') {
        await deleteScheduleEntry(date);
        delete newSchedule[date];
        clearedCount++;
      }
    }
    
    if (clearedCount > 0) {
      setSchedule(newSchedule);
      const updatedPuzzles = await fetchAllPuzzlesMapped();
      setPuzzles(updatedPuzzles as PuzzleRecord[]);
      alert(`Cleared ${clearedCount} legacy entries.`);
    } else {
      alert('No legacy entries found.');
    }
  };

  const handleAutoFill = async (daysToFill: number) => {
    // Only use approved puzzles that have NEVER been scheduled or published
    const scheduledIds = new Set(Object.values(schedule));
    const approvedPuzzles = puzzles.filter(p => 
      p.status === 'approved' && 
      !p.scheduledFor && 
      !p.publishedAt && 
      !scheduledIds.has(p.id)
    );
    if (approvedPuzzles.length === 0) {
      alert('No approved puzzles available to schedule. Generate and approve more puzzles first.');
      return;
    }
    
    const newSchedule = { ...schedule };
    let filledCount = 0;
    let currentDate = new Date(today.getTime() - (today.getTimezoneOffset() * 60000));
    const usedPuzzleIds = new Set(Object.values(newSchedule));
    
    while (filledCount < daysToFill && approvedPuzzles.length > 0) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      if (!newSchedule[dateStr]) {
        const puzzleToSchedule = approvedPuzzles.shift()!;
        
        // Double-check this puzzle isn't already used on another date
        if (!usedPuzzleIds.has(puzzleToSchedule.id)) {
          newSchedule[dateStr] = puzzleToSchedule.id;
          usedPuzzleIds.add(puzzleToSchedule.id);
          
          await upsertScheduleEntry(dateStr, puzzleToSchedule.id);
          await upsertPuzzleMapped({ ...puzzleToSchedule, status: 'scheduled' as const, scheduledFor: dateStr });
          
          filledCount++;
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    if (filledCount > 0) {
      setSchedule(newSchedule);
      const updatedPuzzles = await fetchAllPuzzlesMapped();
      setPuzzles(updatedPuzzles as PuzzleRecord[]);
      alert(`Successfully scheduled ${filledCount} puzzles.`);
    } else {
      alert('Could not schedule any puzzles. The upcoming dates might already be full.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Rows</div>
          <div className="text-2xl font-bold text-slate-800">{totalRows}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm">
          <div className="text-xs text-emerald-600 uppercase tracking-wider mb-1">Approved-Safe</div>
          <div className="text-2xl font-bold text-emerald-700">{approvedSafeCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm">
          <div className="text-xs text-amber-600 uppercase tracking-wider mb-1">Legacy/Test</div>
          <div className="text-2xl font-bold text-amber-700">{legacyCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Days Ahead</div>
          <div className="text-2xl font-bold text-indigo-600">{daysScheduledAhead}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Next Scheduled Date</div>
          <div className="text-lg font-bold text-slate-800 truncate">{nextScheduledDate}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800">Schedule Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => handleAutoFill(14)} className="px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors">
            Fill Next 14 Days
          </button>
          <button onClick={() => handleAutoFill(30)} className="px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors">
            Fill Next 30 Days
          </button>
          <div className="w-px bg-slate-200 mx-2"></div>
          <button onClick={handleClearFutureLegacy} className="px-3 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-sm font-medium transition-colors">
            Clear Future Legacy Rows
          </button>
          <button onClick={handleClearAllLegacy} className="px-3 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors">
            Clear ALL Legacy Rows
          </button>
        </div>
      </div>

      {/* Legacy Warning */}
      {legacyCount > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold mb-1">Legacy/Test Rows Detected</p>
            <p>This schedule contains rows that are not fully approved (e.g. drafts, AI reviewed, or missing puzzles). These are preserved for historical honesty, but you can use the cleanup tools above to remove them if they are in the future.</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex gap-2">
          <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>All</button>
          <button onClick={() => setFilter('approved-safe')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === 'approved-safe' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'}`}>Approved-Safe</button>
          <button onClick={() => setFilter('legacy')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === 'legacy' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'}`}>Legacy/Test</button>
        </div>
        
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 font-medium">
            <tr>
              <th className="p-4 border-b border-slate-200">Date</th>
              <th className="p-4 border-b border-slate-200">Puzzle ID</th>
              <th className="p-4 border-b border-slate-200">Title</th>
              <th className="p-4 border-b border-slate-200">Status</th>
              <th className="p-4 border-b border-slate-200 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.map(row => {
              const puzzle = puzzles.find(p => p.id === row.puzzleId);
              const isLegacy = row.classification === 'legacy';
              return (
                <tr key={row.date} className={`hover:bg-slate-50 ${isLegacy ? 'bg-amber-50/30' : ''}`}>
                  <td className="p-4 font-mono text-slate-700 flex items-center gap-2">
                    {row.date}
                    {isLegacy && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Legacy</span>}
                  </td>
                  <td className="p-4 font-mono text-slate-500">{row.puzzleId}</td>
                  <td className="p-4 font-medium text-slate-800">{puzzle?.title || 'Unknown'}</td>
                  <td className="p-4">
                    {puzzle ? (
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${getStatusColor(puzzle.status)}`}>
                        {puzzle.status}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Missing</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <button onClick={() => handleUnschedule(row.date)} className="text-red-500 hover:text-red-700 text-xs font-bold uppercase tracking-wider">
                      Unschedule
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">No puzzles found for this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalyticsView() {
  const [events, setEvents] = useState<any[]>([]);
  const [puzzles, setPuzzles] = useState<PuzzleRecord[]>([]);
  const [timeFilter, setTimeFilter] = useState<'all' | '7d' | '30d'>('30d');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('analytics_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10000);
      if (!error && data) setEvents(data);
      const p = await fetchAllPuzzlesMapped();
      setPuzzles(p as PuzzleRecord[]);
      setLoading(false);
    };
    load();
  }, []);

  const filteredEvents = useMemo(() => {
    if (timeFilter === 'all') return events;
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    const cutoff = now - (timeFilter === '7d' ? 7 * msPerDay : 30 * msPerDay);
    return events.filter(e => new Date(e.created_at).getTime() >= cutoff);
  }, [events, timeFilter]);

  // Core counts
  const loads = filteredEvents.filter(e => e.event_type === 'puzzle_loaded').length;
  const starts = filteredEvents.filter(e => e.event_type === 'puzzle_started').length;
  const solves = filteredEvents.filter(e => e.event_type === 'puzzle_solved').length;
  const fails = filteredEvents.filter(e => e.event_type === 'puzzle_failed').length;
  const completedRuns = solves + fails;
  const solveRate = completedRuns > 0 ? (solves / completedRuns) * 100 : 0;
  const failRate = completedRuns > 0 ? (fails / completedRuns) * 100 : 0;
  const dropOffRate = loads > 0 ? Math.max(0, ((loads - starts) / loads) * 100) : 0;

  // Unique users (unique session_ids)
  const uniqueSessions = new Set(filteredEvents.map(e => e.session_id)).size;
  // Returning users = users who played on more than one day
  const sessionDays = useMemo(() => {
    const map = new Map<string, Set<string>>();
    filteredEvents.forEach(e => {
      if (!map.has(e.session_id)) map.set(e.session_id, new Set());
      map.get(e.session_id)!.add(e.event_date);
    });
    return map;
  }, [filteredEvents]);
  const returningUsers = Array.from(sessionDays.values()).filter((days: Set<string>) => days.size > 1).length;

  // Avg attempts on solved puzzles
  const solveEvents = filteredEvents.filter(e => e.event_type === 'puzzle_solved');
  const totalAttemptsOnSolves = solveEvents.reduce((sum, e) => sum + (e.data?.attempts || 0), 0);
  const avgAttempts = solves > 0 ? totalAttemptsOnSolves / solves : 0;

  // Attempt distribution
  const goldSolves = filteredEvents.filter(e => e.event_type === 'gold_solve').length;
  const goldSolveRate = solves > 0 ? (goldSolves / solves) * 100 : 0;
  const attemptDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, failed: fails };
  solveEvents.forEach(e => {
    const att = e.data?.attempts;
    if (att >= 1 && att <= 5) attemptDist[att as 1|2|3|4|5]++;
  });

  // Daily activity
  const dailyStats = useMemo(() => {
    const stats: Record<string, { date: string; sessions: Set<string>; starts: number; solves: number; fails: number }> = {};
    filteredEvents.forEach(e => {
      const d = e.event_date;
      if (!stats[d]) stats[d] = { date: d, sessions: new Set(), starts: 0, solves: 0, fails: 0 };
      stats[d].sessions.add(e.session_id);
      if (e.event_type === 'puzzle_started') stats[d].starts++;
      if (e.event_type === 'puzzle_solved') stats[d].solves++;
      if (e.event_type === 'puzzle_failed') stats[d].fails++;
    });
    return Object.values(stats)
      .map(s => ({ ...s, users: s.sessions.size }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredEvents]);

  // Puzzle performance
  const puzzleStats = useMemo(() => {
    const stats: Record<string, any> = {};
    filteredEvents.forEach(e => {
      if (!stats[e.puzzle_id]) {
        stats[e.puzzle_id] = { id: e.puzzle_id, loads: 0, starts: 0, solves: 0, fails: 0, totalAttempts: 0, sessions: new Set(), lastPlayed: '' };
      }
      const s = stats[e.puzzle_id];
      s.sessions.add(e.session_id);
      if (e.event_type === 'puzzle_loaded') s.loads++;
      if (e.event_type === 'puzzle_started') s.starts++;
      if (e.event_type === 'puzzle_solved') { s.solves++; s.totalAttempts += (e.data?.attempts || 0); }
      if (e.event_type === 'puzzle_failed') s.fails++;
      if (e.event_date > s.lastPlayed) s.lastPlayed = e.event_date;
    });
    return Object.values(stats).map(s => {
      const p = puzzles.find(p => p.id === s.id);
      const completed = s.solves + s.fails;
      return {
        ...s,
        title: p?.title || s.id,
        status: p?.status || 'unknown',
        users: s.sessions.size,
        solveRate: completed > 0 ? (s.solves / completed) * 100 : 0,
        avgAttempts: s.solves > 0 ? s.totalAttempts / s.solves : 0
      };
    }).sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed));
  }, [filteredEvents, puzzles]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50">
      {/* Filters */}
      <div className="flex gap-2">
        <button onClick={() => setTimeFilter('30d')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${timeFilter === '30d' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>Last 30 Days</button>
        <button onClick={() => setTimeFilter('7d')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${timeFilter === '7d' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>Last 7 Days</button>
        <button onClick={() => setTimeFilter('all')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${timeFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>All Time</button>
      </div>

      {/* Top-Level KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="Unique Users" value={uniqueSessions} subtitle="Unique sessions" color="text-indigo-600" />
        <KPICard label="Returning Users" value={returningUsers} subtitle="Played on 2+ days" color="text-purple-600" />
        <KPICard label="Total Plays" value={completedRuns} subtitle="Solved + Failed" color="text-slate-800" />
        <KPICard label="Solve Rate" value={`${solveRate.toFixed(1)}%`} subtitle="Of completed runs" color="text-emerald-600" />
        <KPICard label="Avg Attempts" value={avgAttempts.toFixed(1)} subtitle="On solved puzzles" color="text-indigo-600" />
        <KPICard label="Drop-off Rate" value={`${dropOffRate.toFixed(1)}%`} subtitle="Loaded but never started" color="text-amber-600" />
        <KPICard label="Gold Solves" value={goldSolves} subtitle="First-try perfects" color="text-amber-500" />
        <KPICard label="Gold Rate" value={`${goldSolveRate.toFixed(1)}%`} subtitle="Of all solves" color="text-amber-600" />
        <KPICard label="Wins / Losses" value={`${solves} / ${fails}`} subtitle="Absolute counts" color="text-slate-800" />
        <KPICard label="Fail Rate" value={`${failRate.toFixed(1)}%`} subtitle="Of completed runs" color="text-red-600" />
      </div>

      {/* Engagement Funnel */}
      <div>
        <h2 className="text-base font-bold text-slate-800 mb-3">Engagement Funnel</h2>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <FunnelBar label="Loaded" value={loads} max={loads} color="bg-slate-400" />
          <FunnelBar label="Started" value={starts} max={loads} color="bg-indigo-500" />
          <FunnelBar label="Solved" value={solves} max={loads} color="bg-emerald-500" />
          <FunnelBar label="Failed" value={fails} max={loads} color="bg-red-500" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attempt Distribution */}
        <div className="lg:col-span-1">
          <h2 className="text-base font-bold text-slate-800 mb-3">Attempt Distribution</h2>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            {[1, 2, 3, 4, 5].map(n => (
              <div key={n}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-bold text-emerald-700">Attempt {n}</span>
                  <span className="font-bold text-slate-700">{attemptDist[n as 1|2|3|4|5]}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${completedRuns > 0 ? (attemptDist[n as 1|2|3|4|5] / completedRuns) * 100 : 0}%`, opacity: 1 - (n - 1) * 0.15 }} />
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-bold text-red-600">Failed</span>
                <span className="font-bold text-slate-700">{attemptDist.failed}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-red-500 h-2 rounded-full" style={{ width: `${completedRuns > 0 ? (attemptDist.failed / completedRuns) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Daily Activity */}
        <div className="lg:col-span-2">
          <h2 className="text-base font-bold text-slate-800 mb-3">Daily Activity</h2>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium">
                <tr>
                  <th className="p-3 border-b border-slate-200">Date</th>
                  <th className="p-3 border-b border-slate-200 text-right">Users</th>
                  <th className="p-3 border-b border-slate-200 text-right">Starts</th>
                  <th className="p-3 border-b border-slate-200 text-right">Solves</th>
                  <th className="p-3 border-b border-slate-200 text-right">Fails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyStats.slice(0, 14).map(stat => (
                  <tr key={stat.date} className="hover:bg-slate-50">
                    <td className="p-3 font-medium text-slate-800">{stat.date}</td>
                    <td className="p-3 text-right text-indigo-600 font-medium">{stat.users}</td>
                    <td className="p-3 text-right text-slate-600">{stat.starts}</td>
                    <td className="p-3 text-right text-emerald-600 font-medium">{stat.solves}</td>
                    <td className="p-3 text-right text-red-600 font-medium">{stat.fails}</td>
                  </tr>
                ))}
                {dailyStats.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">No activity data yet. Play a puzzle to generate events!</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Puzzle Performance */}
      <div>
        <h2 className="text-base font-bold text-slate-800 mb-3">Puzzle Performance</h2>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="p-3 border-b border-slate-200">Puzzle</th>
                <th className="p-3 border-b border-slate-200 text-right">Users</th>
                <th className="p-3 border-b border-slate-200 text-right">Solves</th>
                <th className="p-3 border-b border-slate-200 text-right">Fails</th>
                <th className="p-3 border-b border-slate-200 text-right">Solve %</th>
                <th className="p-3 border-b border-slate-200 text-right">Avg Att.</th>
                <th className="p-3 border-b border-slate-200 text-right">Last Played</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {puzzleStats.map(stat => (
                <tr key={stat.id} className="hover:bg-slate-50">
                  <td className="p-3">
                    <div className="font-bold text-slate-800 truncate max-w-[200px]">{stat.title}</div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${getStatusColor(stat.status)}`}>{stat.status}</span>
                  </td>
                  <td className="p-3 text-right text-indigo-600 font-medium">{stat.users}</td>
                  <td className="p-3 text-right text-emerald-600 font-medium">{stat.solves}</td>
                  <td className="p-3 text-right text-red-600 font-medium">{stat.fails}</td>
                  <td className="p-3 text-right font-bold text-slate-700">{stat.solveRate.toFixed(0)}%</td>
                  <td className="p-3 text-right text-indigo-600 font-medium">{stat.avgAttempts.toFixed(1)}</td>
                  <td className="p-3 text-right text-slate-500 whitespace-nowrap">{stat.lastPlayed}</td>
                </tr>
              ))}
              {puzzleStats.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">No puzzle performance data yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, subtitle, color }: { label: string; value: string | number; subtitle: string; color: string }) {
  return (
    <div className="bg-white p-3 md:p-4 rounded-xl border border-slate-200 shadow-sm">
      <div className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-xl md:text-2xl font-black ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-400 mt-1">{subtitle}</div>
    </div>
  );
}

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-slate-700 w-16 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-4 relative overflow-hidden">
        <div className={`${color} h-4 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-bold text-slate-700 w-12 text-right">{value}</span>
      <span className="text-xs text-slate-400 w-12 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

function StatusFilter({ active, onClick, label, count }: { active: boolean, onClick: () => void, label: string, count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
        active ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${active ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-500'}`}>
        {count}
      </span>
    </button>
  );
}

function getStatusColor(status: PuzzleStatus) {
  switch (status) {
    case 'draft': return 'bg-slate-100 text-slate-600';
    case 'ai_reviewed': return 'bg-blue-100 text-blue-700';
    case 'approved': return 'bg-emerald-100 text-emerald-700';
    case 'scheduled': return 'bg-purple-100 text-purple-700';
    case 'published': return 'bg-indigo-100 text-indigo-700';
    case 'retired': return 'bg-orange-100 text-orange-700';
    case 'rejected': return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}
