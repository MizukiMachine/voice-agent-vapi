'use client';

import { useState, useCallback } from 'react';
import CockpitPanel from '@/app/components/cockpit/CockpitPanel';
import VoiceInterface from '@/app/components/voice/VoiceInterface';
import SimulatorPanel from '@/app/components/simulator/SimulatorPanel';
import ConversationLog from '@/app/components/log/ConversationLog';
import { User, Message } from '@/app/types';

export default function Home() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const handleUserSelect = useCallback((user: User) => {
    setSelectedUser(user);
  }, []);

  const handleSessionStart = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  const handleSessionEnd = useCallback(() => {
    setSessionId(null);
  }, []);

  const handleMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Voice Engine Studio
            </h1>
            <p className="text-sm text-zinc-500">Debug Console</p>
          </div>
          <div className="flex items-center gap-4">
            {selectedUser && (
              <div className="text-right">
                <div className="text-sm text-zinc-500">Active User</div>
                <div className="font-medium text-zinc-900 dark:text-zinc-100">
                  {selectedUser.name}
                </div>
              </div>
            )}
            {sessionId && (
              <div className="rounded bg-green-100 px-3 py-1 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-400">
                Session Active
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl p-6">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column - Controls */}
          <div className="space-y-6 lg:col-span-4">
            <CockpitPanel
              onUserSelect={handleUserSelect}
              selectedUserId={selectedUser?.id || null}
            />
            <VoiceInterface
              user={selectedUser}
              onSessionStart={handleSessionStart}
              onSessionEnd={handleSessionEnd}
              onMessage={handleMessage}
            />
            <SimulatorPanel
              sessionId={sessionId}
              disabled={!sessionId}
            />
          </div>

          {/* Right Column - Conversation Log */}
          <div className="lg:col-span-8">
            <div className="h-[calc(100vh-12rem)]">
              <ConversationLog
                messages={messages}
                isActive={!!sessionId}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl text-center text-sm text-zinc-500">
          Voice Engine PoC - API Verification &amp; Backend Logic Testing
        </div>
      </footer>
    </div>
  );
}
