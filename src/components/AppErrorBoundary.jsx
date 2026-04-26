import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const shellStyle = {
  minHeight: '100dvh',
  display: 'grid',
  placeItems: 'center',
  padding: '24px',
  background:
    'radial-gradient(circle at top left, rgba(99,102,241,0.18), transparent 35%), linear-gradient(160deg, #f8fbff 0%, #eef2ff 45%, #f6f7fb 100%)',
};

const cardStyle = {
  width: 'min(560px, 100%)',
  padding: '32px',
  borderRadius: '28px',
  background: 'rgba(255,255,255,0.92)',
  border: '1px solid rgba(15,23,42,0.08)',
  boxShadow: '0 28px 80px rgba(15,23,42,0.14)',
  backdropFilter: 'blur(20px)',
};

export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App runtime crash:', error, errorInfo);
  }

  handleReload = () => {
    window.location.assign('/');
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div style={shellStyle}>
        <div style={cardStyle}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(239,68,68,0.1)',
            color: '#dc2626',
            marginBottom: 20,
          }}>
            <AlertTriangle size={28} />
          </div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
            Recovery screen active
          </h1>
          <p style={{ margin: '12px 0 0', color: '#475569', lineHeight: 1.7 }}>
            App ekta unexpected runtime crash theke recover kortese. Reload diye clean boot nile usually session abar thik moto restore hoy.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              marginTop: 22,
              border: 'none',
              borderRadius: 999,
              padding: '12px 18px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={16} />
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
