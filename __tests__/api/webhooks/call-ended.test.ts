/**
 * Tests for POST /api/webhooks/call-ended
 */
import { POST } from '@/app/api/webhooks/call-ended/route';
import { createMockRequest, parseResponse, assertErrorResponse } from '../../helpers';

// Mock fetch for Edge Function calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('POST /api/webhooks/call-ended', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: Edge Function returns success
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, factsExtracted: 2, facts: ['Fact 1', 'Fact 2'] }),
    });
  });

  describe('Success cases', () => {
    it('should process call-ended webhook and extract facts', async () => {
      const payload = {
        type: 'call-ended',
        call: {
          id: 'call-123',
          status: 'ended',
          transcript: 'User: 私はコーヒーが好きです。\nAssistant: コーヒーがお好きなんですね。',
          metadata: {
            userId: '550e8400-e29b-41d4-a716-446655440000',
            userName: 'テストユーザー',
          },
        },
      };

      const request = createMockRequest('POST', payload);
      const response = await POST(request);
      const body = await parseResponse<{ success: boolean; callId: string; factsExtracted: number }>(response);

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.callId).toBe('call-123');
      expect(body.factsExtracted).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should build transcript from messages if transcript is not provided', async () => {
      const payload = {
        type: 'call-ended',
        call: {
          id: 'call-123',
          status: 'ended',
          messages: [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: 'こんにちは' },
            { role: 'assistant', content: 'こんにちは！' },
          ],
          metadata: {
            userId: '550e8400-e29b-41d4-a716-446655440000',
          },
        },
      };

      const request = createMockRequest('POST', payload);
      const response = await POST(request);

      expect(response.status).toBe(200);
      // Verify fetch was called with built transcript (excluding system messages)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('User: こんにちは'),
        })
      );
    });

    it('should skip when transcript is empty', async () => {
      const payload = {
        type: 'call-ended',
        call: {
          id: 'call-123',
          status: 'ended',
          transcript: '',
          metadata: {
            userId: '550e8400-e29b-41d4-a716-446655440000',
          },
        },
      };

      const request = createMockRequest('POST', payload);
      const response = await POST(request);
      const body = await parseResponse<{ success: boolean; message: string }>(response);

      expect(response.status).toBe(200);
      expect(body.message).toContain('empty transcript');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Non-call-ended events', () => {
    it('should ignore events that are not call-ended', async () => {
      const payload = {
        type: 'call-started',
        call: {
          id: 'call-123',
          status: 'started',
        },
      };

      const request = createMockRequest('POST', payload);
      const response = await POST(request);
      const body = await parseResponse<{ success: boolean; message: string }>(response);

      expect(response.status).toBe(200);
      expect(body.message).toContain('not a call-ended event');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Missing metadata', () => {
    it('should skip when userId is not in metadata', async () => {
      const payload = {
        type: 'call-ended',
        call: {
          id: 'call-123',
          status: 'ended',
          transcript: 'Some transcript',
          metadata: {},
        },
      };

      const request = createMockRequest('POST', payload);
      const response = await POST(request);
      const body = await parseResponse<{ success: boolean; message: string }>(response);

      expect(response.status).toBe(200);
      expect(body.message).toContain('no userId');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Service errors', () => {
    it('should return 502 when Edge Function fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const payload = {
        type: 'call-ended',
        call: {
          id: 'call-123',
          status: 'ended',
          transcript: 'Some transcript',
          metadata: {
            userId: '550e8400-e29b-41d4-a716-446655440000',
          },
        },
      };

      const request = createMockRequest('POST', payload);
      const response = await POST(request);
      const body = await parseResponse<{ error: { code: string; message: string } }>(response);

      expect(response.status).toBe(502);
      assertErrorResponse(body, 'INTERNAL_ERROR');
    });
  });
});
