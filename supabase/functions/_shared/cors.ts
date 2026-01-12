/**
 * Shared CORS configuration for Supabase Edge Functions
 *
 * Environment Variables:
 * - ALLOWED_ORIGIN: The allowed CORS origin (default: http://localhost:3000)
 *
 * Production usage:
 * Set ALLOWED_ORIGIN in Supabase dashboard under Project Settings > Edge Functions
 */

/**
 * Gets CORS headers with configurable origin
 * @returns Record of CORS headers
 */
export function getCorsHeaders(): Record<string, string> {
  const origin = Deno.env.get('ALLOWED_ORIGIN') || 'http://localhost:3000';

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

/**
 * Creates a preflight (OPTIONS) response with CORS headers
 * @returns Response with CORS headers and no body
 */
export function corsPreflightResponse(): Response {
  return new Response('ok', { headers: getCorsHeaders() });
}
