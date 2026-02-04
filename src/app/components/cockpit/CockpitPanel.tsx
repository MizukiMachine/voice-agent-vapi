'use client';

import { useState, useEffect, useCallback } from 'react';
import { User } from '@/app/types';

interface CockpitPanelProps {
  onUserSelect: (user: User) => void;
  selectedUserId: string | null;
}

export default function CockpitPanel({ onUserSelect, selectedUserId }: CockpitPanelProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/cockpit/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data.users || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Auto-create default test user if no users exist
  const createDefaultUser = async () => {
    try {
      const res = await fetch('/api/cockpit/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test User' }),
      });
      if (res.ok) {
        await fetchUsers();
      }
    } catch (err) {
      console.error('Failed to create default user:', err);
    }
  };

  // Create default user when component mounts and no users exist
  useEffect(() => {
    if (!loading && users.length === 0) {
      createDefaultUser();
    }
  }, [loading, users.length]);

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim()) return;

    try {
      setEnrolling(true);
      const res = await fetch('/api/cockpit/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newUserName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to create user');
      }

      setNewUserName('');
      setShowEnrollForm(false);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setEnrolling(false);
    }
  };

  const handleSelectUser = async (userId: string) => {
    try {
      const res = await fetch('/api/cockpit/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) throw new Error('Failed to select user');
      const data = await res.json();
      onUserSelect(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Cockpit
        </h2>
        <button
          onClick={() => setShowEnrollForm(!showEnrollForm)}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
        >
          {showEnrollForm ? 'Cancel' : '+ New User'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded bg-red-100 p-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {showEnrollForm && (
        <form onSubmit={handleEnroll} className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="Enter name"
              className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              maxLength={100}
            />
            <button
              type="submit"
              disabled={enrolling || !newUserName.trim()}
              className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
            >
              {enrolling ? '...' : 'Register'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-4 text-center text-zinc-500">Loading...</div>
      ) : users.length === 0 ? (
        <div className="py-4 text-center text-zinc-500">No users registered</div>
      ) : (
        <ul className="space-y-2">
          {users.map((user) => (
            <li key={user.id}>
              <button
                onClick={() => handleSelectUser(user.id)}
                className={`w-full rounded p-3 text-left transition ${
                  selectedUserId === user.id
                    ? 'bg-blue-100 dark:bg-blue-900/30'
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <div className="font-medium text-zinc-900 dark:text-zinc-100">
                  {user.name}
                </div>
                <div className="text-xs text-zinc-500">
                  {user.hasVoiceProfile ? 'Voice enrolled' : 'No voice profile'}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
