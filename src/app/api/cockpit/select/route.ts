import { NextRequest, NextResponse } from 'next/server';
import { getUserProfile, isSupabaseConfigured } from '@/app/lib/supabase';
import { ErrorCodes, createErrorResponse } from '@/app/lib/errors';
import { isValidUUID } from '@/app/lib/validation';
import { logRequestError } from '@/app/lib/logger';

/**
 * POST /api/cockpit/select
 * Select a user for the current session
 * Returns user profile data for session initialization
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    // Validate request
    if (!userId || !isValidUUID(userId)) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INVALID_REQUEST, 'userId must be a valid UUID'),
        { status: 400 }
      );
    }

    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.SUPABASE_ERROR, 'Supabase is not configured'),
        { status: 500 }
      );
    }

    // Get user profile
    const profile = await getUserProfile(userId);

    if (!profile) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.USER_NOT_FOUND, 'User not found'),
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: profile.id,
        name: profile.name,
        hasVoiceProfile: !!profile.voice_profile_blob,
        createdAt: profile.created_at,
      },
    });
  } catch (error) {
    logRequestError('/api/cockpit/select', 'POST', error instanceof Error ? error : { message: String(error) });
    return NextResponse.json(
      createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to select user'),
      { status: 500 }
    );
  }
}
