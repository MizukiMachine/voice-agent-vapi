'use client';

import { useEffect, useRef } from 'react';
import { Message } from '@/app/types';

interface ConversationLogProps {
  messages: Message[];
  isActive: boolean;
}

export default function ConversationLog({ messages, isActive }: ConversationLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Conversation
        </h2>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              isActive ? 'bg-green-500 animate-pulse' : 'bg-zinc-400'
            }`}
          />
          <span className="text-sm text-zinc-500">
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-500">
            <p>No messages yet. Start a session to begin.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : message.role === 'system'
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                      : 'bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100'
                  }`}
                >
                  {message.role === 'system' && (
                    <div className="mb-1 text-xs font-medium uppercase">System</div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <div
                    className={`mt-1 text-xs ${
                      message.role === 'user'
                        ? 'text-blue-200'
                        : 'text-zinc-500'
                    }`}
                  >
                    {formatTime(message.timestamp)}
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
