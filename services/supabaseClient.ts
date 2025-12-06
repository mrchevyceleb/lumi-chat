import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mwwoahlygzvietmhklvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13d29haGx5Z3p2aWV0bWhrbHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwNzc2NTUsImV4cCI6MjA3OTY1MzY1NX0.1UoXU-WHslXQQngaeRlE63Ef__o4cNFeV6K3dE_wj2w';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Auto-refresh session before it expires
    autoRefreshToken: true,
    // Persist session to localStorage for PWA
    persistSession: true,
    // Detect session from URL (for OAuth callbacks)
    detectSessionInUrl: true,
    // Storage key for the session
    storageKey: 'lumi-auth-token',
  }
});

// Session recovery utility - call this when you get 401/403 errors
export const attemptSessionRecovery = async (): Promise<boolean> => {
  try {
    // First, try to refresh the existing session
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error || !data.session) {
      console.warn('Session refresh failed, user needs to re-authenticate');
      // Clear the stale session
      await supabase.auth.signOut();
      return false;
    }
    
    console.log('Session recovered successfully');
    return true;
  } catch (e) {
    console.error('Session recovery error:', e);
    await supabase.auth.signOut();
    return false;
  }
};

// Check if an error is an auth error (401/403)
export const isAuthError = (error: any): boolean => {
  if (!error) return false;
  const message = error.message?.toLowerCase() || '';
  const code = error.code || error.status;
  return (
    code === 401 || 
    code === 403 || 
    code === 'PGRST301' || // JWT expired
    message.includes('jwt') ||
    message.includes('token') ||
    message.includes('unauthorized') ||
    message.includes('forbidden')
  );
};
