import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Last-resort crash guard: a render error shows a recovery screen instead of
// an empty white page (critical for a product people pay for).
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // Keep a trace in the console for support/debugging.
    console.error('Inui crashed:', error, info?.componentStack || '');
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
          <div style={{ maxWidth: 420, textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🛠️</div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>Something went wrong</h1>
            <p style={{ fontSize: 13, color: '#71717a', margin: '0 0 16px', lineHeight: 1.6 }}>
              Your conversations and files are saved. Reload to continue where you left off.
            </p>
            <pre style={{ fontSize: 11, color: '#a1a1aa', background: '#f4f4f5', border: '1px solid #e4e4e7', borderRadius: 10, padding: 10, maxHeight: 120, overflow: 'auto', textAlign: 'left', whiteSpace: 'pre-wrap' }}>
              {String(this.state.error?.message || this.state.error).slice(0, 400)}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{ marginTop: 14, background: '#18181b', color: '#fff', border: 0, borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >
              Reload Inui
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
