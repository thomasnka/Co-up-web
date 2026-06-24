import { Component } from 'react';

/**
 * ErrorBoundary — bắt mọi React runtime crash, hiển thị thông báo lỗi
 * thay vì màn hình trắng. Copy stack trace để debug.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('[ErrorBoundary] Caught:', error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, info } = this.state;
    const stack = info?.componentStack ?? '';
    const msg   = error?.message ?? String(error);

    return (
      <div style={{
        minHeight: '100vh',
        background: '#1a0f00',
        color: '#f0d080',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        fontFamily: 'monospace',
        gap: '16px',
      }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h2 style={{ margin: 0, color: '#ff6b6b', fontSize: 20 }}>
          Lỗi render — {msg}
        </h2>
        <pre style={{
          background: '#0d0800',
          border: '1px solid #5a3800',
          borderRadius: 8,
          padding: '16px',
          maxWidth: '90vw',
          overflowX: 'auto',
          fontSize: 12,
          color: '#d4a860',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {msg}{'\n\n'}{stack.trim()}
        </pre>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(msg + '\n' + stack);
            }}
            style={{
              padding: '8px 20px', borderRadius: 6, border: '1px solid #a07030',
              background: '#3a2000', color: '#f0d080', cursor: 'pointer', fontSize: 14,
            }}
          >
            📋 Copy lỗi
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px', borderRadius: 6, border: 'none',
              background: '#8b3a00', color: '#fff', cursor: 'pointer', fontSize: 14,
            }}
          >
            🔄 Tải lại
          </button>
        </div>
      </div>
    );
  }
}
