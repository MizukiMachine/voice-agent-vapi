/**
 * Vapi Assistant Creator Script
 *
 * This script creates a Vapi assistant with:
 * - Cartesia TTS integration
 * - Function calling tools (calendar, docs, memo, map)
 * - Proper model configuration
 *
 * Usage:
 *   npm run create-assistant
 *   or
 *   tsx scripts/create-vapi-assistant.ts
 *
 * Environment Variables Required:
 *   VAPI_API_KEY - Your Vapi API key
 */

interface VapiAssistantCreateRequest {
  name: string;
  model: VapiModelConfig;
  voice: VapiVoiceConfig;
  firstMessage: string;
  transcriber: VapiTranscriberConfig;
  serverUrl?: string;
}

interface VapiModelConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  temperature?: number;
  maxTokens?: number;
  knowledgeBase?: string[];
}

interface VapiVoiceConfig {
  provider: 'cartesia' | 'elevenlabs' | 'azure' | 'deepgram' | 'playht';
  voiceId?: string;
  speed?: number;
  // Cartesia specific
  model?: string;
  language?: string;
}

interface VapiTranscriberConfig {
  provider: 'deepgram' | 'default';
  language: string;
  model?: string;
}

interface VapiTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

interface VapiAssistantResponse {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface VapiErrorResponse {
  error: string;
  message: string;
}

// Vapi API base URL
const VAPI_API_BASE = 'https://api.vapi.ai';

/**
 * Load environment variables
 */
function loadEnv(): { apiKey: string; publicKey: string } {
  // Try loading from .env.local
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const envPath = '.env.local';
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const envVars: Record<string, string> = {};
      envContent.split('\n').forEach((line: string) => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match && !line.trim().startsWith('#')) {
          envVars[match[1]] = match[2];
        }
      });

      return {
        apiKey: envVars.VAPI_API_KEY || process.env.VAPI_API_KEY || '',
        publicKey: envVars.VAPI_PUBLIC_KEY || process.env.VAPI_PUBLIC_KEY || '',
      };
    }
  } catch (e) {
    // Ignore file read errors
  }

  return {
    apiKey: process.env.VAPI_API_KEY || '',
    publicKey: process.env.VAPI_PUBLIC_KEY || '',
  };
}

/**
 * Create Vapi assistant via REST API
 */
async function createVapiAssistant(apiKey: string): Promise<VapiAssistantResponse> {
  const url = `${VAPI_API_BASE}/assistant`;

  // Define the tools (functions) that the assistant can call
  const tools: VapiTool[] = [
    {
      type: 'function',
      function: {
        name: 'calendar_action',
        description: 'Manage Google Calendar events including creating, listing, and updating calendar appointments',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'create', 'update'],
              description: 'The action to perform on the calendar',
            },
            title: {
              type: 'string',
              description: 'Event title (required for create/update)',
            },
            startTime: {
              type: 'string',
              description: 'Event start time in ISO format (required for create/update)',
            },
            endTime: {
              type: 'string',
              description: 'Event end time in ISO format (required for create)',
            },
            description: {
              type: 'string',
              description: 'Event description',
            },
          },
          required: ['action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'docs_action',
        description: 'Create and manage Google Docs documents',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['create', 'list', 'get'],
              description: 'The action to perform on documents',
            },
            title: {
              type: 'string',
              description: 'Document title (required for create)',
            },
            content: {
              type: 'string',
              description: 'Document content (required for create)',
            },
          },
          required: ['action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'memo_action',
        description: 'Save and retrieve user memos/memory slots',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['save', 'retrieve', 'list'],
              description: 'The action to perform on memos',
            },
            key: {
              type: 'string',
              description: 'Memo key identifier (required for save/retrieve)',
            },
            value: {
              type: 'string',
              description: 'Memo value (required for save)',
            },
          },
          required: ['action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'map_action',
        description: 'Get location information including reverse geocoding and nearby places search',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['reverse_geocode', 'nearby_places'],
              description: 'The location action to perform',
            },
            latitude: {
              type: 'number',
              description: 'Latitude coordinate',
            },
            longitude: {
              type: 'number',
              description: 'Longitude coordinate',
            },
            type: {
              type: 'string',
              description: 'Place type for nearby search (e.g., point_of_interest, restaurant)',
            },
            radius: {
              type: 'number',
              description: 'Search radius in meters for nearby places',
            },
          },
          required: ['action', 'latitude', 'longitude'],
        },
      },
    },
  ];

  // Create the assistant request
  const requestBody: VapiAssistantCreateRequest = {
    name: 'Voice Engine Assistant',
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 1024,
    },
    voice: {
      provider: 'cartesia',
      // Default Japanese-optimized voice from Cartesia
      // You can customize this with your own voice ID
      speed: 1.0,
      language: 'ja',
    },
    firstMessage: 'こんにちは！音声アシスタントです。カレンダー、メモ、地図検索などをお手伝いします。何かお手伝いできることはありますか？',
    transcriber: {
      provider: 'deepgram',
      language: 'ja',
      model: 'nova-2',
    },
  };

  console.log('Creating Vapi assistant...');
  console.log('Request body:', JSON.stringify(requestBody, null, 2));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as VapiErrorResponse;
    throw new Error(`Failed to create assistant: ${errorData.error} - ${errorData.message}`);
  }

  const data = (await response.json()) as VapiAssistantResponse;
  return data;
}

