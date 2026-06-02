// src/constants/themes.js

export const THEMES = {
  day: {
    background:   '#f5f5f7',
    board:        '#e3c697',
    lines:        '#333333',
    buttonBg:     '#333',
    buttonText:   '#fff',
    pieceBg:      '#ffffff',
    pieceBorder:  '#c29d62',
    redText:      '#d32f2f',
    blackText:    '#1a1a1a',
    hiddenPiece:  '#e0c8a0',
    panelBg:      '#ffffff',
    textColor:    '#333',
    selectedGlow: 'rgba(52, 152, 219, 0.6)',
  },
  night: {
    background:   '#121212',
    board:        '#2c2c2c',
    lines:        '#666666',
    buttonBg:     '#e3c697',
    buttonText:   '#121212',
    pieceBg:      '#1e1e1e',
    pieceBorder:  '#555555',
    redText:      '#e57373',
    blackText:    '#90caf9',
    hiddenPiece:  '#3a3a3a',
    panelBg:      '#1e1e1e',
    textColor:    '#f5f5f7',
    selectedGlow: 'rgba(241, 196, 15, 0.6)',
  },
};

export const menuBtnStyle = (theme) => ({
  padding:         '15px 30px',
  backgroundColor: theme.panelBg,
  color:           theme.textColor,
  border:          'none',
  borderRadius:    '8px',
  cursor:          'pointer',
  fontWeight:      'bold',
  fontSize:        '1.1rem',
  boxShadow:       '0 4px 15px rgba(0,0,0,0.1)',
  transition:      'transform 0.1s',
});