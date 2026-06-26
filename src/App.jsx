// src/App.jsx — chỉ routing, ~40 dòng

import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { THEMES } from './constants/themes';
import MainMenu from './pages/MainMenu';
import MatchHistory from './pages/MatchHistory';
import GameBoard from './pages/GameBoard';
import './App.css';

export default function App() {
  const [screen, setScreen]           = useState('menu');

  // SPA pageview tracking for GA4
  React.useEffect(() => {
    if (typeof window.gtag === 'function') {
      const pageMap = { menu: '/', playing: '/game', history: '/history' };
      window.gtag('event', 'page_view', {
        page_path: pageMap[screen] || '/' + screen,
        page_title: document.title,
      });
    }
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps
  const [gameMode, setGameMode]       = useState('standard');
  const [isNightMode, setIsNightMode] = useState(false);
  const [matchId, setMatchId]         = useState(null);

  const auth  = useAuth();
  const isDemoUrl = new URLSearchParams(window.location.search).get('demo') === '1';
  // Auto-enter demo mode khi URL có ?demo=1
  React.useEffect(() => {
    if (isDemoUrl && screen === 'menu') {
      setScreen('playing');
      setMatchId(null);
      setGameMode('demo');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const theme = isNightMode ? THEMES.night : THEMES.day;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.background, transition: 'all 0.3s ease', fontFamily: 'sans-serif' }}>
      {screen === 'history' ? (
        <MatchHistory
          auth={auth}
          theme={theme}
          isNightMode={isNightMode}
          setScreen={setScreen}
        />
      ) : screen === 'menu' ? (
        <MainMenu
          setScreen={setScreen}
          setGameMode={setGameMode}
          setMatchId={setMatchId}
          theme={theme}
          auth={auth}
          isNightMode={isNightMode}
          setIsNightMode={setIsNightMode}
        />
      ) : (
        <GameBoard
          gameMode={gameMode}
          setScreen={setScreen}
          matchId={matchId}
          theme={theme}
          playerId={auth.playerId}
          playerName={auth.playerName}
          playerElo={auth.playerElo}
          isNightMode={isNightMode}
          setIsNightMode={setIsNightMode}
        />
      )}
    </div>
  );
}