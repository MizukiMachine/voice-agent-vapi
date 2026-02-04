'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface LogEntry {
  severity: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  timestamp: string;
  service?: string;
  traceId?: string;
  duration?: number;
  endpoint?: string;
  error?: { message: string };
  [key: string]: unknown;
}

const SEVERITY_COLORS: Record<string, string> = {
  DEBUG: 'text-cyan-400',
  INFO: 'text-green-400',
  WARN: 'text-yellow-400',
  ERROR: 'text-red-400',
};

const SEVERITY_BG: Record<string, string> = {
  DEBUG: 'bg-cyan-900/30 border-cyan-800',
  INFO: 'bg-green-900/30 border-green-800',
  WARN: 'bg-yellow-900/30 border-yellow-800',
  ERROR: 'bg-red-900/30 border-red-800',
};

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load initial logs
  useEffect(() => {
    async function fetchLogs() {
      try {
        const params = new URLSearchParams({ limit: '200' });
        if (levelFilter) params.set('level', levelFilter);
        if (serviceFilter) params.set('service', serviceFilter);
        if (searchQuery) params.set('search', searchQuery);

        const res = await fetch(`/api/logs?${params}`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.entries);
        }
      } catch {
        // Silent fail on initial load
      }
    }
    fetchLogs();
  }, [levelFilter, serviceFilter, searchQuery]);

  // SSE streaming
  const startStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const params = new URLSearchParams();
    if (levelFilter) params.set('level', levelFilter);
    if (serviceFilter) params.set('service', serviceFilter);

    const url = `/api/logs/stream${params.toString() ? `?${params}` : ''}`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const entry: LogEntry = JSON.parse(event.data);
        if (entry.type === 'connected') return;

        if (!isPaused) {
          setLogs((prev) => {
            const next = [...prev, entry];
            // Keep max 500 entries in view
            return next.length > 500 ? next.slice(-500) : next;
          });
        }
      } catch {
        // Invalid JSON, ignore
      }
    };

    es.onerror = () => {
      setIsStreaming(false);
      es.close();
    };

    eventSourceRef.current = es;
    setIsStreaming(true);
  }, [levelFilter, serviceFilter, isPaused]);

  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Get unique services from logs
  const services = Array.from(new Set(logs.map((l) => l.service).filter(Boolean))) as string[];

  // Filter logs by search query (client-side for real-time stream)
  const filteredLogs = searchQuery
    ? logs.filter((l) => l.message.toLowerCase().includes(searchQuery.toLowerCase()))
    : logs;

  const clearLogs = () => setLogs([]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Log Console</h1>
            <p className="text-sm text-zinc-500">
              Real-time unified log viewer
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500">
              {filteredLogs.length} entries
            </span>
            <span
              className={`inline-flex h-2 w-2 rounded-full ${
                isStreaming ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Streaming toggle */}
          <button
            onClick={isStreaming ? stopStreaming : startStreaming}
            className={`rounded px-4 py-1.5 text-sm font-medium ${
              isStreaming
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isStreaming ? 'Stop' : 'Start'} Stream
          </button>

          {/* Pause */}
          {isStreaming && (
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`rounded px-3 py-1.5 text-sm ${
                isPaused
                  ? 'bg-yellow-600 text-white'
                  : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
              }`}
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
          )}

          {/* Level filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 border border-zinc-700"
          >
            <option value="">All Levels</option>
            <option value="DEBUG">DEBUG</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>

          {/* Service filter */}
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 border border-zinc-700"
          >
            <option value="">All Services</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Search */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 border border-zinc-700 placeholder-zinc-600 w-48"
          />

          {/* Auto-scroll */}
          <label className="flex items-center gap-1.5 text-sm text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>

          {/* Clear */}
          <button
            onClick={clearLogs}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={logContainerRef}
        className="h-[calc(100vh-160px)] overflow-y-auto px-4 py-2 font-mono text-xs"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-600">
            <div className="text-center">
              <p className="text-lg">No logs yet</p>
              <p className="mt-1">
                {isStreaming
                  ? 'Waiting for log entries...'
                  : 'Click "Start Stream" to begin receiving logs'}
              </p>
            </div>
          </div>
        ) : (
          filteredLogs.map((entry, i) => (
            <LogLine key={`${entry.timestamp}-${i}`} entry={entry} />
          ))
        )}
      </div>
    </div>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const time = new Date(entry.timestamp).toLocaleTimeString('ja-JP', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const ms = new Date(entry.timestamp).getMilliseconds().toString().padStart(3, '0');

  return (
    <div
      className={`border-l-2 pl-3 py-0.5 mb-0.5 cursor-pointer hover:bg-zinc-900/50 ${
        SEVERITY_BG[entry.severity] || 'border-zinc-700'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-2">
        <span className="text-zinc-600 shrink-0">
          {time}.{ms}
        </span>
        <span
          className={`font-bold w-12 shrink-0 ${
            SEVERITY_COLORS[entry.severity] || 'text-zinc-400'
          }`}
        >
          {entry.severity.slice(0, 5).padEnd(5)}
        </span>
        {entry.service && (
          <span className="text-blue-400 shrink-0">[{entry.service}]</span>
        )}
        {entry.traceId && (
          <span className="text-purple-400/60 shrink-0">
            {entry.traceId.slice(0, 8)}
          </span>
        )}
        <span className="text-zinc-300 break-all">{entry.message}</span>
        {entry.duration != null && (
          <span className="text-zinc-600 shrink-0">({entry.duration}ms)</span>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-1 ml-14 text-zinc-500 space-y-0.5">
          {entry.endpoint && <div>Endpoint: {entry.endpoint}</div>}
          {entry.traceId && <div>TraceID: {entry.traceId}</div>}
          {entry.error && (
            <div className="text-red-400">Error: {entry.error.message}</div>
          )}
          <pre className="text-zinc-600 mt-1 overflow-x-auto">
            {JSON.stringify(entry, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
