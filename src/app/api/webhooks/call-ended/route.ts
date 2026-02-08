/**
 * Call-Ended Webhook Endpoint
 *
 * This endpoint receives webhook notifications when a voice call ends.
 * It integrates with the memory system to extract and store facts
 * from the conversation.
 *
 * Expected payload:
 * {
 *   callId: string;
 *   userId?: string;
 *   duration?: number;
 *   transcript?: string;
 * }
 */

import { NextRequest } from 'next/server';
import { createServiceLogger } from '@/app/lib/logger';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/app/lib/supabase';
import type { ApiErrorResponse } from '@/app/types';

const logger = createServiceLogger('call-ended-webhook');

// Ensure webhook endpoint can use edge runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Handle POST requests from Vapi call-ended webhooks
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    logger.info('Call ended webhook received', { callId: body.callId });

    // Validate required fields
    if (!body.callId) {
      const errorResponse: ApiErrorResponse = {
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing required field: callId',
        },
      };
      return Response.json(errorResponse, { status: 400 });
    }

    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
      logger.warn('Supabase not configured, skipping fact extraction');
      return Response.json({ success: true, message: 'Webhook received (Supabase not configured)' });
    }

    // Extract facts from the call
    // TODO: Implement AI-powered fact extraction
    // For now, we'll log the call end event
    logger.info('Call ended', {
      callId: body.callId,
      userId: body.userId,
      duration: body.duration,
    });

    // If transcript is provided, extract facts using AI
    if (body.transcript && body.userId) {
      logger.info('Transcript received for fact extraction', {
        callId: body.callId,
        transcriptLength: body.transcript.length,
      });

      // TODO: Implement fact extraction using OpenAI or similar
      // This would involve:
      // 1. Sending the transcript to an LLM
      // 2. Extracting facts/memories from the conversation
      // 3. Storing them in user_memory_slots
    }

    // Update call history in Supabase (optional)
    // This would be useful for analytics and debugging
    if (body.userId) {
      const supabase = getSupabaseAdmin();
      const { error: insertError } = await supabase
        .from('call_history')
        .insert({
          call_id: body.callId,
          user_id: body.userId,
          duration: body.duration || 0,
          ended_at: new Date().toISOString(),
        });

      if (insertError) {
        logger.error('Failed to insert call history', insertError);
        // Don't fail the webhook for call history errors
      }
    }

    return Response.json({
      success: true,
      message: 'Call ended webhook processed',
    });

  } catch (error) {
    logger.error('Call ended webhook error', error instanceof Error ? error : { message: String(error) });

    const errorResponse: ApiErrorResponse = {
      error: {
        code: 'WEBHOOK_ERROR',
        message: 'Failed to process call ended webhook',
      },
    };

    return Response.json(errorResponse, { status: 500 });
  }
}

/**
 * Handle GET requests (for webhook verification)
 */
export async function GET() {
  return Response.json({
    endpoint: 'call-ended-webhook',
    status: 'active',
  });
}
