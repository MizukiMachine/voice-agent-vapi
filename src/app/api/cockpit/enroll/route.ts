import { NextRequest, NextResponse } from 'next/server';
import { createUserProfile, isSupabaseConfigured } from '@/app/lib/supabase';
import { ErrorCodes, createErrorResponse } from '@/app/lib/errors';
import { isValidString } from '@/app/lib/validation';
import { logRequestError } from '@/app/lib/logger';

/**
 * POST /api/cockpit/enroll
 * Create a new user profile
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, voiceProfileBlob } = body;

    if (!isValidString(name, 1, 100)) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INVALID_REQUEST, 'name must be 1-100 characters'),
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.SUPABASE_ERROR, 'Supabase is not configured'),
        { status: 500 }
      );
    }

    const profile = await createUserProfile(name, voiceProfileBlob);

    return NextResponse.json({
      success: true,
      userId: profile.id,
    });
  } catch (error) {
    logRequestError('/api/cockpit/enroll', 'POST', error instanceof Error ? error : { message: String(error) });
    return NextResponse.json(
      createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create user'),
      { status: 500 }
    );
  }
}
