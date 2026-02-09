import { NextRequest, NextResponse } from 'next/server';
import { ErrorCodes, createErrorResponse } from '@/app/lib/errors';
import { logRequestError, createServiceLogger } from '@/app/lib/logger';
import { getSupabaseAdmin } from '@/app/lib/supabase';
import { loadCartesiaConfig } from '@/app/lib/config';
import { createCartesiaClient } from '@/app/lib/cartesia-client';

const logger = createServiceLogger('notification-api');

/**
 * Notification types for simulation
 */
type NotificationType = 'message' | 'calendar' | 'reminder' | 'alert' | 'custom';

/**
 * Notification simulator request
 */
interface NotificationSimulatorRequest {
  sessionId?: string;
  userId?: string;
  type?: NotificationType;
  title?: string;
  content: string;
  appName?: string;
}

/**
 * Get user notification TTS settings
 */
async function getUserNotificationSettings(userId: string) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('user_profiles')
    .select('notification_tts_enabled, notification_tts_max_length, notification_tts_include_title, notification_tts_include_body')
    .eq('id', userId)
    .single();

  if (error || !data) {
    // Return defaults
    return {
      enabled: true,
      maxLength: 200,
      includeTitle: true,
      includeBody: true,
    };
  }

  return {
    enabled: data.notification_tts_enabled ?? true,
    maxLength: data.notification_tts_max_length ?? 200,
    includeTitle: data.notification_tts_include_title ?? true,
    includeBody: data.notification_tts_include_body ?? true,
  };
}

/**
 * Clean text for TTS (remove emojis, excessive whitespace, etc.)
 */
function cleanTextForTTS(text: string): string {
  return text
    // Remove emojis (basic Unicode ranges)
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // symbols & pictographs
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // transport & map symbols
    .replace(/[\u{2600}-\u{26FF}]/gu, '')   // misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')   // dingbats
    // Remove URLs
    .replace(/https?:\/\/\S+/g, '')
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncate text to max length while preserving word boundaries
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.8) {
    // If there's a space near the end, truncate there
    return truncated.substring(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Build TTS message from notification data
 */
function buildTTSMessage(
  appName: string,
  title: string | undefined,
  content: string,
  settings: {
    includeTitle: boolean;
    includeBody: boolean;
  }
): string {
  const parts: string[] = [];

  if (appName) {
    parts.push(`${appName}から通知です。`);
  }

  if (title && settings.includeTitle) {
    parts.push(`${title}。`);
  }

  if (settings.includeBody) {
    parts.push(content);
  }

  return parts.join(' ');
}

/**
 * Generate TTS audio using Cartesia
 */
async function generateNotificationTTS(text: string): Promise<string | null> {
  try {
    const cartesiaConfig = loadCartesiaConfig();

    const cartesiaClient = createCartesiaClient({
      apiKey: cartesiaConfig.apiKey,
      voiceId: cartesiaConfig.voiceId,
      speed: 1.0, // Use default speed for notifications
      sampleRate: 24000,
      outputFormat: 'pcm16',
    });

    // Connect and synthesize
    await cartesiaClient.connect();

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cartesiaClient.disconnect();
        reject(new Error('TTS generation timeout'));
      }, 10000);

      let audioData = Buffer.alloc(0);

      cartesiaClient.onAudio((audio, isFinal) => {
        audioData = Buffer.concat([audioData, audio]);
        if (isFinal) {
          clearTimeout(timeout);
          cartesiaClient.disconnect();
          resolve(audioData.toString('base64'));
        }
      });

      cartesiaClient.onError((error) => {
        clearTimeout(timeout);
        cartesiaClient.disconnect();
        reject(new Error(`TTS error: ${error}`));
      });

      cartesiaClient.synthesize(text);
    });
  } catch (error) {
    logger.error('Failed to generate TTS', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * POST /api/simulate/notification
 * Simulate a notification with TTS generation
 * Enhanced with user settings and Cartesia TTS integration
 */
export async function POST(request: NextRequest) {
  try {
    const body: NotificationSimulatorRequest = await request.json();
    const { sessionId, userId, type, title, content, appName } = body;

    // Validate request
    if (!content) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INVALID_REQUEST, 'content is required'),
        { status: 400 }
      );
    }

    // Get user settings if userId provided
    const settings = userId ? await getUserNotificationSettings(userId) : {
      enabled: true,
      maxLength: 200,
      includeTitle: true,
      includeBody: true,
    };

    // Check if TTS is enabled
    if (!settings.enabled) {
      logger.info('Notification TTS disabled for user', { userId });
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Notification TTS is disabled',
        notification: {
          type: type || 'custom',
          title,
          content,
          appName,
        },
      });
    }

    // Build notification message based on type
    const notificationType: NotificationType = type || 'custom';
    let messageType = '';

    switch (notificationType) {
      case 'message':
        messageType = '新しいメッセージです。';
        break;
      case 'calendar':
        messageType = 'カレンダーのリマインダーです。';
        break;
      case 'reminder':
        messageType = 'リマインダーです。';
        break;
      case 'alert':
        messageType = '重要な通知です。';
        break;
      default:
        messageType = '';
    }

    // Build TTS message
    const appPrefix = appName ? `${appName}から通知です。` : '';
    const titlePart = title && settings.includeTitle ? `${title}。` : '';
    const bodyPart = settings.includeBody ? content : '';

    let ttsText = `${appPrefix}${messageType}${titlePart}${bodyPart}`;
    ttsText = cleanTextForTTS(ttsText);
    ttsText = truncateText(ttsText, settings.maxLength);

    logger.info('Generating notification TTS', {
      userId,
      type: notificationType,
      textLength: ttsText.length,
      maxLength: settings.maxLength,
    });

    // Generate TTS audio
    const ttsAudio = await generateNotificationTTS(ttsText);

    return NextResponse.json({
      success: true,
      skipped: false,
      notification: {
        type: notificationType,
        title,
        content,
        appName,
      },
      tts: {
        text: ttsText,
        audio: ttsAudio,
      },
    });
  } catch (error) {
    logRequestError('/api/simulate/notification', 'POST', error instanceof Error ? error : { message: String(error) });

    return NextResponse.json(
      createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to simulate notification'),
      { status: 500 }
    );
  }
}
