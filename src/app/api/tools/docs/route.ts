import { NextRequest, NextResponse } from 'next/server';
import {
  isGoogleConfigured,
  createGoogleDoc,
  appendToGoogleDoc,
  getGoogleDoc,
  GoogleApiError,
} from '@/app/lib/google';
import { ErrorCodes, createErrorResponse } from '@/app/lib/errors';
import { logRequestError } from '@/app/lib/logger';

/**
 * VAPI Tool Request for docs_action
 */
interface DocsToolRequest {
  message: {
    toolCallList: Array<{
      id: string;
      function: {
        name: string;
        arguments: {
          action: 'create' | 'append' | 'get';
          // For create action
          title?: string;
          content?: string;
          // For append/get actions
          documentId?: string;
        };
      };
    }>;
  };
}

/**
 * POST /api/tools/docs
 * VAPI Server Tool: Interact with Google Docs
 */
export async function POST(request: NextRequest) {
  try {
    const body: DocsToolRequest = await request.json();

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
            error: 'Google Docs is not configured',
          }),
        }],
      });
    }

    let result: unknown;

    switch (action) {
      case 'create': {
        if (!args.title) {
          result = {
            success: false,
            error: 'title is required for creating a document',
          };
          break;
        }

        const doc = await createGoogleDoc(args.title);

        // If initial content is provided, append it
        if (args.content) {
          await appendToGoogleDoc(doc.documentId, args.content);
        }

        result = {
          success: true,
          message: 'ドキュメントを作成しました',
          documentId: doc.documentId,
          title: doc.title,
          url: `https://docs.google.com/document/d/${doc.documentId}/edit`,
        };
        break;
      }

      case 'append': {
        if (!args.documentId || !args.content) {
          result = {
            success: false,
            error: 'documentId and content are required for appending',
          };
          break;
        }

        await appendToGoogleDoc(args.documentId, args.content);

        result = {
          success: true,
          message: 'ドキュメントに追記しました',
          documentId: args.documentId,
        };
        break;
      }

      case 'get': {
        if (!args.documentId) {
          result = {
            success: false,
            error: 'documentId is required for getting a document',
          };
          break;
        }

        const doc = await getGoogleDoc(args.documentId);

        result = {
          success: true,
          documentId: doc.documentId,
          title: doc.title,
          url: `https://docs.google.com/document/d/${doc.documentId}/edit`,
        };
        break;
      }

      default:
        result = {
          success: false,
          error: `Unknown action: ${action}. Valid actions are: create, append, get`,
        };
    }

    return NextResponse.json({
      results: [{
        toolCallId: toolCall.id,
        result: JSON.stringify(result),
      }],
    });
  } catch (error) {
    logRequestError('/api/tools/docs', 'POST', error instanceof Error ? error : { message: String(error) });

    if (error instanceof GoogleApiError) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INTERNAL_ERROR, error.message),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to execute docs action'),
      { status: 500 }
    );
  }
}
