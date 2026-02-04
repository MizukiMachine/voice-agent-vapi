/**
 * Voice Engine Studio - Type Definitions
 */

// User Profile
export interface UserProfile {
  id: string;
  name: string;
  voiceProfileBlob?: string;
  createdAt: Date;
}

// User Memory (Fact)
export interface UserMemory {
  id: string;
  userId: string;
  fact: string;
  source?: string;
  createdAt: Date;
}

// Session
export interface SessionRequest {
  userId: string;
}

export interface SessionResponse {
  token: string;
  assistantId: string;
  systemPrompt: string;
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
