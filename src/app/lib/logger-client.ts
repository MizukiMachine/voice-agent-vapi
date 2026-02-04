/**
 * Client-side Logger
 *
 * ブラウザ側で発生するログを収集し、/api/logs に送信する。
 * バッチ送信でネットワーク負荷を軽減。
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface ClientLogEntry {
  level: LogLevel;
  message: string;
  service: string;
  metadata?: Record<string, unknown>;
}

const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 5000;

class ClientLogger {
  private queue: ClientLogEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private service: string;

  constructor(service: string) {
    this.service = service;
    this.startFlushTimer();
  }

  private startFlushTimer() {
    if (typeof window === 'undefined') return;
    this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  private enqueue(entry: ClientLogEntry) {
    this.queue.push(entry);
    if (this.queue.length >= BATCH_SIZE) {
      this.flush();
    }
  }

  async flush() {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0);
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
    } catch {
      // サーバーに送れなかった場合はコンソールにフォールバック
      for (const entry of batch) {
        console.warn('[logger-client] Failed to send:', entry.message);
      }
    }
  }

  debug(message: string, metadata?: Record<string, unknown>) {
    this.enqueue({ level: 'DEBUG', message, service: this.service, metadata });
  }

  info(message: string, metadata?: Record<string, unknown>) {
    this.enqueue({ level: 'INFO', message, service: this.service, metadata });
  }

  warn(message: string, metadata?: Record<string, unknown>) {
    this.enqueue({ level: 'WARN', message, service: this.service, metadata });
  }

  error(message: string, metadata?: Record<string, unknown>) {
    this.enqueue({ level: 'ERROR', message, service: this.service, metadata });
    // エラーは即座にフラッシュ
    this.flush();
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }
}

export function createClientLogger(service: string): ClientLogger {
  return new ClientLogger(service);
}
