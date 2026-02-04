/**
 * GET /api/health
 * Health check endpoint for Cloud Run
 */

import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/app/lib/supabase';
import { logRequestComplete, logRequestStart, getTraceId } from '@/app/lib/logger';

export async function GET() {
  const startTime = Date.now();
  const traceId = await getTraceId();

  logRequestStart('/api/health', 'GET', traceId);

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    traceId,
    services: {
      supabase: isSupabaseConfigured(),
      openai: !!process.env.OPENAI_API_KEY,
    },
    version: process.env.npm_package_version || '0.1.0',
    environment: process.env.NODE_ENV || 'development',
  };

  const duration = Date.now() - startTime;

  logRequestComplete('/api/health', 'GET', 200, duration, traceId);

  return NextResponse.json(health);
}
