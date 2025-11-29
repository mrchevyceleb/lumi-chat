import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Supabase config (anon key is public, this is fine)
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || 'https://mwwoahlygzvietmhklvy.supabase.co'),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13d29haGx5Z3p2aWV0bWhrbHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwNzc2NTUsImV4cCI6MjA3OTY1MzY1NX0.1UoXU-WHslXQQngaeRlE63Ef__o4cNFeV6K3dE_wj2w'),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
