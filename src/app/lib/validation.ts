/**
 * Validation Utilities
 * Common validation functions for API routes
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate UUID format
 */
export function isValidUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Validate non-empty string with length constraints
 */
export function isValidString(
  value: unknown,
  minLength = 1,
  maxLength = 1000
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length >= minLength &&
    value.trim().length <= maxLength
  );
}

/**
 * Validate latitude (-90 to 90)
 */
export function isValidLatitude(value: unknown): value is number {
  return typeof value === 'number' && value >= -90 && value <= 90;
}

/**
 * Validate longitude (-180 to 180)
 */
export function isValidLongitude(value: unknown): value is number {
  return typeof value === 'number' && value >= -180 && value <= 180;
}

/**
 * Validate coordinates
 */
export function isValidCoordinates(
  latitude: unknown,
  longitude: unknown
): { valid: true; lat: number; lng: number } | { valid: false; error: string } {
  if (!isValidLatitude(latitude)) {
    return { valid: false, error: 'latitude must be a number between -90 and 90' };
  }
  if (!isValidLongitude(longitude)) {
    return { valid: false, error: 'longitude must be a number between -180 and 180' };
  }
  return { valid: true, lat: latitude, lng: longitude };
}

/**
 * Safe JSON parse with error handling
 */
export async function safeParseJson<T>(
  request: Request
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await request.json();
    return { success: true, data: data as T };
  } catch {
    return { success: false, error: 'Invalid JSON body' };
  }
}

/**
 * Validate Content-Type header
 */
export function isJsonContentType(request: Request): boolean {
  const contentType = request.headers.get('content-type');
  return contentType?.includes('application/json') ?? false;
}

// ============================================================
// Vapi + Cartesia Validation
// ============================================================

/**
 * Validate slot number (1-10)
 */
export function isValidSlotNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10;
}

/**
 * Validate TTS speed (0.5 - 2.0)
 */
export function isValidTTSSpeed(value: unknown): value is number {
  return typeof value === 'number' && value >= 0.5 && value <= 2.0;
}

/**
 * Validate cool time (milliseconds, positive)
 */
export function isValidCoolTime(value: unknown): value is number {
  return typeof value === 'number' && value >= 0;
}

/**
 * Validate search radius (meters, positive)
 */
export function isValidSearchRadius(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && value <= 10000;
}

/**
 * Validate Base64 string
 */
export function isValidBase64(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Regex.test(value);
  } catch {
    return false;
  }
}

/**
 * Validate voice ID format (Cartesia voice IDs)
 */
export function isValidVoiceId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  // Cartesia voice IDs are typically UUID-like or specific format
  return value.length >= 1 && value.length <= 100;
}

/**
 * Validate API key format (basic check)
 */
export function isValidApiKey(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  // Basic check for API key format (sk-, pk-, etc.)
  return value.length >= 10;
}

/**
 * Validate session config
 */
export interface SessionConfigValidation {
  valid: boolean;
  errors: string[];
}

export function validateSessionConfig(config: {
  voiceId?: string;
  speed?: number;
}): SessionConfigValidation {
  const errors: string[] = [];

  if (config.voiceId !== undefined && !isValidVoiceId(config.voiceId)) {
    errors.push('voiceId must be a valid Cartesia voice ID');
  }

  if (config.speed !== undefined && !isValidTTSSpeed(config.speed)) {
    errors.push('speed must be between 0.5 and 2.0');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate WebRTC SDP offer/answer
 */
export function isValidSDP(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  // Basic SDP validation - should contain key SDP attributes
  return value.includes('v=') && value.includes('s=') && (value.includes('m=audio') || value.includes('m=video'));
}
