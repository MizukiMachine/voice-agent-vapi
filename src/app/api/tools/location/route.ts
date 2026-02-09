import { NextRequest, NextResponse } from 'next/server';
import { ErrorCodes, createErrorResponse } from '@/app/lib/errors';
import { isValidCoordinates } from '@/app/lib/validation';
import { logRequestError, createServiceLogger } from '@/app/lib/logger';
import { getSupabaseAdmin } from '@/app/lib/supabase';
import { loadCartesiaConfig } from '@/app/lib/config';
import { createCartesiaClient } from '@/app/lib/cartesia-client';

const logger = createServiceLogger('location-api');

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
          userId?: string;
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
  place_id: string;
  name: string;
  vicinity: string;
  types: string[];
  rating?: number;
  user_ratings_total?: number;
}

/**
 * POI information with TTS
 */
interface PoiInfo {
  name: string;
  types: string[];
  description: string;
  audio: string | null;
}

/**
 * User POI notification record
 */
interface UserPoiNotificationRecord {
  id: string;
  user_id: string;
  poi_id: string;
  poi_name: string;
  notified_at: string;
  latitude: number;
  longitude: number;
}

/**
 * Generate POI description using OpenAI (or simple template for PoC)
 */
async function generatePOIDescription(poiName: string, types: string[]): Promise<string> {
  // For PoC, use a simple template
  // In production, this would use OpenAI API to generate contextual descriptions
  const firstType = types.length > 0 ? types[0] : undefined;
  const typeText = firstType ? firstType.replace(/_/g, ' ') : '場所';
  return `${poiName}は${typeText}です。`;
}

/**
 * Generate TTS audio for POI description using Cartesia
 */
async function generatePOITTS(text: string): Promise<string | null> {
  try {
    const cartesiaConfig = loadCartesiaConfig();

    // In production, you would fetch user-specific voice settings
    // For now, use the default config
    const cartesiaClient = createCartesiaClient({
      apiKey: cartesiaConfig.apiKey,
      voiceId: cartesiaConfig.voiceId,
      speed: cartesiaConfig.speed,
      sampleRate: 24000,
      outputFormat: 'pcm16',
    });

    // Connect and synthesize
    await cartesiaClient.connect();

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cartesiaClient.disconnect();
        reject(new Error('TTS generation timeout'));
      }, 10000);

      let audioData = Buffer.alloc(0);

      cartesiaClient.onAudio((audio, isFinal) => {
        audioData = Buffer.concat([audioData, audio]);
        if (isFinal) {
          clearTimeout(timeout);
          cartesiaClient.disconnect();
          resolve(audioData.toString('base64'));
        }
      });

      cartesiaClient.onError((error) => {
        clearTimeout(timeout);
        cartesiaClient.disconnect();
        reject(new Error(`TTS error: ${error}`));
      });

      cartesiaClient.synthesize(text);
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to generate TTS', { message: errorMessage });
    return null;
  }
}

/**
 * Check cool-time for POI notification
 */
async function checkPoiCoolTime(
  userId: string,
  poiId: string,
  coolTimeMs: number
): Promise<{ skipped: boolean; remainingTime?: number; lastNotification?: UserPoiNotificationRecord }> {
  const supabase = getSupabaseAdmin();

  // Get the most recent notification for this POI
  const { data, error } = await supabase
    .from('user_poi_notifications')
    .select('*')
    .eq('user_id', userId)
    .eq('poi_id', poiId)
    .order('notified_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('Failed to check POI cool-time', { message: error.message });
    // On error, allow notification (fail open)
    return { skipped: false };
  }

  if (!data) {
    // No previous notification, allow
    return { skipped: false };
  }

  const timeSinceLast = Date.now() - new Date(data.notified_at).getTime();

  if (timeSinceLast < coolTimeMs) {
    return {
      skipped: true,
      remainingTime: coolTimeMs - timeSinceLast,
      lastNotification: data,
    };
  }

  return { skipped: false };
}

/**
 * Record POI notification
 */
async function recordPoiNotification(
  userId: string,
  poiId: string,
  poiName: string,
  latitude: number,
  longitude: number
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from('user_poi_notifications').insert({
    user_id: userId,
    poi_id: poiId,
    poi_name: poiName,
    latitude,
    longitude,
  });

  if (error) {
    logger.error('Failed to record POI notification', { message: error.message });
  }
}

/**
 * Get user settings for location features
 */
async function getUserLocationSettings(userId: string) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('user_profiles')
    .select('location_cool_time, location_search_radius')
    .eq('id', userId)
    .single();

  if (error || !data) {
    // Return defaults
    return {
      coolTime: 1800000, // 30 minutes
      searchRadius: 100, // 100m
    };
  }

  return {
    coolTime: data.location_cool_time ?? 1800000,
    searchRadius: data.location_search_radius ?? 100,
  };
}

/**
 * POST /api/tools/location
 * VAPI Server Tool: Get location information from coordinates
 * Enhanced with cool-time check and POI notification history
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
    const { action, latitude, longitude, userId } = args;

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
        // Get user settings if userId provided
        const settings = userId ? await getUserLocationSettings(userId) : { coolTime: 1800000, searchRadius: 500 };
        const type = args.type || 'point_of_interest';
        const radius = args.radius || settings.searchRadius;

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

        const places = (data.results || []).slice(0, 5);

        // If userId provided, check cool-time and generate TTS for first POI
        let poiInfo: PoiInfo | null = null;
        if (userId && places.length > 0) {
          const firstPlace = places[0];

          // Check cool-time
          const coolTimeCheck = await checkPoiCoolTime(userId, firstPlace.place_id, settings.coolTime);

          if (coolTimeCheck.skipped) {
            result = {
              success: true,
              skipped: true,
              remainingTime: coolTimeCheck.remainingTime,
              lastNotification: coolTimeCheck.lastNotification,
              places: places.map((p: PlaceResult) => ({
                place_id: p.place_id,
                name: p.name,
                address: p.vicinity,
                types: p.types?.slice(0, 3),
              })),
            };
            break;
          }

          // Generate POI description and TTS
          const description = await generatePOIDescription(firstPlace.name, firstPlace.types || []);
          const ttsAudio = await generatePOITTS(description);

          // Record notification
          await recordPoiNotification(userId, firstPlace.place_id, firstPlace.name, latitude, longitude);

          poiInfo = {
            name: firstPlace.name,
            types: firstPlace.types?.slice(0, 3) || [],
            description,
            audio: ttsAudio,
          };
        }

        result = {
          success: true,
          skipped: false,
          places: places.map((p: PlaceResult) => ({
            place_id: p.place_id,
            name: p.name,
            address: p.vicinity,
            types: p.types?.slice(0, 3),
            rating: p.rating,
            reviewCount: p.user_ratings_total,
          })),
          ...(poiInfo && { poi: poiInfo }),
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
