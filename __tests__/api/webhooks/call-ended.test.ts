/**
 * Tests for POST /api/webhooks/call-ended
 */
import { POST } from '@/app/api/webhooks/call-ended/route';
import {
  createMockRequest,
  parseResponse,
  assertErrorResponse,
} from '../../helpers';

// Mock Supabase
jest.mock('@/app/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn(),
    })),
  },
  isSupabaseConfigured: jest.fn(() => true),
}));

import { supabase, isSupabaseConfigured } from '@/app/lib/supabase';

const mockSupabaseInsert = jest.fn();
const mockIsSupabaseConfigured = isSupabaseConfigured as jest.Mock;

// Setup Supabase mock
beforeEach(() => {
  jest.clearAllMocks();
  mockIsSupabaseConfigured.mockReturnValue(true);

  (supabase.from as jest.Mock).mockReturnValue({
    insert: mockSupabaseInsert.mockResolvedValue({ error: null }),
  });
});

describe('POST /api/webhooks/call-ended', () => {
  describe('Valid call-ended webhooks', () => {
    it('should process call ended event with transcript', async () => {
      const payload = {
        callId: 'call-123',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        duration: 120,
        transcript: 'User: こんにちは\nAI: こんにちは！元気ですか？',
      };

      const request = createMockRequest('POST', payload);
      const response = await POST(request);
      const body = await parseResponse<{ success: boolean; message: string }>(response);

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Call ended webhook processed');
    });

    it('should process call ended event without transcript', async () => {
      const payload = {
        callId: 'call-456',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        duration: 60,
      };

      const request = createMockRequest('POST', payload);
      const response = await POST(request);
      const body = await parseResponse<{ success: boolean; message: string }>(response);

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockSupabaseInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            call_id: 'call-456',
            user_id: '550e8400-e29b-41d4-a716-446655440000',
            duration: 60,
          }),
        ])
      );
    });

    it('should process call ended event without userId', async () => {
      const payload = {
        callId: 'call-789',
        duration: 30,
      };

      const request = createMockRequest('POST', payload);
      const response = await POST(request);
      const body = await parseResponse<{ success: boolean; message: string }>(response);

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockSupabaseInsert).not.toHaveBeenCalled(); // No user, no history insert
    });
  });

  describe('Validation errors', () => {
    it('should return 400 when callId is missing', async () => {
      const payload = {
        userId: '550e8400-e29b-41d4-a716-446655440000',
        duration: 120,
      };

      const request = createMockRequest('POST', payload);
      const response = await POST(request);
      const body = await parseResponse<{ error: { code: string; message: string } }>(response);

      expect(response.status).toBe(400);
      assertErrorResponse(body, 'INVALID_REQUEST');
      expect(body.error.message).toContain('callId');
    });

    it('should return 400 when payload is empty', async () => {
      const payload = {};

      const request = createMockRequest('POST', payload);
      const response = await POST(request);
      const body = await parseResponse<{ error: { code: string; message: string } }>(response);

      expect(response.status).toBe(400);
      assertErrorResponse(body, 'INVALID_REQUEST');
    });
  });

  describe('Supabase not configured', () => {
    it('should return success without processing when Supabase is not configured', async () => {
      mockIsSupabaseConfigured.mockReturnValue(false);

      const payload = {
        callId: 'call-999',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        transcript: 'Test transcript',
      };

      const request = createMockRequest('POST', payload);
      const response = await POST(request);
      const body = await parseResponse<{ success: boolean; message: string }>(response);

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.message).toContain('Supabase not configured');
      expect(mockSupabaseInsert).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle malformed JSON', async () => {
      // Create a request with invalid JSON
      const request = new Request('http://localhost/api/webhooks/call-ended', {
        method: 'POST',
        body: 'invalid json',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(500);
    });

    it('should handle Supabase insert errors gracefully', async () => {
      mockSupabaseInsert.mockResolvedValue({
        error: { message: 'Database connection failed' },
      });

      const payload = {
        callId: 'call-error',
        userId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const request = createMockRequest('POST', payload);
      const response = await POST(request);
      const body = await parseResponse<{ success: boolean; message: string }>(response);

      // Should still return success as we don't fail the webhook for call history errors
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });
});

describe('GET /api/webhooks/call-ended', () => {
  it('should return endpoint status', async () => {
    // Import GET function
    const { GET } = await import('@/app/api/webhooks/call-ended/route');

    const request = new Request('http://localhost/api/webhooks/call-ended');
    const response = await GET(request);
    const body = await parseResponse<{ endpoint: string; status: string }>(response);

    expect(response.status).toBe(200);
    expect(body.endpoint).toBe('call-ended-webhook');
    expect(body.status).toBe('active');
  });
});