/**
 * Get existing assistants
 */
async function listAssistants(apiKey: string): Promise<VapiAssistantResponse[]> {
  const url = `${VAPI_API_BASE}/assistant`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = (await response.json()) as VapiErrorResponse;
    throw new Error(`Failed to list assistants: ${errorData.error} - ${errorData.message}`);
  }

  return (await response.json()) as VapiAssistantResponse[];
}

/**
 * Delete an assistant
 */
async function deleteAssistant(apiKey: string, assistantId: string): Promise<void> {
  const url = `${VAPI_API_BASE}/assistant/${assistantId}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = (await response.json()) as VapiErrorResponse;
    throw new Error(`Failed to delete assistant: ${errorData.error} - ${errorData.message}`);
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('=== Vapi Assistant Creator ===\n');

  // Load environment variables
  const { apiKey, publicKey } = loadEnv();

  if (!apiKey) {
    console.error('Error: VAPI_API_KEY is not set');
    console.log('\nPlease set VAPI_API_KEY in your environment or .env.local file');
    process.exit(1);
  }

  console.log('VAPI_API_KEY: ' + apiKey.substring(0, 10) + '...');
  if (publicKey) {
    console.log('VAPI_PUBLIC_KEY: ' + publicKey.substring(0, 10) + '...');
  }

  // List existing assistants
  console.log('\n--- Existing Assistants ---');
  try {
    const existingAssistants = await listAssistants(apiKey);
    if (existingAssistants.length === 0) {
      console.log('No existing assistants found.');
    } else {
      console.log(`Found ${existingAssistants.length} existing assistant(s):`);
      existingAssistants.forEach((assistant) => {
        console.log(`  - ${assistant.id}: ${assistant.name}`);
      });
    }
  } catch (error) {
    console.warn('Warning: Could not list existing assistants:', error instanceof Error ? error.message : error);
  }

  // Create new assistant
  console.log('\n--- Creating New Assistant ---');
  try {
    const assistant = await createVapiAssistant(apiKey);

    console.log('\n✅ Assistant created successfully!');
    console.log('\nAssistant Details:');
    console.log(`  ID: ${assistant.id}`);
    console.log(`  Name: ${assistant.name}`);
    console.log(`  Created At: ${assistant.createdAt}`);

    console.log('\n--- Next Steps ---');
    console.log('Add the following to your .env.local file:');
    console.log(`  VAPI_ASSISTANT_ID=${assistant.id}`);

    if (!publicKey) {
      console.log('\n⚠️  Warning: VAPI_PUBLIC_KEY is not set');
      console.log('   You may need this for client-side SDK integration.');
    }
  } catch (error) {
    console.error('\n❌ Error creating assistant:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
