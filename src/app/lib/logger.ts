/**
 * Unified Logging System
 * REQUIREMENTS_v3: X-Trace-ID を含む構造化ログ
 *
 * Features:
 * - Google Cloud Logging 互換のJSON形式
 * - ローカル開発向けANSIカラー出力
 * - 循環バッファ（最大1000件）
 * - パフォーマンストラッキング（startTimer/endTimer）
 * - サービス名付きログ
 */

import { headers } from 'next/headers';

// ============================================================
// Types & Constants
// ============================================================

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogEntry {
  severity: LogLevel;
  message: string;
  timestamp: string;
  service?: string;
  traceId?: string;
  userId?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  duration?: number;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  [key: string]: unknown;
}

const LOG_BUFFER_MAX = 1000;
const IS_DEV = process.env.NODE_ENV !== 'production';

// ANSI color codes for local dev output
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  // Log levels
  DEBUG: '\x1b[36m',   // Cyan
  INFO: '\x1b[32m',    // Green
  WARN: '\x1b[33m',    // Yellow
  ERROR: '\x1b[31m',   // Red
  // Extras
  traceId: '\x1b[35m', // Magenta
  service: '\x1b[34m', // Blue
} as const;

// ============================================================
// Circular Buffer
// ============================================================

class CircularLogBuffer {
  private buffer: LogEntry[] = [];
  private pointer = 0;
  private full = false;

  push(entry: LogEntry) {
    if (this.full) {
      this.buffer[this.pointer] = entry;
    } else {
      this.buffer.push(entry);
    }
    this.pointer = (this.pointer + 1) % LOG_BUFFER_MAX;
    if (this.pointer === 0 && !this.full) {
      this.full = true;
    }
  }

  getAll(): LogEntry[] {
    if (!this.full) return [...this.buffer];
    // Return in chronological order
    return [
      ...this.buffer.slice(this.pointer),
      ...this.buffer.slice(0, this.pointer),
    ];
  }

  getRecent(count: number): LogEntry[] {
    const all = this.getAll();
    return all.slice(-count);
  }

  query(filter: {
    level?: LogLevel;
    service?: string;
    traceId?: string;
    search?: string;
    limit?: number;
  }): LogEntry[] {
    let entries = this.getAll();

    if (filter.level) {
      entries = entries.filter((e) => e.severity === filter.level);
    }
    if (filter.service) {
      entries = entries.filter((e) => e.service === filter.service);
    }
    if (filter.traceId) {
      entries = entries.filter((e) => e.traceId === filter.traceId);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      entries = entries.filter((e) => e.message.toLowerCase().includes(q));
    }
    if (filter.limit) {
      entries = entries.slice(-filter.limit);
    }

    return entries;
  }

  get size(): number {
    return this.full ? LOG_BUFFER_MAX : this.buffer.length;
  }

  clear() {
    this.buffer = [];
    this.pointer = 0;
    this.full = false;
  }
}

export const logBuffer = new CircularLogBuffer();

// SSE subscribers for admin dashboard
type LogSubscriber = (entry: LogEntry) => void;
const subscribers: Set<LogSubscriber> = new Set();

export function subscribeToLogs(callback: LogSubscriber): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

// ============================================================
// Performance Tracking
// ============================================================

const activeTimers = new Map<string, { start: number; metadata?: Record<string, unknown> }>();

export function startTimer(label: string, metadata?: Record<string, unknown>): void {
  activeTimers.set(label, { start: performance.now(), metadata });
}

export function endTimer(
  label: string,
  service?: string,
  traceId?: string,
): { duration: number; label: string } | null {
  const timer = activeTimers.get(label);
  if (!timer) return null;

  const duration = Math.round(performance.now() - timer.start);
  activeTimers.delete(label);

  logInfo(`[perf] ${label}: ${duration}ms`, {
    service: service || 'perf',
    traceId,
    duration,
    perfLabel: label,
    ...timer.metadata,
  });

  return { duration, label };
}

// ============================================================
// Core Logging
// ============================================================

function formatDev(entry: LogEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString('ja-JP', { hour12: false });
  const level = `${COLORS[entry.severity]}${entry.severity.padEnd(5)}${COLORS.reset}`;
  const svc = entry.service
    ? ` ${COLORS.service}[${entry.service}]${COLORS.reset}`
    : '';
  const trace = entry.traceId
    ? ` ${COLORS.dim}${COLORS.traceId}${entry.traceId.slice(0, 8)}${COLORS.reset}`
    : '';
  const dur = entry.duration != null
    ? ` ${COLORS.dim}(${entry.duration}ms)${COLORS.reset}`
    : '';
  const errMsg = entry.error
    ? `\n  ${COLORS.ERROR}${entry.error.message}${COLORS.reset}`
    : '';

  return `${COLORS.dim}${time}${COLORS.reset} ${level}${svc}${trace} ${entry.message}${dur}${errMsg}`;
}

