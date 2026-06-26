import { menuBtnStyle } from '../constants/themes';

// Determine emoji and accent color from result
function getResultDisplay(result) {
  const t = result?.title || '';
  if (t.includes('CHIẾU BÍ') || t.includes('ĐẦU HÀNG') || t.includes('HẾT GIỜ')) {
    // Someone wins — pick accent by winner side
    if (result.winner === 'red') {
      return { emoji: '🏆', accentColor: '#c0392b', label: 'Đỏ thắng!' };
    } else if (result.winner === 'black') {
      return { emoji: '🏆', accentColor: '#2c3e50', label: 'Đen thắng!' };
    }
    return { emoji: '🏆', accentColor: '#c0392b', label: '' };
  }
  if (t.includes('HÒA') || t.includes('BÍ NƯỚC')) {
    return { emoji: '🤝', accentColor: '#7f8c8d', label: 'Hòa!' };
  }
  return { emoji: '🎯', accentColor: '#2980b9', label: '' };
}

export default function ResultOverlay({ result, theme, onNewGame, onExit, eloChange }) {
  const { emoji, accentColor } = getResultDisplay(result);

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.55)',
      overflowY: 'auto',
      padding: '20px',
      boxSizing: 'border-box',
      animation: 'fadeInOverlay 0.25s ease',
    }}>
      <style>{`
        @keyframes fadeInOverlay {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUpCard {
          from { opacity: 0; transform: translateY(28px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bounceBig {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); }
        }
      `}</style>

      <div style={{
        backgroundColor: theme.panelBg,
        borderRadius: '20px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        border: `1px solid ${theme.lines}`,
        width: '100%',
        maxWidth: '340px',
        textAlign: 'center',
        margin: 'auto',
        flexShrink: 0,
        overflow: 'hidden',
        animation: 'slideUpCard 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        {/* Accent bar */}
        <div style={{
          width: '100%',
          height: '6px',
          backgroundColor: accentColor,
        }} />

        <div style={{ padding: '24px 24px 28px' }}>
          {/* Big emoji */}
          <div style={{
            fontSize: '4rem',
            lineHeight: 1,
            marginBottom: '12px',
            display: 'block',
            animation: 'bounceBig 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both',
          }}>
            {emoji}
          </div>

          {/* Title */}
          <h2 style={{
            fontSize: '1.6rem',
            color: accentColor,
            margin: '0 0 8px 0',
            fontWeight: '800',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}>
            {result.title}
          </h2>

          {/* Sub */}
          <p style={{
            fontSize: '0.95rem',
            opacity: 0.8,
            margin: '0 0 16px 0',
            color: theme.textColor,
            lineHeight: 1.5,
          }}>
            {result.sub}
          </p>

          {/* ELO change badge (shown only if eloChange prop provided) */}
          {eloChange != null && (
            <div style={{
              display: 'inline-block',
              padding: '4px 14px',
              borderRadius: '20px',
              backgroundColor: eloChange >= 0 ? 'rgba(39,174,96,0.15)' : 'rgba(231,76,60,0.15)',
              border: `1px solid ${eloChange >= 0 ? '#27ae60' : '#e74c3c'}`,
              color: eloChange >= 0 ? '#27ae60' : '#e74c3c',
              fontWeight: 'bold',
              fontSize: '0.9rem',
              marginBottom: '16px',
            }}>
              ELO {eloChange >= 0 ? `+${eloChange}` : eloChange}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: eloChange != null ? '0' : '4px' }}>
            <button
              onClick={onNewGame}
              style={{
                ...menuBtnStyle(theme),
                flex: 1,
                backgroundColor: accentColor,
                color: '#fff',
                fontSize: '0.95rem',
                padding: '13px 0',
                fontWeight: '700',
                borderRadius: '10px',
              }}
            >
              🔄 Ván mới
            </button>
            <button
              onClick={onExit}
              style={{
                ...menuBtnStyle(theme),
                flex: 1,
                backgroundColor: 'transparent',
                color: theme.textColor,
                fontSize: '0.95rem',
                padding: '13px 0',
                fontWeight: '700',
                borderRadius: '10px',
                border: `1px solid ${theme.lines}`,
              }}
            >
              🏠 Menu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
