import React from 'react';
import { AuthLoader } from '@/components/AuthLoader';

/**
 * RootInitialLoading
 * Minimal splash used strictly on cold initial application boot.
 * Does NOT fake the sidebar or header layout.
 */
export default function RootInitialLoading() {
  return <AuthLoader />;
}
