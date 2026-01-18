/**
 * Simple authentication utilities
 * Uses a shared password stored in environment variable
 */

const AUTH_TOKEN_KEY = 'midwaife_auth_token';

/**
 * Hash a password using SHA-256
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Verify password against environment variable hash
 */
export async function verifyPassword(password: string): Promise<boolean> {
  const expectedHash = process.env.NEXT_PUBLIC_PASSWORD_HASH;

  if (!expectedHash) {
    console.error('NEXT_PUBLIC_PASSWORD_HASH not configured');
    return false;
  }

  const inputHash = await hashPassword(password);
  return inputHash === expectedHash;
}

/**
 * Generate a session token (simple random token)
 */
function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Set authentication token in both localStorage and cookie
 */
export function setAuthToken(): void {
  const token = generateToken();

  // Store in localStorage for client-side checks
  localStorage.setItem(AUTH_TOKEN_KEY, token);

  // Store in cookie for middleware checks (expires in 30 days)
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);
  document.cookie = `${AUTH_TOKEN_KEY}=${token}; path=/; expires=${expiryDate.toUTCString()}; SameSite=Strict`;
}

/**
 * Get authentication token from localStorage
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

/**
 * Clear authentication token from both localStorage and cookie
 */
export function logout(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  // Clear cookie by setting it to expire immediately
  document.cookie = `${AUTH_TOKEN_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Strict`;
}

/**
 * Utility to generate password hash (for setting up environment variable)
 * Call this in browser console: hashPasswordForEnv('your-password')
 */
export async function hashPasswordForEnv(password: string): Promise<string> {
  const hash = await hashPassword(password);
  console.log('Add this to your .env.local and Vercel environment variables:');
  console.log(`NEXT_PUBLIC_PASSWORD_HASH=${hash}`);
  return hash;
}
