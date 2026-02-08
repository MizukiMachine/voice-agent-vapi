/**
 * Tests for POST /api/tools/location
 */
import { POST } from '@/app/api/tools/location/route';
import {
  createMockRequest,
  parseResponse,
  createVapiToolRequest,
  parseVapiToolResponse,
  assertErrorResponse,
} from '../../helpers';

// Mock fetch for Google APIs
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock validation
jest.mock('@/app/lib/validation', () => ({
  isValidCoordinates: jest.fn((lat: number, lng: number) => {
    if (lat < -90 || lat > 90) return { valid: false, error: 'Invalid latitude' };
    if (lng < -180 || lng > 180) return { valid: false, error: 'Invalid longitude' };
    return { valid: true };
  }),
}));

describe('POST /api/tools/location', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, GOOGLE_MAPS_API_KEY: 'test-api-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Reverse geocode action', () => {
    it('should return address for valid coordinates', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [
            {
              formatted_address: '東京都千代田区丸の内1丁目',
              address_components: [
                { long_name: '千代田区', types: ['locality'] },
                { long_name: '東京都', types: ['administrative_area_level_1'] },
              ],
            },
          ],
        }),
      });

      const body = createVapiToolRequest('call-123', 'map_action', {
        action: 'reverse_geocode',
        latitude: 35.6812,
        longitude: 139.7671,
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: true,
        address: '東京都千代田区丸の内1丁目',
        locality: '千代田区',
        prefecture: '東京都',
      });
    });

    it('should return error when no address found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ZERO_RESULTS',
          results: [],
        }),
      });

      const body = createVapiToolRequest('call-123', 'map_action', {
        action: 'reverse_geocode',
        latitude: 0,
        longitude: 0,
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: false,
        error: expect.stringContaining('No address found'),
      });
    });
  });

  describe('Nearby places action', () => {
    it('should return nearby places', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [
            {
              name: 'Tokyo Station',
              vicinity: '千代田区丸の内1丁目',
              types: ['train_station', 'transit_station'],
              rating: 4.3,
              user_ratings_total: 1000,
            },
            {
              name: 'Imperial Palace',
              vicinity: '千代田区千代田1',
              types: ['park', 'tourist_attraction'],
              rating: 4.5,
              user_ratings_total: 2000,
            },
          ],
        }),
      });

      const body = createVapiToolRequest('call-123', 'map_action', {
        action: 'nearby_places',
        latitude: 35.6812,
        longitude: 139.7671,
        radius: 1000,
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: true,
        count: 2,
        searchRadius: 1000,
      });
      expect((parsed?.result as { places: unknown[] }).places).toHaveLength(2);
    });

    it('should return empty places when none found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ZERO_RESULTS',
          results: [],
        }),
      });

      const body = createVapiToolRequest('call-123', 'map_action', {
        action: 'nearby_places',
        latitude: 0,
        longitude: 0,
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: true,
        places: [],
        count: 0,
      });
    });
  });

  describe('Validation errors', () => {
    it('should return 400 when no tool call found', async () => {
      const body = { message: { toolCallList: [] } };

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const responseBody = await parseResponse<{ error: { code: string; message: string } }>(response);

      expect(response.status).toBe(400);
      assertErrorResponse(responseBody, 'INVALID_REQUEST');
    });

    it('should return error when latitude is invalid', async () => {
      const body = createVapiToolRequest('call-123', 'map_action', {
        action: 'reverse_geocode',
        latitude: 100, // Invalid
        longitude: 139.7671,
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid'),
      });
    });

    it('should return error when action is invalid', async () => {
      const body = createVapiToolRequest('call-123', 'map_action', {
        action: 'invalid_action',
        latitude: 35.6812,
        longitude: 139.7671,
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: false,
        error: expect.stringContaining('Unknown action'),
      });
    });
  });

  describe('Google Maps not configured', () => {
    it('should return error when API key is missing', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY;

      const body = createVapiToolRequest('call-123', 'map_action', {
        action: 'reverse_geocode',
        latitude: 35.6812,
        longitude: 139.7671,
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: false,
        error: expect.stringContaining('not configured'),
      });
    });
  });

  describe('Service errors', () => {
    it('should return 500 when API request fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const body = createVapiToolRequest('call-123', 'map_action', {
        action: 'reverse_geocode',
        latitude: 35.6812,
        longitude: 139.7671,
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const responseBody = await parseResponse<{ error: { code: string; message: string } }>(response);

      expect(response.status).toBe(500);
      assertErrorResponse(responseBody, 'INTERNAL_ERROR');
    });
  });
});
