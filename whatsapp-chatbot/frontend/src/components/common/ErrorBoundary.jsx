import { Component } from 'react';

/**
 * Error Boundary that catches DOM manipulation errors caused by browser
 * extensions (translators, Grammarly, etc.) interfering with React's
 * virtual DOM reconciliation. Instead of crashing, it recovers gracefully.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Check if it's a DOM manipulation error from browser extensions
    const isDomError =
      error?.message?.includes('removeChild') ||
      error?.message?.includes('insertBefore') ||
      error?.message?.includes('appendChild') ||
      error?.message?.includes('is not a child of this node');

    if (isDomError) {
      console.warn(
        '[ErrorBoundary] DOM manipulation error caught (likely from a browser extension):',
        error.message
      );
    } else {
      console.error('[ErrorBoundary] Unexpected error:', error, errorInfo);
    }
  }

  handleReload = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '40px 20px', textAlign: 'center',
          minHeight: '200px',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h3 style={{ color: '#666', marginBottom: '8px' }}>
            Algo salió mal al renderizar esta sección
          </h3>
          <p style={{ color: '#999', marginBottom: '20px', maxWidth: '450px', fontSize: '14px' }}>
            Esto puede ser causado por una extensión del navegador (traductor, Grammarly, etc.)
            que interfiere con la página.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 24px', borderRadius: '8px', border: 'none',
              background: 'linear-gradient(135deg, #25D366, #128C7E)',
              color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '14px',
            }}
          >
            🔄 Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
