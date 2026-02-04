/**
 * Log Stream API (SSE)
 *
 * GET /api/logs/stream - Server-Sent Events でリアルタイムログ配信
 *
 * Query params:
 *   level   - フィルタ: DEBUG|INFO|WARN|ERROR
 *   service - フィルタ: サービス名
 */

import { NextRequest } from 'next/server';
import { subscribeToLogs, LogLevel } from '@/app/lib/logger';
import type { LogEntry } from '@/app/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const levelFilter = searchParams.get('level') as LogLevel | null;
  const serviceFilter = searchParams.get('service') || null;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 初回接続メッセージ
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`),
      );

      const unsubscribe = subscribeToLogs((entry: LogEntry) => {
        // フィルタリング
        if (levelFilter && entry.severity !== levelFilter) return;
        if (serviceFilter && entry.service !== serviceFilter) return;

        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(entry)}\n\n`),
          );
        } catch {
          // クライアント切断時
          unsubscribe();
        }
      });

      // クライアント切断時にクリーンアップ
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
