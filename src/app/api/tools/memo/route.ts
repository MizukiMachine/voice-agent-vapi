/**
 * POST /api/tools/memo
 * VAPI Server Tool: Save/update a memory slot (REQUIREMENTS_v3)
 *
 * Request: { userId, slotNumber: 1-10, content: string(max 200) }
 * - If slotNumber is provided: update that specific slot
 * - If slotNumber is omitted: find first empty slot (1-10) and use it
 * - If content is empty string: clear the slot
 */

import { NextRequest, NextResponse } from 'next/server';
import { upsertMemorySlot, getUserMemorySlots, isSupabaseConfigured, UserMemorySlot } from '@/app/lib/supabase';
import { ErrorCodes, createErrorResponse } from '@/app/lib/errors';
import { logRequestError } from '@/app/lib/logger';

/**
 * VAPI Tool Request for memo_action
 */
interface MemoToolRequest {
  message: {
    toolCallList: Array<{
      id: string;
      function: {
        name: string;
        arguments: {
          content: string;
          slotNumber?: number;
          userId?: string;
        };
      };
    }>;
    call?: {
      metadata?: {
        userId?: string;
      };
    };
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: MemoToolRequest = await request.json();

    // Extract tool call from VAPI format
    const toolCall = body.message?.toolCallList?.[0];
    if (!toolCall) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INVALID_REQUEST, 'No tool call found'),
        { status: 400 }
      );
    }

    const { content, slotNumber } = toolCall.function.arguments;
    const userId = toolCall.function.arguments.userId || body.message?.call?.metadata?.userId;

    // Validate required fields
    if (!userId) {
      return NextResponse.json({
        results: [{
          toolCallId: toolCall.id,
          result: JSON.stringify({ success: false, error: 'userId is required' }),
        }],
      });
    }

    if (!content && content !== '') {
      return NextResponse.json({
        results: [{
          toolCallId: toolCall.id,
          result: JSON.stringify({ success: false, error: 'content is required' }),
        }],
      });
    }

    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.SUPABASE_ERROR, 'Supabase is not configured'),
        { status: 500 }
      );
    }

    // Determine target slot
    let targetSlot = slotNumber;
    let resultMessage = '';
    let resultAction = '';

    // If slotNumber specified, validate it
    if (targetSlot !== undefined) {
      if (targetSlot < 1 || targetSlot > 10) {
        return NextResponse.json({
          results: [{
            toolCallId: toolCall.id,
            result: JSON.stringify({ success: false, error: 'slotNumber must be between 1 and 10' }),
          }],
        });
      }
      resultAction = `スロット${targetSlot}を${content === '' ? 'クリア' : '更新'}しました`;
    } else {
      // Find first empty slot if slotNumber not specified
      const slots = await getUserMemorySlots(userId);
      const emptySlot = slots.find((s) => s.content.trim() === '');

      if (emptySlot) {
        targetSlot = emptySlot.slot_number;
        resultAction = `スロット${targetSlot}に保存しました`;
      } else {
        // All slots full, use slot 1 (overwrite)
        targetSlot = 1;
        resultAction = `全スロットが埋まっているため、スロット1を上書きしました`;
      }
    }

    // Validate content length
    if (content.length > 200) {
      return NextResponse.json({
        results: [{
          toolCallId: toolCall.id,
          result: JSON.stringify({ success: false, error: 'content must be 200 characters or less' }),
        }],
      });
    }

    // Upsert the memory slot
    const updatedSlot = await upsertMemorySlot(userId, targetSlot, content);

    // Build result message
    if (content === '') {
      resultMessage = `スロット${targetSlot}をクリアしました`;
    } else {
      resultMessage = resultAction;
    }

    // Return VAPI tool response format
    return NextResponse.json({
      results: [{
        toolCallId: toolCall.id,
        result: JSON.stringify({
          success: true,
          message: resultMessage,
          slotNumber: targetSlot,
          content: content,
          updatedAt: updatedSlot.updated_at,
        }),
      }],
    });
  } catch (error) {
    logRequestError('/api/tools/memo', 'POST', error instanceof Error ? error : { message: String(error) });
    return NextResponse.json(
      createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to save memo'),
      { status: 500 }
    );
  }
}
