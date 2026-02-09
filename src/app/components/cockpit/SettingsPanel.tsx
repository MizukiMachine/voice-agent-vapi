'use client';

import { useState, useEffect, useCallback } from 'react';
import type { UserSettings } from '@/app/types';

interface SettingsPanelProps {
  userId: string | null;
}

export default function SettingsPanel({ userId }: SettingsPanelProps) {
  const [settings, setSettings] = useState<UserSettings>({
    location_cool_time: 1800000,
    location_search_radius: 100,
    notification_tts_enabled: true,
    notification_tts_max_length: 200,
    notification_tts_include_title: true,
    notification_tts_include_body: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/cockpit/settings?userId=${userId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to fetch settings');
      }
      const data = await res.json();
      setSettings(data.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!userId) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const res = await fetch('/api/cockpit/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, settings }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to save settings');
      }

      setSuccessMessage('設定を保存しました');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const formatCoolTime = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    return `${minutes}分`;
  };

  if (!userId) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          設定
        </h2>
        <p className="text-sm text-zinc-500">ユーザーを選択してください</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          設定
        </h2>
        <div className="py-4 text-center text-zinc-500">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          設定
        </h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 rounded bg-green-100 p-2 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-400">
          {successMessage}
        </div>
      )}

      <div className="space-y-6">
        {/* 位置情報設定 */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            位置情報設定
          </h3>

          {/* クールタイム */}
          <div className="mb-4">
            <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
              クールタイム: {formatCoolTime(settings.location_cool_time ?? 1800000)}
            </label>
            <input
              type="range"
              min="0"
              max="7200000"
              step="60000"
              value={settings.location_cool_time}
              onChange={(e) =>
                setSettings({ ...settings, location_cool_time: parseInt(e.target.value) })
              }
              className="w-full"
            />
            <div className="mt-1 flex justify-between text-xs text-zinc-500">
              <span>0分</span>
              <span>30分</span>
              <span>60分</span>
              <span>90分</span>
              <span>120分</span>
            </div>
          </div>

          {/* 検索半径 */}
          <div>
            <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
              検索半径: {settings.location_search_radius}m
            </label>
            <input
              type="range"
              min="10"
              max="1000"
              step="10"
              value={settings.location_search_radius}
              onChange={(e) =>
                setSettings({ ...settings, location_search_radius: parseInt(e.target.value) })
              }
              className="w-full"
            />
            <div className="mt-1 flex justify-between text-xs text-zinc-500">
              <span>10m</span>
              <span>250m</span>
              <span>500m</span>
              <span>750m</span>
              <span>1000m</span>
            </div>
          </div>
        </div>

        <hr className="border-zinc-200 dark:border-zinc-800" />

        {/* 通知TTS設定 */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            通知読み上げ設定
          </h3>

          {/* 有効/無効 */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-zinc-700 dark:text-zinc-300">通知読み上げ</span>
            <button
              type="button"
              onClick={() => setSettings({ ...settings, notification_tts_enabled: !settings.notification_tts_enabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.notification_tts_enabled ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.notification_tts_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* 最大文字数 */}
          <div className="mb-4">
            <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
              最大文字数: {settings.notification_tts_max_length}文字
            </label>
            <input
              type="range"
              min="50"
              max="500"
              step="10"
              value={settings.notification_tts_max_length}
              onChange={(e) =>
                setSettings({ ...settings, notification_tts_max_length: parseInt(e.target.value) })
              }
              className="w-full"
              disabled={!settings.notification_tts_enabled}
            />
            <div className="mt-1 flex justify-between text-xs text-zinc-500">
              <span>50</span>
              <span>200</span>
              <span>350</span>
              <span>500</span>
            </div>
          </div>

          {/* タイトルを読み上げる */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-zinc-700 dark:text-zinc-300">タイトルを読み上げる</span>
            <button
              type="button"
              onClick={() =>
                setSettings({ ...settings, notification_tts_include_title: !settings.notification_tts_include_title })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.notification_tts_include_title ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
              disabled={!settings.notification_tts_enabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.notification_tts_include_title ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* 本文を読み上げる */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-700 dark:text-zinc-300">本文を読み上げる</span>
            <button
              type="button"
              onClick={() =>
                setSettings({ ...settings, notification_tts_include_body: !settings.notification_tts_include_body })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.notification_tts_include_body ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
              disabled={!settings.notification_tts_enabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.notification_tts_include_body ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
