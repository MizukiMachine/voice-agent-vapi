import { NextRequest, NextResponse } from 'next/server';
import { ErrorCodes, createErrorResponse } from '@/app/lib/errors';
import { logRequestError, createServiceLogger } from '@/app/lib/logger';
import { getSupabaseAdmin } from '@/app/lib/supabase';
import type { UserSettings } from '@/app/types';

const logger = createServiceLogger('settings-api');

/**
 * GET /api/cockpit/settings
 * Get user settings
 *
 * Query parameters:
 * - userId: User ID (required)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    // Validate userId
    if (!userId) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INVALID_REQUEST, 'userId is required'),
        { status: 400 }
      );
    }

    logger.info('Fetching user settings', { userId });

    // Fetch user profile with settings
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, name, location_cool_time, location_search_radius, notification_tts_enabled, notification_tts_max_length, notification_tts_include_title, notification_tts_include_body')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          createErrorResponse(ErrorCodes.USER_NOT_FOUND, 'User not found'),
          { status: 404 }
        );
      }
      throw error;
    }

    // Return settings
    const settings: UserSettings = {
      location_cool_time: data.location_cool_time ?? 1800000, // Default: 30 minutes
      location_search_radius: data.location_search_radius ?? 100, // Default: 100m
      notification_tts_enabled: data.notification_tts_enabled ?? true,
      notification_tts_max_length: data.notification_tts_max_length ?? 200,
      notification_tts_include_title: data.notification_tts_include_title ?? true,
      notification_tts_include_body: data.notification_tts_include_body ?? true,
    };

    logger.info('User settings retrieved', { userId, settings });

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    logRequestError('/api/cockpit/settings', 'GET', error instanceof Error ? error : { message: String(error) });
    return NextResponse.json(
      createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch settings'),
      { status: 500 }
    );
  }
}

/**
 * PUT /api/cockpit/settings
 * Update user settings
 *
 * Request body:
 * - userId: User ID (required)
 * - settings: UserSettings object (all fields optional)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, settings } = body as { userId?: string; settings?: Partial<UserSettings> };

    // Validate userId
    if (!userId) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INVALID_REQUEST, 'userId is required'),
        { status: 400 }
      );
    }

    // Validate settings object
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INVALID_REQUEST, 'settings object is required'),
        { status: 400 }
      );
    }

    logger.info('Updating user settings', { userId, settings });

    // Build update object with only provided settings
    const updateData: Record<string, unknown> = {};

    if (settings.location_cool_time !== undefined) {
      if (typeof settings.location_cool_time !== 'number' || settings.location_cool_time < 0) {
        return NextResponse.json(
          createErrorResponse(ErrorCodes.INVALID_REQUEST, 'location_cool_time must be a positive number'),
          { status: 400 }
        );
      }
      updateData.location_cool_time = settings.location_cool_time;
    }

    if (settings.location_search_radius !== undefined) {
      if (typeof settings.location_search_radius !== 'number' || settings.location_search_radius < 1) {
        return NextResponse.json(
          createErrorResponse(ErrorCodes.INVALID_REQUEST, 'location_search_radius must be a positive number'),
          { status: 400 }
        );
      }
      updateData.location_search_radius = settings.location_search_radius;
    }

    if (settings.notification_tts_enabled !== undefined) {
      if (typeof settings.notification_tts_enabled !== 'boolean') {
        return NextResponse.json(
          createErrorResponse(ErrorCodes.INVALID_REQUEST, 'notification_tts_enabled must be a boolean'),
          { status: 400 }
        );
      }
      updateData.notification_tts_enabled = settings.notification_tts_enabled;
    }

    if (settings.notification_tts_max_length !== undefined) {
      if (typeof settings.notification_tts_max_length !== 'number' || settings.notification_tts_max_length < 1) {
        return NextResponse.json(
          createErrorResponse(ErrorCodes.INVALID_REQUEST, 'notification_tts_max_length must be a positive number'),
          { status: 400 }
        );
      }
      updateData.notification_tts_max_length = settings.notification_tts_max_length;
    }

    if (settings.notification_tts_include_title !== undefined) {
      if (typeof settings.notification_tts_include_title !== 'boolean') {
        return NextResponse.json(
          createErrorResponse(ErrorCodes.INVALID_REQUEST, 'notification_tts_include_title must be a boolean'),
          { status: 400 }
        );
      }
      updateData.notification_tts_include_title = settings.notification_tts_include_title;
    }

    if (settings.notification_tts_include_body !== undefined) {
      if (typeof settings.notification_tts_include_body !== 'boolean') {
        return NextResponse.json(
          createErrorResponse(ErrorCodes.INVALID_REQUEST, 'notification_tts_include_body must be a boolean'),
          { status: 400 }
        );
      }
      updateData.notification_tts_include_body = settings.notification_tts_include_body;
    }

    // Update settings in database
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('id', userId)
      .select('id, name, location_cool_time, location_search_radius, notification_tts_enabled, notification_tts_max_length, notification_tts_include_title, notification_tts_include_body')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          createErrorResponse(ErrorCodes.USER_NOT_FOUND, 'User not found'),
          { status: 404 }
        );
      }
      throw error;
    }

    // Return updated settings
    const updatedSettings: UserSettings = {
      location_cool_time: data.location_cool_time ?? 1800000,
      location_search_radius: data.location_search_radius ?? 100,
      notification_tts_enabled: data.notification_tts_enabled ?? true,
      notification_tts_max_length: data.notification_tts_max_length ?? 200,
      notification_tts_include_title: data.notification_tts_include_title ?? true,
      notification_tts_include_body: data.notification_tts_include_body ?? true,
    };

    logger.info('User settings updated', { userId, settings: updatedSettings });

    return NextResponse.json({
      success: true,
      settings: updatedSettings,
    });
  } catch (error) {
    logRequestError('/api/cockpit/settings', 'PUT', error instanceof Error ? error : { message: String(error) });
    return NextResponse.json(
      createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to update settings'),
      { status: 500 }
    );
  }
}
