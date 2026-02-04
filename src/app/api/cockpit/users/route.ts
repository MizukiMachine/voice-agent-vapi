import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured, UserProfile } from '@/app/lib/supabase';
import { ErrorCodes, createErrorResponse } from '@/app/lib/errors';
import { logError, logRequestError } from '@/app/lib/logger';

/**
 * GET /api/cockpit/users
 * List all registered users
 */
export async function GET() {
  try {
    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.SUPABASE_ERROR, 'Supabase is not configured'),
        { status: 500 }
      );
    }

    const client = getSupabaseAdmin();
    const { data, error } = await client
      .from('user_profiles')
      .select('id, name, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      logError('Users fetch error', error as Error, { service: 'cockpit' });
      return NextResponse.json(
        createErrorResponse(ErrorCodes.SUPABASE_ERROR, 'Failed to fetch users'),
        { status: 500 }
      );
    }

    const users = (data || []).map((user: Partial<UserProfile>) => ({
      id: user.id,
      name: user.name,
      createdAt: user.created_at,
    }));

    return NextResponse.json({
      users,
      count: users.length,
    });
  } catch (error) {
    logRequestError('/api/cockpit/users', 'GET', error instanceof Error ? error : { message: String(error) });
    return NextResponse.json(
      createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to list users'),
      { status: 500 }
    );
  }
}
