/**
 * Shared types for Voice Engine Studio
 */

export interface User {
  id: string;
  name: string;
  hasVoiceProfile: boolean;
  createdAt: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface SessionState {
  isActive: boolean;
  sessionId: string | null;
  userId: string | null;
  userName: string | null;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  placeName?: string;
}

export interface NotificationData {
  type: 'message' | 'calendar' | 'reminder' | 'alert' | 'custom';
  title?: string;
  content: string;
  appName?: string;
}
