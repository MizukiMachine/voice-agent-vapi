'use client';

import { useState } from 'react';
import { LocationData, NotificationData } from '@/app/types';

interface SimulatorPanelProps {
  sessionId: string | null;
  disabled: boolean;
}

export default function SimulatorPanel({ sessionId, disabled }: SimulatorPanelProps) {
  const [activeTab, setActiveTab] = useState<'location' | 'notification'>('location');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Location state
  const [latitude, setLatitude] = useState('35.6812');
  const [longitude, setLongitude] = useState('139.7671');
  const [placeName, setPlaceName] = useState('Tokyo Station');

  // Notification state
  const [notifType, setNotifType] = useState<NotificationData['type']>('message');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifContent, setNotifContent] = useState('');
  const [notifAppName, setNotifAppName] = useState('');

  const sendLocation = async () => {
    if (!sessionId) return;

    setSending(true);
    setResult(null);

    try {
      const res = await fetch('/api/simulate/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          placeName: placeName || undefined,
        } as LocationData & { sessionId: string }),
      });

      const data = await res.json();
      setResult({
        success: res.ok,
        message: res.ok ? 'Location sent' : data.error?.message || 'Failed',
      });
    } catch {
      setResult({ success: false, message: 'Network error' });
    } finally {
      setSending(false);
    }
  };

  const sendNotification = async () => {
    if (!sessionId || !notifContent) return;

    setSending(true);
    setResult(null);

    try {
      const res = await fetch('/api/simulate/notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          type: notifType,
          title: notifTitle || undefined,
          content: notifContent,
          appName: notifAppName || undefined,
        } as NotificationData & { sessionId: string }),
      });

      const data = await res.json();
      setResult({
        success: res.ok,
        message: res.ok ? 'Notification sent' : data.error?.message || 'Failed',
      });
    } catch {
      setResult({ success: false, message: 'Network error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Simulator
      </h2>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setActiveTab('location')}
          className={`rounded px-3 py-1 text-sm ${
            activeTab === 'location'
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300'
          }`}
        >
          Location
        </button>
        <button
          onClick={() => setActiveTab('notification')}
          className={`rounded px-3 py-1 text-sm ${
            activeTab === 'notification'
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300'
          }`}
        >
          Notification
        </button>
      </div>

      {disabled && (
        <div className="mb-4 rounded bg-yellow-100 p-2 text-sm text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
          Start a session to use simulator
        </div>
      )}

      {/* Location Tab */}
      {activeTab === 'location' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Latitude</label>
              <input
                type="number"
                step="0.0001"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                disabled={disabled}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Longitude</label>
              <input
                type="number"
                step="0.0001"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                disabled={disabled}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Place Name (optional)</label>
            <input
              type="text"
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              placeholder="e.g., Tokyo Station"
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              disabled={disabled}
            />
          </div>
          <button
            onClick={sendLocation}
            disabled={disabled || sending}
            className="w-full rounded bg-green-600 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send Location'}
          </button>
        </div>
      )}

      {/* Notification Tab */}
      {activeTab === 'notification' && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Type</label>
            <select
              value={notifType}
              onChange={(e) => setNotifType(e.target.value as NotificationData['type'])}
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              disabled={disabled}
            >
              <option value="message">Message</option>
              <option value="calendar">Calendar</option>
              <option value="reminder">Reminder</option>
              <option value="alert">Alert</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Title (optional)</label>
            <input
              type="text"
              value={notifTitle}
              onChange={(e) => setNotifTitle(e.target.value)}
              placeholder="e.g., Meeting reminder"
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              disabled={disabled}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Content</label>
            <textarea
              value={notifContent}
              onChange={(e) => setNotifContent(e.target.value)}
              placeholder="Notification content..."
              rows={2}
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              disabled={disabled}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">App Name (optional)</label>
            <input
              type="text"
              value={notifAppName}
              onChange={(e) => setNotifAppName(e.target.value)}
              placeholder="e.g., LINE"
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              disabled={disabled}
            />
          </div>
          <button
            onClick={sendNotification}
            disabled={disabled || sending || !notifContent}
            className="w-full rounded bg-purple-600 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send Notification'}
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div
          className={`mt-4 rounded p-2 text-sm ${
            result.success
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
