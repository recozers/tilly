import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './index.js';

/**
 * Create a Supabase client with service role (for server-side operations)
 */
export function createServiceClient(): SupabaseClient {
  return createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);
}

/**
 * Create a Supabase client with user's auth token (for RLS)
 */
export function createAuthenticatedClient(accessToken: string): SupabaseClient {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

/**
 * Default service client for background operations
 */
export const supabase = createServiceClient();
