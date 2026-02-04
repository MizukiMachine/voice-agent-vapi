import { NextRequest, NextResponse } from 'next/server';
import { ErrorCodes, createErrorResponse } from '@/app/lib/errors';
import { logRequestError } from '@/app/lib/logger';

/**
 * Notification types for simulation
 */
type NotificationType = 'message' | 'calendar' | 'reminder' | 'alert' | 'custom';

/**
 * POST /api/simulate/notification
 * Simulate a notification and store context for active session
 *
 * TODO: Phase 3 - Inject notification context into OpenAI Realtime session via data channel
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, type, title, content, appName } = body;

    // Validate request
    if (!sessionId) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INVALID_REQUEST, 'sessionId is required'),
        { status: 400 }
      );
    }

    if (!content) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INVALID_REQUEST, 'content is required'),
        { status: 400 }
      );
    }

    // Build notification message based on type
    const notificationType: NotificationType = type || 'custom';
    let message = `[システム通知] `;

    switch (notificationType) {
      case 'message':
        message += `新しいメッセージが届きました。`;
        if (appName) message += `\nアプリ: ${appName}`;
        if (title) message += `\n送信者: ${title}`;
        message += `\n内容: ${content}`;
        break;

      case 'calendar':
        message += `カレンダーのリマインダーです。`;
        if (title) message += `\n予定: ${title}`;
        message += `\n詳細: ${content}`;
        break;

      case 'reminder':
        message += `リマインダーです。`;
        if (title) message += `\nタイトル: ${title}`;
        message += `\n内容: ${content}`;
        break;

      case 'alert':
        message += `重要な通知です。`;
        if (title) message += `\nタイトル: ${title}`;
        message += `\n内容: ${content}`;
        break;

      default:
        if (title) message += `${title}: `;
        message += content;
    }

    message += `\nユーザーにこの通知を自然に伝えてください。`;

    // TODO: Phase 3 - Send context to active OpenAI Realtime session
    // For now, return the constructed message for debugging
    return NextResponse.json({
      success: true,
      message: 'Notification context prepared',
      notification: {
        type: notificationType,
        title,
        content,
        appName,
      },
      contextMessage: message,
    });
  } catch (error) {
    logRequestError('/api/simulate/notification', 'POST', error instanceof Error ? error : { message: String(error) });

    return NextResponse.json(
      createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to simulate notification'),
      { status: 500 }
    );
  }
}
