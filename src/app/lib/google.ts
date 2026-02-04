/**
 * Google API Client Utility
 * Handles OAuth token refresh and API calls to Google services
 */

import { createServiceLogger } from '@/app/lib/logger';

const logger = createServiceLogger('google');
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';
const DOCS_API_URL = 'https://docs.googleapis.com/v1';

/**
 * Google API Error
 */
export class GoogleApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

/**
 * Check if Google API is configured
 */
export function isGoogleConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );
}

/**
 * Get a fresh access token using refresh token
 */
async function getAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new GoogleApiError('Google OAuth credentials not configured', 500);
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Google token refresh error', { message: `${response.status}: ${errorText}` }, { statusCode: response.status });
    throw new GoogleApiError('Failed to refresh Google access token', 502);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Calendar Event interface
 */
export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  location?: string;
}

/**
 * List calendar events
 */
export async function listCalendarEvents(
  calendarId: string = 'primary',
  timeMin?: string,
  timeMax?: string,
  maxResults: number = 10
): Promise<CalendarEvent[]> {
  const accessToken = await getAccessToken();

  const params = new URLSearchParams({
    maxResults: maxResults.toString(),
    orderBy: 'startTime',
    singleEvents: 'true',
  });

  if (timeMin) params.set('timeMin', timeMin);
  if (timeMax) params.set('timeMax', timeMax);

  const response = await fetch(
    `${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Calendar API error', { message: `${response.status}: ${errorText}` }, { statusCode: response.status });
    throw new GoogleApiError(`Calendar API error: ${response.status}`, 502);
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Create a calendar event
 */
export async function createCalendarEvent(
  event: CalendarEvent,
  calendarId: string = 'primary'
): Promise<CalendarEvent> {
  const accessToken = await getAccessToken();

  const response = await fetch(
    `${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Calendar API error', { message: `${response.status}: ${errorText}` }, { statusCode: response.status });
    throw new GoogleApiError(`Failed to create event: ${response.status}`, 502);
  }

  return response.json();
}

/**
 * Google Doc interface
 */
export interface GoogleDoc {
  documentId: string;
  title: string;
  revisionId?: string;
}

/**
 * Create a new Google Doc
 */
export async function createGoogleDoc(title: string): Promise<GoogleDoc> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${DOCS_API_URL}/documents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Docs API error', { message: `${response.status}: ${errorText}` }, { statusCode: response.status });
    throw new GoogleApiError(`Failed to create document: ${response.status}`, 502);
  }

  return response.json();
}

/**
 * Append text to a Google Doc
 */
export async function appendToGoogleDoc(
  documentId: string,
  text: string
): Promise<void> {
  const accessToken = await getAccessToken();

  const response = await fetch(
    `${DOCS_API_URL}/documents/${documentId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: text,
            },
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Docs API error', { message: `${response.status}: ${errorText}` }, { statusCode: response.status });
    throw new GoogleApiError(`Failed to update document: ${response.status}`, 502);
  }
}

/**
 * Get a Google Doc
 */
export async function getGoogleDoc(documentId: string): Promise<GoogleDoc> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${DOCS_API_URL}/documents/${documentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Docs API error', { message: `${response.status}: ${errorText}` }, { statusCode: response.status });
    throw new GoogleApiError(`Failed to get document: ${response.status}`, 502);
  }

  return response.json();
}
