import { NextRequest, NextResponse } from 'next/server';
import { ErrorCodes, createErrorResponse } from '@/app/lib/errors';
import { isValidCoordinates } from '@/app/lib/validation';
import { logRequestError } from '@/app/lib/logger';

const GEOCODING_API_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const PLACES_API_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';

/**
 * Check if Google Maps API is configured
 */
function isMapsConfigured(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}

/**
 * VAPI Tool Request for map_action
 */
interface LocationToolRequest {
  message: {
    toolCallList: Array<{
      id: string;
      function: {
        name: string;
        arguments: {
          action: 'reverse_geocode' | 'nearby_places';
          latitude: number;
          longitude: number;
          // For nearby_places
          type?: string;
          radius?: number;
        };
      };
    }>;
  };
}

interface GeocodeResult {
  formatted_address: string;
  address_components: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
}

interface PlaceResult {
  name: string;
  vicinity: string;
  types: string[];
  rating?: number;
  user_ratings_total?: number;
}

/**
 * POST /api/tools/location
 * VAPI Server Tool: Get location information from coordinates
 */
export async function POST(request: NextRequest) {
  try {
    const body: LocationToolRequest = await request.json();

    // Extract tool call from VAPI format
    const toolCall = body.message?.toolCallList?.[0];
    if (!toolCall) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.INVALID_REQUEST, 'No tool call found'),
        { status: 400 }
      );
    }

    const args = toolCall.function.arguments;
    const { action, latitude, longitude } = args;

    // Validate coordinates
    const coordsValidation = isValidCoordinates(latitude, longitude);
    if (!coordsValidation.valid) {
      return NextResponse.json({
        results: [{
          toolCallId: toolCall.id,
          result: JSON.stringify({
            success: false,
            error: coordsValidation.error,
          }),
        }],
      });
    }

    // Check if Maps API is configured
    if (!isMapsConfigured()) {
      return NextResponse.json({
        results: [{
          toolCallId: toolCall.id,
          result: JSON.stringify({
            success: false,
            error: 'Google Maps API is not configured',
          }),
        }],
      });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY!;
    let result: unknown;

    switch (action) {
      case 'reverse_geocode': {
        const response = await fetch(
          `${GEOCODING_API_URL}?latlng=${latitude},${longitude}&language=ja&key=${apiKey}`
        );

        if (!response.ok) {
          throw new Error(`Geocoding API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.status !== 'OK' || !data.results?.length) {
          result = {
            success: false,
            error: 'No address found for the given coordinates',
          };
          break;
        }

        const geocodeResult: GeocodeResult = data.results[0];

        // Extract useful address components
        const components = geocodeResult.address_components;
        const locality = components.find((c) => c.types.includes('locality'))?.long_name;
        const sublocality = components.find((c) => c.types.includes('sublocality'))?.long_name;
        const prefecture = components.find((c) => c.types.includes('administrative_area_level_1'))?.long_name;

        result = {
          success: true,
          address: geocodeResult.formatted_address,
          locality: locality || sublocality,
          prefecture,
          coordinates: { latitude, longitude },
        };
        break;
      }

      case 'nearby_places': {
        const type = args.type || 'point_of_interest';
        const radius = args.radius || 500;

        const response = await fetch(
          `${PLACES_API_URL}?location=${latitude},${longitude}&radius=${radius}&type=${type}&language=ja&key=${apiKey}`
        );

        if (!response.ok) {
          throw new Error(`Places API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
          result = {
            success: false,
            error: `Places API error: ${data.status}`,
          };
          break;
        }

        const places = (data.results || []).slice(0, 5).map((place: PlaceResult) => ({
          name: place.name,
          address: place.vicinity,
          types: place.types?.slice(0, 3),
          rating: place.rating,
          reviewCount: place.user_ratings_total,
        }));

        result = {
          success: true,
          places,
          count: places.length,
          searchRadius: radius,
        };
        break;
      }

      default:
        result = {
          success: false,
          error: `Unknown action: ${action}. Valid actions are: reverse_geocode, nearby_places`,
        };
    }

    return NextResponse.json({
      results: [{
        toolCallId: toolCall.id,
        result: JSON.stringify(result),
      }],
    });
  } catch (error) {
    logRequestError('/api/tools/location', 'POST', error instanceof Error ? error : { message: String(error) });
    return NextResponse.json(
      createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to execute location action'),
      { status: 500 }
    );
  }
}
