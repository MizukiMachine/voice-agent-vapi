/**
 * Tests for POST /api/tools/memo
 */
import { POST } from '@/app/api/tools/memo/route';
import {
  createMockRequest,
  parseResponse,
  createVapiToolRequest,
  parseVapiToolResponse,
  assertErrorResponse,
} from '../../helpers';

// Mock Supabase
jest.mock('@/app/lib/supabase', () => ({
  saveUserMemory: jest.fn(),
  isSupabaseConfigured: jest.fn(),
}));

import { saveUserMemory, isSupabaseConfigured } from '@/app/lib/supabase';

const mockSaveUserMemory = saveUserMemory as jest.Mock;
const mockIsSupabaseConfigured = isSupabaseConfigured as jest.Mock;

describe('POST /api/tools/memo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSupabaseConfigured.mockReturnValue(true);
  });

  describe('Success cases', () => {
    it('should save memo for valid request', async () => {
      mockSaveUserMemory.mockResolvedValue({
        id: 'memo-123',
        user_id: 'user-123',
        fact: 'Test memo content',
        source: 'explicit',
      });

      const body = createVapiToolRequest('call-123', 'memo_action', {
        content: 'Test memo content',
        userId: 'user-123',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: true,
        memoryId: 'memo-123',
      });
      expect(mockSaveUserMemory).toHaveBeenCalledWith('user-123', 'Test memo content', 'explicit');
    });

    it('should get userId from call metadata if not in arguments', async () => {
      mockSaveUserMemory.mockResolvedValue({
        id: 'memo-456',
        user_id: 'metadata-user',
        fact: 'Content',
        source: 'explicit',
      });

      const body = {
        message: {
          toolCallList: [
            {
              id: 'call-123',
              function: {
                name: 'memo_action',
                arguments: {
                  content: 'Content from metadata user',
                },
              },
            },
          ],
          call: {
            metadata: {
              userId: 'metadata-user',
            },
          },
        },
      };

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({ success: true });
      expect(mockSaveUserMemory).toHaveBeenCalledWith('metadata-user', expect.any(String), 'explicit');
    });
  });

  describe('Validation errors', () => {
    it('should return 400 when no tool call found', async () => {
      const body = { message: { toolCallList: [] } };

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const responseBody = await parseResponse<{ error: { code: string } }>(response);

      expect(response.status).toBe(400);
      assertErrorResponse(responseBody, 'INVALID_REQUEST');
    });

    it('should return error when content is missing', async () => {
      const body = createVapiToolRequest('call-123', 'memo_action', {
        userId: 'user-123',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: false,
        error: expect.stringContaining('content'),
      });
    });

    it('should return error when userId is missing', async () => {
      const body = createVapiToolRequest('call-123', 'memo_action', {
        content: 'Some content',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: false,
        error: expect.stringContaining('userId'),
      });
    });
  });

  describe('Supabase not configured', () => {
    it('should return error when Supabase is not configured', async () => {
      mockIsSupabaseConfigured.mockReturnValue(false);

      const body = createVapiToolRequest('call-123', 'memo_action', {
        content: 'Test content',
        userId: 'user-123',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const responseBody = await parseResponse<{ error: { code: string } }>(response);

      expect(response.status).toBe(500);
      assertErrorResponse(responseBody, 'SUPABASE_ERROR');
    });
  });

  describe('Service errors', () => {
    it('should return 500 when database insert fails', async () => {
      mockSaveUserMemory.mockRejectedValue(new Error('Database error'));

      const body = createVapiToolRequest('call-123', 'memo_action', {
        content: 'Test content',
        userId: 'user-123',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const responseBody = await parseResponse<{ error: { code: string } }>(response);

      expect(response.status).toBe(500);
      assertErrorResponse(responseBody, 'INTERNAL_ERROR');
    });
  });
});
