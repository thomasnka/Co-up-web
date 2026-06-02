// src/App.jsx — chỉ routing, ~40 dòng

import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { THEMES } from './constants/themes';
import MainMenu from './pages/MainMenu';
import GameBoard from './pages/GameBoard';
import './App.css';

export default function App() {
  const [screen, setScreen]           = useState('menu');
  const [gameMode, setGameMode]       = useState('standard');
  const [isNightMode, setIsNightMode] = useState(false);
  const [matchId, setMatchId]         = useState(null);

  const auth  = useAuth();
  const theme = isNightMode ? THEMES.night : THEMES.day;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.background, transition: 'all 0.3s ease', fontFamily: 'sans-serif' }}>
      {screen === 'menu' ? (
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