export function emit(entry: LogEntry) {
  // Add to buffer
  logBuffer.push(entry);

  // Notify SSE subscribers
  for (const sub of subscribers) {
    try {
      sub(entry);
    } catch {
      // Don't let subscriber errors break logging
    }
  }

  // Output
  if (IS_DEV) {
    // Pretty terminal output for local development
    const formatted = formatDev(entry);
    switch (entry.severity) {
      case LogLevel.ERROR:
        console.error(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
        break;
    }
  } else {
    // Production: structured JSON for Cloud Logging
    console.log(JSON.stringify(entry));
  }
}

function createEntry(
  severity: LogLevel,
  message: string,
  metadata?: Record<string, unknown>,
): LogEntry {
  return {
    severity,
    message,
    timestamp: new Date().toISOString(),
    ...metadata,
  };
}

// ============================================================
// Public API - Basic Logging
// ============================================================

export async function getTraceId(): Promise<string | undefined> {
  try {
    const headersList = await headers();
    return headersList.get('x-trace-id') || undefined;
  } catch {
    return undefined;
  }
}

export function logDebug(message: string, metadata?: Record<string, unknown>) {
  emit(createEntry(LogLevel.DEBUG, message, metadata));
}

export function logInfo(message: string, metadata?: Record<string, unknown>) {
  emit(createEntry(LogLevel.INFO, message, metadata));
}

export function logWarn(message: string, metadata?: Record<string, unknown>) {
  emit(createEntry(LogLevel.WARN, message, metadata));
}

export function logError(
  message: string,
  error?: Error | { message: string; code?: string },
  metadata?: Record<string, unknown>,
) {
  emit(
    createEntry(LogLevel.ERROR, message, {
      error: error
        ? {
            message: error.message,
            stack: error instanceof Error ? error.stack : undefined,
            code: 'code' in error ? (error as { code?: string }).code : undefined,
          }
        : undefined,
      ...metadata,
    }),
  );
}

// ============================================================
// Public API - Request Lifecycle
// ============================================================

export function logRequestStart(
  endpoint: string,
  method: string,
  traceId?: string,
  userId?: string,
  metadata?: Record<string, unknown>,
) {
  startTimer(`${method} ${endpoint}`, { endpoint, method, traceId, userId });
  logInfo(`${method} ${endpoint} - Started`, {
    service: 'api',
    endpoint,
    method,
    traceId,
    userId,
    ...metadata,
  });
}

export function logRequestComplete(
  endpoint: string,
  method: string,
  statusCode: number,
  duration: number,
  traceId?: string,
  userId?: string,
) {
  // Clean up timer if still active
  activeTimers.delete(`${method} ${endpoint}`);
  logInfo(`${method} ${endpoint} - ${statusCode}`, {
    service: 'api',
    endpoint,
    method,
    statusCode,
    duration,
    traceId,
    userId,
  });
}

export function logRequestError(
  endpoint: string,
  method: string,
  error: Error | { message: string; code?: string },
  traceId?: string,
  userId?: string,
) {
  // Clean up timer if still active
  activeTimers.delete(`${method} ${endpoint}`);
  logError(`${method} ${endpoint} - Failed`, error, {
    service: 'api',
    endpoint,
    method,
    traceId,
    userId,
  });
}

// ============================================================
// Service Logger Factory
// ============================================================

export function createServiceLogger(service: string) {
  return {
    debug: (message: string, metadata?: Record<string, unknown>) =>
      logDebug(message, { service, ...metadata }),
    info: (message: string, metadata?: Record<string, unknown>) =>
      logInfo(message, { service, ...metadata }),
    warn: (message: string, metadata?: Record<string, unknown>) =>
      logWarn(message, { service, ...metadata }),
    error: (
      message: string,
      error?: Error | { message: string; code?: string },
      metadata?: Record<string, unknown>,
    ) => logError(message, error, { service, ...metadata }),
    startTimer: (label: string, metadata?: Record<string, unknown>) =>
      startTimer(label, metadata),
    endTimer: (label: string, traceId?: string) =>
      endTimer(label, service, traceId),
  };
}

// ============================================================
// Supabase Query Logger
// ============================================================

export async function logSupabaseQuery<T>(
  operation: string,
  table: string,
  queryFn: () => Promise<{ data: T; error: { message: string; code?: string } | null }>,
  traceId?: string,
): Promise<{ data: T; error: { message: string; code?: string } | null }> {
  const label = `supabase:${operation}:${table}`;
  startTimer(label);

  const result = await queryFn();

  const duration = endTimer(label, 'supabase', traceId);

  if (result.error) {
    logError(`Supabase ${operation} on ${table} failed`, result.error, {
      service: 'supabase',
      traceId,
      table,
      operation,
      duration: duration?.duration,
    });
  }

  return result;
}
