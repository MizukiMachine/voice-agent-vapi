/**
 * Next.js Middleware
 * REQUIREMENTS_v3: X-Trace-ID 付与 (全APIリクエスト)
 *
 * すべてのAPIリクエストに一意のトレースIDを付与し、
 * リクエストの追跡を可能にする。
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * X-Trace-ID ヘッダー名
 */
const TRACE_ID_HEADER = 'x-trace-id';

/**
 * トレースIDを生成する
 * @returns UUID v4形式のトレースID
 */
function generateTraceId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Middleware関数
 * すべてのリクエストにX-Trace-IDを付与する
 */
export function middleware(request: NextRequest) {
  // 既存のTrace-IDがあれば使用、なければ生成
  const existingTraceId = request.headers.get(TRACE_ID_HEADER);
  const traceId = existingTraceId || generateTraceId();

  // レスポンスにTrace-IDを設定
  const response = NextResponse.next();

  // レスポンスヘッダーにTrace-IDを追加
  response.headers.set(TRACE_ID_HEADER, traceId);

  // Cloud Logging 用のトレースヘッダーも設定
  // https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#FIELDS
  const traceToken = `projects/${process.env.GOOGLE_CLOUD_PROJECT}/traces/${traceId.replace(/-/g, '')}`;
  response.headers.set('X-Cloud-Trace-Context', `${traceId};o=1`);

  return response;
}

/**
 * Middlewareを適用するパス
 * - APIルート全て
 * - Webhookエンドポイント
 */
export const config = {
  matcher: [
    // API routes only
    '/api/:path*',
  ],
};
