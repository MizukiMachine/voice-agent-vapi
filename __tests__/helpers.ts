/**
 * Test Helpers for Next.js App Router API Routes
 */
import { NextRequest } from 'next/server';

/**
 * Create a mock NextRequest for testing
 */
export function createMockRequest(
  method: string,
  body?: Record<string, unknown>,
  options?: {
    headers?: Record<string, string>;
    url?: string;
  }
): NextRequest {
  const url = options?.url || 'http://localhost:3000/api/test';
  const headers = new Headers(options?.headers || {});
  headers.set('Content-Type', 'application/json');

  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Parse response body as JSON
 */
export async function parseResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

/**
 * Assert error response structure
 */
export function assertErrorResponse(
  body: { error?: { code: string; message: string } },
  expectedCode: string
) {
  expect(body).toHaveProperty('error');
  expect(body.error).toHaveProperty('code', expectedCode);
  expect(body.error).toHaveProperty('message');
}

/**
 * Create a VAPI tool call request body
 */
export function createVapiToolRequest(
  toolCallId: string,
  functionName: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  return {
    message: {
      toolCallList: [
        {
          id: toolCallId,
          function: {
            name: functionName,
            arguments: args,
          },
        },
      ],
    },
  };
}

/**
 * Parse VAPI tool response
 */
export function parseVapiToolResponse(body: {
  results?: Array<{ toolCallId: string; result: string }>;
}): { toolCallId: string; result: unknown } | null {
  const result = body.results?.[0];
  if (!result) return null;
  return {
    toolCallId: result.toolCallId,
    result: JSON.parse(result.result),
  };
}
