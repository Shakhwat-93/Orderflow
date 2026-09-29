import Link from 'next/link';
import { Compass, ArrowLeft, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'var(--bg-primary, #090d16)',
      color: 'var(--text-primary, #f8fafc)',
      fontFamily: 'inherit'
    }}>
      <div style={{
        maxWidth: '480px',
        width: '100%',
        textAlign: 'center',
        background: 'var(--bg-surface, #0f172a)',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
        borderRadius: '20px',
        padding: '40px 32px',
        boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: 'rgba(99, 102, 241, 0.1)',
          color: '#6366f1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px'
        }}>
          <Compass size={32} />
        </div>

        <span style={{
          fontSize: '0.8rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#6366f1'
        }}>
          404 — Page Not Found
        </span>

        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          margin: '8px 0 12px',
          letterSpacing: '-0.02em',
          color: 'var(--text-primary, #ffffff)'
        }}>
          Lost in Navigation
        </h1>

        <p style={{
          fontSize: '0.92rem',
          color: 'var(--text-secondary, #94a3b8)',
          lineHeight: '1.5',
          margin: '0 0 28px'
        }}>
          The page you requested doesn&apos;t exist or was relocated during the system upgrade.
        </p>

        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '10px',
              background: '#6366f1',
              color: '#ffffff',
              fontSize: '0.88rem',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'background 0.15s ease'
            }}
          >
            <Home size={16} />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
