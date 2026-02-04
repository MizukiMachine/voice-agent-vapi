/**
 * Log Ingestion & Query API
 *
 * POST /api/logs - クライアント/外部サービスからのログ受付
 * GET  /api/logs - バッファ内ログの取得（管理画面用）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  emit,
  logBuffer,
  LogLevel,
  type LogEntry,
} from '@/app/lib/logger';

interface IncomingLogEntry {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  service?: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

const VALID_LEVELS = new Set(Object.values(LogLevel));

/**
 * POST /api/logs
 * クライアント・Qwen TTSサーバーからのログを受け付ける
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const traceId = request.headers.get('x-trace-id') || undefined;

    // 単一エントリまたは配列を受け付ける
    const entries: IncomingLogEntry[] = Array.isArray(body) ? body : [body];

    if (entries.length === 0) {
      return NextResponse.json({ error: 'No log entries' }, { status: 400 });
    }

    if (entries.length > 100) {
      return NextResponse.json(
        { error: 'Too many entries (max 100)' },
        { status: 400 },
      );
    }

    let accepted = 0;
    for (const entry of entries) {
      if (!entry.message || !entry.level) continue;
      if (!VALID_LEVELS.has(entry.level as LogLevel)) continue;

      const logEntry: LogEntry = {
        severity: entry.level as LogLevel,
        message: entry.message,
        timestamp: new Date().toISOString(),
        service: entry.service || 'client',
        traceId: entry.traceId || traceId,
        source: 'remote',
        ...entry.metadata,
      };

      emit(logEntry);
      accepted++;
    }

    return NextResponse.json({ accepted });
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }
}

/**
 * GET /api/logs
 * バッファ内のログを取得する（管理画面用）
 *
 * Query params:
 *   level    - フィルタ: DEBUG|INFO|WARN|ERROR
 *   service  - フィルタ: サービス名
 *   traceId  - フィルタ: トレースID
 *   search   - 全文検索
 *   limit    - 取得件数（デフォルト100）
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const level = searchParams.get('level') as LogLevel | null;
  const service = searchParams.get('service') || undefined;
  const traceId = searchParams.get('traceId') || undefined;
  const search = searchParams.get('search') || undefined;
  const limit = parseInt(searchParams.get('limit') || '100', 10);

  const entries = logBuffer.query({
    level: level || undefined,
    service,
    traceId,
    search,
    limit: Math.min(limit, 1000),
  });

  return NextResponse.json({
    entries,
    total: logBuffer.size,
    filtered: entries.length,
  });
}
