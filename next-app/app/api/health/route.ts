import { NextResponse } from 'next/server';
import { env } from '@/config/env';

export async function GET() {
  const isSupabaseConfigured = Boolean(env.supabase.url && env.supabase.anonKey);

  return NextResponse.json(
    {
      status: 'operational',
      system: 'OrderFlow Next.js Foundation',
      version: env.app.version,
      timestamp: new Date().toISOString(),
      node: process.version,
      databaseConfigured: isSupabaseConfigured,
      environment: process.env.NODE_ENV || 'development',
    },
    { status: 200 }
  );
}
