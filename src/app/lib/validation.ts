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
