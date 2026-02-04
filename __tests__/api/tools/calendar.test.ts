/**
 * Tests for POST /api/tools/calendar
 */
import { POST } from '@/app/api/tools/calendar/route';
import {
  createMockRequest,
  parseResponse,
  createVapiToolRequest,
  parseVapiToolResponse,
  assertErrorResponse,
} from '../../helpers';

// Mock Google API functions
jest.mock('@/app/lib/google', () => ({
  isGoogleConfigured: jest.fn(),
  listCalendarEvents: jest.fn(),
  createCalendarEvent: jest.fn(),
  GoogleApiError: class GoogleApiError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

import {
  isGoogleConfigured,
  listCalendarEvents,
  createCalendarEvent,
  GoogleApiError,
} from '@/app/lib/google';

const mockIsGoogleConfigured = isGoogleConfigured as jest.Mock;
const mockListCalendarEvents = listCalendarEvents as jest.Mock;
const mockCreateCalendarEvent = createCalendarEvent as jest.Mock;

describe('POST /api/tools/calendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleConfigured.mockReturnValue(true);
  });

  describe('List action', () => {
    it('should return events for valid request', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          summary: 'Meeting',
          start: { dateTime: '2026-01-23T10:00:00+09:00' },
          end: { dateTime: '2026-01-23T11:00:00+09:00' },
          location: 'Room A',
        },
        {
          id: 'event-2',
          summary: 'Lunch',
          start: { date: '2026-01-23' },
          end: { date: '2026-01-23' },
        },
      ];
      mockListCalendarEvents.mockResolvedValue(mockEvents);

      const body = createVapiToolRequest('call-123', 'calendar_action', {
        action: 'list',
        maxResults: 10,
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.toolCallId).toBe('call-123');
      expect(parsed?.result).toMatchObject({
        success: true,
        count: 2,
        events: expect.arrayContaining([
          expect.objectContaining({ id: 'event-1', title: 'Meeting' }),
          expect.objectContaining({ id: 'event-2', title: 'Lunch' }),
        ]),
      });
    });

    it('should return empty array when no events', async () => {
      mockListCalendarEvents.mockResolvedValue([]);

      const body = createVapiToolRequest('call-123', 'calendar_action', {
        action: 'list',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: true,
        count: 0,
        events: [],
      });
    });
  });

  describe('Create action', () => {
    it('should create event with valid data', async () => {
      mockCreateCalendarEvent.mockResolvedValue({
        id: 'new-event-1',
        summary: 'New Meeting',
      });

      const body = createVapiToolRequest('call-123', 'calendar_action', {
        action: 'create',
        title: 'New Meeting',
        startTime: '2026-01-24T10:00:00+09:00',
        endTime: '2026-01-24T11:00:00+09:00',
        description: 'Project discussion',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: true,
        eventId: 'new-event-1',
        title: 'New Meeting',
      });
    });

    it('should return error when required fields are missing', async () => {
      const body = createVapiToolRequest('call-123', 'calendar_action', {
        action: 'create',
        title: 'Missing times',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: false,
        error: expect.stringContaining('required'),
      });
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

    it('should return error when action is invalid', async () => {
      const body = createVapiToolRequest('call-123', 'calendar_action', {
        action: 'invalid_action',
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

  describe('Google not configured', () => {
    it('should return error when Google is not configured', async () => {
      mockIsGoogleConfigured.mockReturnValue(false);

      const body = createVapiToolRequest('call-123', 'calendar_action', {
        action: 'list',
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
    it('should return error when Google Calendar API fails', async () => {
      // Create error that matches GoogleApiError structure
      const error = new Error('API Error') as Error & { statusCode: number };
      error.statusCode = 502;
      Object.setPrototypeOf(error, GoogleApiError.prototype);
      mockListCalendarEvents.mockRejectedValue(error);

      const body = createVapiToolRequest('call-123', 'calendar_action', {
        action: 'list',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const responseBody = await parseResponse<{ error: { code: string } }>(response);

      expect(response.status).toBe(502);
      assertErrorResponse(responseBody, 'INTERNAL_ERROR');
    });
  });
});
