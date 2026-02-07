/**
 * Custom API Error class for consistent error handling
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Common error codes
 */
export const ErrorCodes = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  SUPABASE_ERROR: 'SUPABASE_ERROR',
  GOOGLE_API_ERROR: 'GOOGLE_API_ERROR',
  OPENAI_ERROR: 'OPENAI_ERROR',
  VAPI_ERROR: 'VAPI_ERROR',
  CARTESIA_ERROR: 'CARTESIA_ERROR',
  WEBRTC_ERROR: 'WEBRTC_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/**
 * Create error response object
 */
export function createErrorResponse(code: string, message: string) {
  return {
    error: {
      code,
      message,
    },
  };
}
