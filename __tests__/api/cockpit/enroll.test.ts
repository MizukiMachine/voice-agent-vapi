/**
 * Tests for POST /api/cockpit/enroll
 */
import { POST } from '@/app/api/cockpit/enroll/route';
import { createMockRequest, parseResponse, assertErrorResponse } from '../../helpers';
import * as supabase from '@/app/lib/supabase';

// Mock the modules
jest.mock('@/app/lib/supabase');

const mockedSupabase = supabase as jest.Mocked<typeof supabase>;

describe('POST /api/cockpit/enroll', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSupabase.isSupabaseConfigured.mockReturnValue(true);
  });

  describe('Success cases', () => {
    it('should create user with name only', async () => {
      const mockProfile: supabase.UserProfile = {
        id: 'new-user-id',
        name: '田中太郎',
        voice_profile_blob: null,
        created_at: '2026-01-01T00:00:00Z',
      };
      mockedSupabase.createUserProfile.mockResolvedValue(mockProfile);

      const request = createMockRequest('POST', { name: '田中太郎' });

      const response = await POST(request);
      const body = await parseResponse<{ success: boolean; userId: string }>(response);

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.userId).toBe('new-user-id');
      expect(mockedSupabase.createUserProfile).toHaveBeenCalledWith('田中太郎', undefined);
    });

    it('should create user with voice profile', async () => {
      const mockProfile: supabase.UserProfile = {
        id: 'new-user-id',
        name: '山田花子',
        voice_profile_blob: 'base64-voice-data',
        created_at: '2026-01-01T00:00:00Z',
      };
      mockedSupabase.createUserProfile.mockResolvedValue(mockProfile);

      const request = createMockRequest('POST', {
        name: '山田花子',
        voiceProfileBlob: 'base64-voice-data',
      });

      const response = await POST(request);
      const body = await parseResponse<{ success: boolean; userId: string }>(response);

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockedSupabase.createUserProfile).toHaveBeenCalledWith('山田花子', 'base64-voice-data');
    });
  });

  describe('Validation errors', () => {
    it('should return 400 when name is missing', async () => {
      const request = createMockRequest('POST', {});

      const response = await POST(request);
      const body = await parseResponse<{ error: { code: string; message: string } }>(response);

      expect(response.status).toBe(400);
      assertErrorResponse(body, 'INVALID_REQUEST');
    });

    it('should return 400 when name is empty', async () => {
      const request = createMockRequest('POST', { name: '' });

      const response = await POST(request);
      const body = await parseResponse<{ error: { code: string; message: string } }>(response);

      expect(response.status).toBe(400);
      assertErrorResponse(body, 'INVALID_REQUEST');
    });
  });

  describe('Service errors', () => {
    it('should return 500 when Supabase is not configured', async () => {
      mockedSupabase.isSupabaseConfigured.mockReturnValue(false);

      const request = createMockRequest('POST', { name: 'テスト' });

      const response = await POST(request);
      const body = await parseResponse<{ error: { code: string; message: string } }>(response);

      expect(response.status).toBe(500);
      assertErrorResponse(body, 'SUPABASE_ERROR');
    });

    it('should return 500 when database insert fails', async () => {
      mockedSupabase.createUserProfile.mockRejectedValue(new Error('DB Error'));

      const request = createMockRequest('POST', { name: 'テスト' });

      const response = await POST(request);
      const body = await parseResponse<{ error: { code: string; message: string } }>(response);

      expect(response.status).toBe(500);
      assertErrorResponse(body, 'INTERNAL_ERROR');
    });
  });
});
