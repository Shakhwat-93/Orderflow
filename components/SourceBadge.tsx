'use client';

import React from 'react';

export interface NormalizedSource {
  label: string;
  cls: string;
  category: 'TikTok' | 'Facebook' | 'Instagram' | 'Messenger' | 'Website' | 'Google' | 'YouTube' | 'WhatsApp' | 'Direct' | 'Other';
}

/**
 * Intelligently resolves and normalizes traffic source and order source.
 * Handles dual-field attribution (e.g. source="main website", traffic_source="TikTok").
 */
export function normalizeSource(
  traffic_source?: string | null,
  source?: string | null
): NormalizedSource {
  const s1 = String(source || '').trim();
  const s2 = String(traffic_source || '').trim();
  const combined = `${s1} ${s2}`.toLowerCase();

  if (!s1 && !s2) {
    return { label: 'Direct', cls: 'source-badge-direct', category: 'Direct' };
  }

  // 1. TikTok Priority Check
  if (combined.includes('tiktok') || combined.includes('ttclid') || combined.includes('musically') || combined.includes('byteoversea')) {
    return { label: 'TikTok', cls: 'source-badge-tiktok', category: 'TikTok' };
  }

  // 2. Messenger Priority Check
  if (combined.includes('messenger') || s1.toLowerCase() === 'msg' || s2.toLowerCase() === 'msg') {
    return { label: 'Messenger', cls: 'source-badge-messenger', category: 'Messenger' };
  }

  // 3. Facebook Priority Check
  if (
    combined.includes('facebook') || 
    s1.toLowerCase() === 'fb' || 
    s2.toLowerCase() === 'fb' || 
    combined.startsWith('fb ') ||
    combined.startsWith('fb/') ||
    combined.includes('fb /') ||
    combined.includes('fb_') ||
    combined.includes('fb-') ||
    combined.includes('l.facebook.com') || 
    combined.includes('m.facebook.com') ||
    combined.includes('fbclid')
  ) {
    return { label: 'Facebook', cls: 'source-badge-fb', category: 'Facebook' };
  }

  // 4. Instagram Priority Check
  if (
    combined.includes('instagram') || 
    s1.toLowerCase() === 'ig' || 
    s2.toLowerCase() === 'ig' || 
    combined.includes('l.instagram.com')
  ) {
    return { label: 'Instagram', cls: 'source-badge-ig', category: 'Instagram' };
  }

  // 5. YouTube Priority Check
  if (combined.includes('youtube') || s1.toLowerCase() === 'yt' || s2.toLowerCase() === 'yt') {
    return { label: 'YouTube', cls: 'source-badge-yt', category: 'YouTube' };
  }

  // 6. Google Priority Check
  if (combined.includes('google') || combined.includes('cpc') || combined.includes('gclid')) {
    return { label: 'Google', cls: 'source-badge-google', category: 'Google' };
  }

  // 7. WhatsApp Priority Check
  if (combined.includes('whatsapp') || combined.includes('wa')) {
    return { label: 'WhatsApp', cls: 'source-badge-wa', category: 'WhatsApp' };
  }

  // 8. Website / Landing Page / Organic
  if (
    combined.includes('website') || 
    combined.includes('web') || 
    combined.includes('landing') || 
    combined.includes('stb-') || 
    combined.includes('mmb-') ||
    combined.includes('organic')
  ) {
    return { label: 'Website', cls: 'source-badge-web', category: 'Website' };
  }

  // 9. Direct
  if (combined.includes('direct')) {
    return { label: 'Direct', cls: 'source-badge-direct', category: 'Direct' };
  }

  // Fallback
  const fallbackLabel = s1 || s2 || 'Website';
  return { label: fallbackLabel, cls: 'source-badge-default', category: 'Other' };
}

/**
 * Filter checker supporting multi-channel sources.
 */
export function matchesSourceFilter(order: any, selectedFilter: string): boolean {
  if (!selectedFilter || selectedFilter === 'All') return true;

  const normalized = normalizeSource(order?.traffic_source, order?.source);
  const target = selectedFilter.toLowerCase().trim();

  if (target === 'tiktok') {
    return normalized.category === 'TikTok';
  }
  if (target === 'facebook') {
    return normalized.category === 'Facebook';
  }
  if (target === 'instagram') {
    return normalized.category === 'Instagram';
  }
  if (target === 'messenger') {
    return normalized.category === 'Messenger';
  }
  if (target === 'website') {
    return normalized.category === 'Website';
  }
  if (target === 'direct') {
    return normalized.category === 'Direct';
  }

  const s1 = String(order?.source || '').toLowerCase();
  const s2 = String(order?.traffic_source || '').toLowerCase();
  return s1.includes(target) || s2.includes(target) || normalized.label.toLowerCase().includes(target);
}

/**
 * Production-ready Source Badge Component
 */
export const SourceBadge: React.FC<{
  traffic_source?: string | null;
  source?: string | null;
  className?: string;
  style?: React.CSSProperties;
}> = ({ traffic_source, source, className, style }) => {
  const { label, cls, category } = normalizeSource(traffic_source, source);

  return (
    <span
      className={`source-badge ${cls} ${className || ''}`}
      style={style}
      title={`Source: ${source || 'N/A'} | Traffic: ${traffic_source || 'N/A'}`}
    >
      {category === 'TikTok' && (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ marginRight: '3px', flexShrink: 0, display: 'inline-block', verticalAlign: '-1.5px' }}
          aria-hidden="true"
        >
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.82 4.46 6.27 6.27 0 0 0 1.88-4.46V8.62a8.28 8.28 0 0 0 4.89 1.58v-3.51Z" />
        </svg>
      )}
      {label}
    </span>
  );
};

export default SourceBadge;
