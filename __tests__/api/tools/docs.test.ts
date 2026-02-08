/**
 * Tests for POST /api/tools/docs
 */
import { POST } from '@/app/api/tools/docs/route';
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
  createGoogleDoc: jest.fn(),
  appendToGoogleDoc: jest.fn(),
  getGoogleDoc: jest.fn(),
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
  createGoogleDoc,
  appendToGoogleDoc,
  getGoogleDoc,
} from '@/app/lib/google';

const mockIsGoogleConfigured = isGoogleConfigured as jest.Mock;
const mockCreateGoogleDoc = createGoogleDoc as jest.Mock;
const mockAppendToGoogleDoc = appendToGoogleDoc as jest.Mock;
const mockGetGoogleDoc = getGoogleDoc as jest.Mock;

describe('POST /api/tools/docs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleConfigured.mockReturnValue(true);
  });

  describe('Create action', () => {
    it('should create document with valid title', async () => {
      mockCreateGoogleDoc.mockResolvedValue({
        documentId: 'doc-123',
        title: 'Test Document',
      });

      const body = createVapiToolRequest('call-123', 'docs_action', {
        action: 'create',
        title: 'Test Document',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: true,
        documentId: 'doc-123',
        title: 'Test Document',
        url: expect.stringContaining('doc-123'),
      });
    });

    it('should create document with initial content', async () => {
      mockCreateGoogleDoc.mockResolvedValue({
        documentId: 'doc-123',
        title: 'Notes',
      });
      mockAppendToGoogleDoc.mockResolvedValue(undefined);

      const body = createVapiToolRequest('call-123', 'docs_action', {
        action: 'create',
        title: 'Notes',
        content: 'Initial content here',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({ success: true });
      expect(mockAppendToGoogleDoc).toHaveBeenCalledWith('doc-123', 'Initial content here');
    });

    it('should return error when title is missing', async () => {
      const body = createVapiToolRequest('call-123', 'docs_action', {
        action: 'create',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: false,
        error: expect.stringContaining('title'),
      });
    });
  });

  describe('Append action', () => {
    it('should append content to existing document', async () => {
      mockAppendToGoogleDoc.mockResolvedValue(undefined);

      const body = createVapiToolRequest('call-123', 'docs_action', {
        action: 'append',
        documentId: 'doc-123',
        content: 'Additional content',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: true,
        documentId: 'doc-123',
      });
      expect(mockAppendToGoogleDoc).toHaveBeenCalledWith('doc-123', 'Additional content');
    });

    it('should return error when documentId is missing', async () => {
      const body = createVapiToolRequest('call-123', 'docs_action', {
        action: 'append',
        content: 'Some content',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: false,
        error: expect.stringContaining('documentId'),
      });
    });
  });

  describe('Get action', () => {
    it('should get document info', async () => {
      mockGetGoogleDoc.mockResolvedValue({
        documentId: 'doc-123',
        title: 'My Document',
      });

      const body = createVapiToolRequest('call-123', 'docs_action', {
        action: 'get',
        documentId: 'doc-123',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: true,
        documentId: 'doc-123',
        title: 'My Document',
        url: expect.stringContaining('doc-123'),
      });
    });

    it('should return error when documentId is missing', async () => {
      const body = createVapiToolRequest('call-123', 'docs_action', {
        action: 'get',
      });

      const request = createMockRequest('POST', body);
      const response = await POST(request);
      const parsed = parseVapiToolResponse(await parseResponse(response));

      expect(response.status).toBe(200);
      expect(parsed?.result).toMatchObject({
        success: false,
        error: expect.stringContaining('documentId'),
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

    it('should return error when action is invalid', async () => {
      const body = createVapiToolRequest('call-123', 'docs_action', {
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

      const body = createVapiToolRequest('call-123', 'docs_action', {
        action: 'create',
        title: 'Test',
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
});
