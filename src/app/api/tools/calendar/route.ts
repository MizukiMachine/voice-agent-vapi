import { NextRequest, NextResponse } from 'next/server';
import {
  isGoogleConfigured,
  listCalendarEvents,
  createCalendarEvent,
  GoogleApiError,
} from '@/app/lib/google';
import { ErrorCodes, createErrorResponse } from '@/app/lib/errors';
import { logRequestError } from '@/app/lib/logger';

/**
 * VAPI Tool Request for calendar_action
 */
interface CalendarToolRequest {
  message: {
    toolCallList: Array<{
      id: string;
      function: {
        name: string;
        arguments: {
          action: 'list' | 'create';
          // For list action
          timeMin?: string;
          timeMax?: string;
          maxResults?: number;
          // For create action
          title?: string;
          description?: string;
          startTime?: string;
          endTime?: string;
          location?: string;
        };
      };
    }>;
  };
}

/**
 * POST /api/tools/calendar
 * VAPI Server Tool: Interact with Google Calendar
 */
export async function POST(request: NextRequest) {
  try {
    const body: CalendarToolRequest = await request.json();

    // Extract tool call from VAPI format
    const toolCall = body.message?.toolCallList?.[0];
    if (!toolCall) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INVALID_REQUEST, 'No tool call found'),
        { status: 400 }
      );
    }

    const args = toolCall.function.arguments;
    const { action } = args;

    // Check if Google is configured
    if (!isGoogleConfigured()) {
      return NextResponse.json({
        results: [{
          toolCallId: toolCall.id,
          result: JSON.stringify({
            success: false,
            error: 'Google Calendar is not configured',
          }),
        }],
      });
    }

    let result: unknown;

    switch (action) {
      case 'list': {
        const events = await listCalendarEvents(
          'primary',
          args.timeMin,
          args.timeMax,
          args.maxResults || 10
        );

        const formattedEvents = events.map((event) => ({
          id: event.id,
          title: event.summary,
          start: event.start.dateTime || event.start.date,
          end: event.end.dateTime || event.end.date,
          location: event.location,
        }));

        result = {
          success: true,
          events: formattedEvents,
          count: formattedEvents.length,
        };
        break;
      }

      case 'create': {
        if (!args.title || !args.startTime || !args.endTime) {
          result = {
            success: false,
            error: 'title, startTime, and endTime are required for creating an event',
          };
          break;
        }

        const newEvent = await createCalendarEvent({
          summary: args.title,
          description: args.description,
          start: {
            dateTime: args.startTime,
            timeZone: 'Asia/Tokyo',
          },
          end: {
            dateTime: args.endTime,
            timeZone: 'Asia/Tokyo',
          },
          location: args.location,
        });

        result = {
          success: true,
          message: '予定を作成しました',
          eventId: newEvent.id,
          title: newEvent.summary,
        };
        break;
      }

      default:
        result = {
          success: false,
          error: `Unknown action: ${action}. Valid actions are: list, create`,
        };
    }

    return NextResponse.json({
      results: [{
        toolCallId: toolCall.id,
        result: JSON.stringify(result),
      }],
    });
  } catch (error) {
    logRequestError('/api/tools/calendar', 'POST', error instanceof Error ? error : { message: String(error) });

    if (error instanceof GoogleApiError) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INTERNAL_ERROR, error.message),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to execute calendar action'),
      { status: 500 }
    );
  }
}
