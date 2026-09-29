'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertOctagon, RotateCcw, Home } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled Next.js Application Error:', error);
  }, [error]);

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
        maxWidth: '520px',
        width: '100%',
        textAlign: 'center',
        background: 'var(--bg-surface, #0f172a)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        borderRadius: '20px',
        padding: '40px 32px',
        boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: 'rgba(239, 68, 68, 0.1)',
          color: '#ef4444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px'
        }}>
          <AlertOctagon size={32} />
        </div>

        <span style={{
          fontSize: '0.8rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#ef4444'
        }}>
          Application Error
        </span>

        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          margin: '8px 0 12px',
          letterSpacing: '-0.02em',
          color: 'var(--text-primary, #ffffff)'
        }}>
          Something went wrong
        </h1>

        <p style={{
          fontSize: '0.92rem',
          color: 'var(--text-secondary, #94a3b8)',
          lineHeight: '1.5',
          margin: '0 0 16px'
        }}>
          An unexpected error occurred while rendering this interface.
        </p>

        {error.message && (
          <div style={{
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '0.8rem',
            color: '#f87171',
            fontFamily: 'monospace',
            textAlign: 'left',
            overflowX: 'auto',
            marginBottom: '24px'
          }}>
            {error.message}
          </div>
        )}

        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <button
            type="button"
            onClick={() => reset()}
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
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.15s ease'
            }}
          >
            <RotateCcw size={16} />
            Try Again
          </button>

          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.08)',
              color: 'var(--text-primary, #f8fafc)',
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
