import { NextRequest, NextResponse } from 'next/server';
import { ErrorCodes, createErrorResponse } from '@/app/lib/errors';
import { isValidCoordinates } from '@/app/lib/validation';
import { logRequestError } from '@/app/lib/logger';

/**
 * POST /api/simulate/location
 * Simulate a location update and store context for active session
 *
 * TODO: Phase 3 - Inject location context into OpenAI Realtime session via data channel
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, latitude, longitude, placeName } = body;

    // Validate request
    if (!sessionId) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INVALID_REQUEST, 'sessionId is required'),
        { status: 400 }
      );
    }

    const coordsValidation = isValidCoordinates(latitude, longitude);
    if (!coordsValidation.valid) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INVALID_REQUEST, coordsValidation.error),
        { status: 400 }
      );
    }

    // Build location context message
    let message = `[システム通知] ユーザーの現在地が更新されました。`;
    if (placeName) {
      message += `\n場所: ${placeName}`;
    }
    message += `\n座標: 緯度 ${latitude}, 経度 ${longitude}`;
    message += `\nこの情報を会話に自然に活用してください。`;

    // TODO: Phase 3 - Send context to active OpenAI Realtime session
    // For now, return the constructed message for debugging
    return NextResponse.json({
      success: true,
      message: 'Location context prepared',
      location: {
        latitude,
        longitude,
        placeName,
      },
      contextMessage: message,
    });
  } catch (error) {
    logRequestError('/api/simulate/location', 'POST', error instanceof Error ? error : { message: String(error) });

    return NextResponse.json(
      createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to simulate location'),
      { status: 500 }
    );
  }
}
