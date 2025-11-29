import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mwwoahlygzvietmhklvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13d29haGx5Z3p2aWV0bWhrbHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwNzc2NTUsImV4cCI6MjA3OTY1MzY1NX0.1UoXU-WHslXQQngaeRlE63Ef__o4cNFeV6K3dE_wj2w';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
