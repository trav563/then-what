import React, { useState, useEffect } from 'react';
import { useGameState } from './hooks/useGameState';
import { Header } from './components/Header';
import { GameBoard } from './components/GameBoard';
import { HelpModal } from './components/Modals/HelpModal';
import { StatsModal } from './components/Modals/StatsModal';
import { ResultModal } from './components/Modals/ResultModal';
import { StoryPanel } from './components/StoryPanel';
import { AdminLogin } from './components/AdminLogin';
import { getSession, onAuthStateChange, signOut } from './services/supabase';

// Only import DevPanel and AdminDashboard in dev mode or when authenticated
const DevPanel = React.lazy(() => import('./components/DevPanel').then(m => ({ default: m.DevPanel })));
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard').then(m => ({ default: m.AdminDashboard })));

export default function App() {
  const [previewPuzzleId, setPreviewPuzzleId] = useState<string | null>(null);
  const { puzzle, gameState, stats, isLoaded, isArchive, submitAttempt, reorderCards } = useGameState(previewPuzzleId);
  
  const [showHelp, setShowHelp] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showStoryMerge, setShowStoryMerge] = useState(false);
  const [canToggleView, setCanToggleView] = useState(false);

  // Admin state
  const [isAdminRoute, setIsAdminRoute] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);

  // Check if we're on the admin route
  useEffect(() => {
    const checkRoute = () => {
      const isAdmin = window.location.hash === '#admin' || window.location.pathname === '/admin';
      setIsAdminRoute(isAdmin);
      if (isAdmin) {
        // Check if already authenticated
        getSession().then(session => {
          if (session) {
            setIsAuthenticated(true);
            setShowAdminDashboard(true);
          } else {
            setShowAdminLogin(true);
          }
        });
      }
    };
    
    checkRoute();
    window.addEventListener('hashchange', checkRoute);
    return () => window.removeEventListener('hashchange', checkRoute);
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    const { data: { subscription } } = onAuthStateChange((session) => {
      setIsAuthenticated(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Show help on first visit
  useEffect(() => {
    if (isLoaded && stats.puzzlesPlayed === 0 && !isAdminRoute) {
      setShowHelp(true);
    }
  }, [isLoaded, stats.puzzlesPlayed, isAdminRoute]);

  // Show story merge when game ends
  useEffect(() => {
    if (gameState && gameState.status !== 'playing') {
        // Anticipation before the story merge (1.5s)
        // We do this for both WON and FAILED states so the player always gets the payoff.
        const storyTimer = setTimeout(() => {
          setShowStoryMerge(true);
          setCanToggleView(true);
        }, 1500);
        return () => clearTimeout(storyTimer);
    }
  }, [gameState?.status]);

  useEffect(() => {
    const handleShowResult = () => setShowResult(true);
    window.addEventListener('show-result', handleShowResult);
    return () => window.removeEventListener('show-result', handleShowResult);
  }, []);

  const handleAdminLoginSuccess = () => {
    setShowAdminLogin(false);
    setIsAuthenticated(true);
    setShowAdminDashboard(true);
  };

  const handleAdminLogout = async () => {
    await signOut();
    setIsAuthenticated(false);
    setShowAdminDashboard(false);
    window.location.hash = '';
  };

  // ─── Admin Route ───
  if (isAdminRoute) {
    return (
      <>
        {showAdminLogin && !isAuthenticated && (
          <AdminLogin 
            onSuccess={handleAdminLoginSuccess}
            onCancel={() => {
              window.location.hash = '';
              setIsAdminRoute(false);
              setShowAdminLogin(false);
            }}
          />
        )}
        {showAdminDashboard && isAuthenticated && (
          <React.Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
              <div className="animate-pulse flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
                <p className="text-slate-500 font-medium">Loading Admin...</p>
              </div>
            </div>
          }>
            <AdminDashboard 
              onClose={() => {
                setShowAdminDashboard(false);
                window.location.hash = '';
                setIsAdminRoute(false);
              }}
              onPreviewPuzzle={(id) => {
                setPreviewPuzzleId(id);
                setShowAdminDashboard(false);
                window.location.hash = '';
                setIsAdminRoute(false);
              }}
            />
          </React.Suspense>
        )}
      </>
    );
  }

  // ─── Public Game ───
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium">Loading puzzle...</p>
        </div>
      </div>
    );
  }

  if (!puzzle || !gameState) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
        <Header 
          onShowHelp={() => setShowHelp(true)} 
          onShowStats={() => setShowStats(true)} 
          streak={stats.currentStreak} 
        />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 text-center max-w-md w-full">
            <h2 className="text-2xl font-black text-slate-900 mb-2">No Puzzle Today</h2>
            <p className="text-slate-500">Check back tomorrow for a new puzzle!</p>
          </div>
        </main>
        <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
        <StatsModal isOpen={showStats} onClose={() => setShowStats(false)} stats={stats} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <Header 
        onShowHelp={() => setShowHelp(true)} 
        onShowStats={() => setShowStats(true)} 
        streak={stats.currentStreak} 
        isPreview={!!previewPuzzleId}
        isArchive={isArchive}
      />
      
      <main className="flex-1 overflow-y-auto pb-12">
        {isArchive && (
          <div className="mx-auto max-w-md px-4 pt-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-center">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Archive Puzzle</p>
              <p className="text-[11px] text-amber-600 mt-0.5">No new puzzle today — enjoy a past favorite!</p>
            </div>
          </div>
        )}

        {/* View Toggle (Only shown after puzzle solved) */}
        {canToggleView && (
          <div className="mx-auto max-w-md px-4 pt-2 -mb-2 relative z-10 w-full flex justify-center">
            <div className="flex bg-slate-200/60 p-1 rounded-[14px] w-full max-w-[200px]">
              <button 
                onClick={() => setShowStoryMerge(false)}
                className={`flex-1 py-1.5 text-[13px] font-bold rounded-xl transition-all ${
                  !showStoryMerge ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Cards
              </button>
              <button 
                onClick={() => setShowStoryMerge(true)}
                className={`flex-1 py-1.5 text-[13px] font-bold rounded-xl transition-all ${
                  showStoryMerge ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Story
              </button>
            </div>
          </div>
        )}

        <GameBoard 
          puzzle={puzzle} 
          gameState={gameState} 
          onReorder={reorderCards} 
          onSubmit={submitAttempt}
          isGold={gameState.status === 'won' && gameState.attempts === 1}
          showStoryMerge={showStoryMerge}
        />

        {/* Story Merge Panel */}
        {showStoryMerge && gameState.status !== 'playing' && (
          <div className="px-4 pb-32 -mt-4">
            <StoryPanel
              cards={puzzle.cards}
              correctOrder={puzzle.correctOrder}
              title={puzzle.title}
              theme={puzzle.theme}
              isGold={gameState.attempts === 1}
              storyText={puzzle.storyText}
              isTrueStory={puzzle.isTrueStory}
              funFact={puzzle.funFact}
              isFailed={gameState.status === 'lost'}
            />
          </div>
        )}
      </main>

      <HelpModal 
        isOpen={showHelp} 
        onClose={() => setShowHelp(false)} 
      />
      
      <StatsModal 
        isOpen={showStats} 
        onClose={() => setShowStats(false)} 
        stats={stats} 
      />
      
      <ResultModal 
        isOpen={showResult} 
        onClose={() => setShowResult(false)} 
        gameState={gameState} 
        stats={stats} 
        puzzle={puzzle}
        onShowStats={() => {
          setShowResult(false);
          setShowStats(true);
        }}
        isPreview={!!previewPuzzleId}
      />

      {/* DevPanel only in development mode */}
      {import.meta.env.DEV && (
        <React.Suspense fallback={null}>
          <DevPanel previewPuzzleId={previewPuzzleId} setPreviewPuzzleId={setPreviewPuzzleId} />
        </React.Suspense>
      )}
    </div>
  );
}
