import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy-initialized clients
let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

/**
 * Get Supabase client for client-side operations (respects RLS)
 * Use this in React components and client-side code
 */
export function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  _supabase = createClient(url, anonKey);
  return _supabase;
}

/**
 * Get Supabase admin client for server-side operations (bypasses RLS)
 * Use this ONLY in API routes and server-side code
 * WARNING: This client has full access to the database
 * Throws error if not configured
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_supabaseAdmin) return _supabaseAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');
  }
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  _supabaseAdmin = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return _supabaseAdmin;
}

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Database types for Voice Engine
 */
export interface UserProfile {
  id: string;
  name: string;
  voice_profile_blob: string | null;
  created_at: string;
}

export interface UserMemory {
  id: string;
  user_id: string;
  fact: string;
  source: string | null;
  created_at: string;
}

/**
 * Memory Slot (REQUIREMENTS_v3 - Fixed 10 slots per user)
 */
export interface UserMemorySlot {
  id: string;
  user_id: string;
  slot_number: number;
  content: string;
  updated_at: string;
}

/**
 * Fetch user profile by ID
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw error;
  }
  return data;
}

/**
 * Fetch user memories (facts) by user ID
 * @deprecated Use getUserMemorySlots instead (REQUIREMENTS_v3)
 */
export async function getUserMemories(
  userId: string,
  limit = 50
): Promise<UserMemory[]> {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from('user_memories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }
  return data || [];
}

/**
 * Fetch all 10 memory slots for a user (REQUIREMENTS_v3)
 * Returns slots 1-10, ordered by slot_number
 */
export async function getUserMemorySlots(
  userId: string
): Promise<UserMemorySlot[]> {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from('user_memory_slots')
    .select('*')
    .eq('user_id', userId)
    .order('slot_number', { ascending: true });

  if (error) {
    throw error;
  }

  // Ensure all 10 slots exist (initialize if missing)
  if (!data || data.length < 10) {
    await initializeMemorySlots(userId);
    // Retry fetch
    const { data: retryData } = await client
      .from('user_memory_slots')
      .select('*')
      .eq('user_id', userId)
      .order('slot_number', { ascending: true });
    return retryData || [];
  }

  return data;
}

/**
 * Initialize 10 empty memory slots for a user
 */
async function initializeMemorySlots(userId: string): Promise<void> {
  const client = getSupabaseAdmin();

  // Check if already initialized
  const { data: existing } = await client
    .from('user_memory_slots')
    .select('slot_number')
    .eq('user_id', userId);

  const existingSlots = new Set(existing?.map((s) => s.slot_number) || []);

  // Insert missing slots
  const slotsToInsert = [];
  for (let i = 1; i <= 10; i++) {
    if (!existingSlots.has(i)) {
      slotsToInsert.push({ user_id: userId, slot_number: i, content: '' });
    }
  }

  if (slotsToInsert.length > 0) {
    await client.from('user_memory_slots').insert(slotsToInsert);
  }
}

/**
 * Upsert a memory slot (create or update)
 * Use this to save/update a specific slot
 */
export async function upsertMemorySlot(
  userId: string,
  slotNumber: number,
  content: string
): Promise<UserMemorySlot> {
  if (slotNumber < 1 || slotNumber > 10) {
    throw new Error('slotNumber must be between 1 and 10');
  }

  if (content.length > 200) {
    throw new Error('content must be 200 characters or less');
  }

  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from('user_memory_slots')
    .upsert(
      {
        user_id: userId,
        slot_number: slotNumber,
        content,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,slot_number',
      }
    )
    .select()
    .single();

  if (error) {
    throw error;
  }
  return data;
}

/**
 * Clear a memory slot (set content to empty string)
 */
export async function clearMemorySlot(
  userId: string,
  slotNumber: number
): Promise<UserMemorySlot> {
  return upsertMemorySlot(userId, slotNumber, '');
}

/**
 * Create a new user profile
 */
export async function createUserProfile(
  name: string,
  voiceProfileBlob?: string
): Promise<UserProfile> {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from('user_profiles')
    .insert({
      name,
      voice_profile_blob: voiceProfileBlob || null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }
  return data;
}

/**
 * Save a memory (fact) for a user
 */
export async function saveUserMemory(
  userId: string,
  fact: string,
  source: string = 'explicit'
): Promise<UserMemory> {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from('user_memories')
    .insert({
      user_id: userId,
      fact,
      source,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }
  return data;
}
