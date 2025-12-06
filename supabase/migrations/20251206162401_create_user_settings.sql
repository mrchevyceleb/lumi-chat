-- User settings to sync preferences across devices
BEGIN;

CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id uuid PRIMARY KEY DEFAULT auth.uid(),
    default_model text,
    last_model text,
    voice_name text,
    web_search_enabled boolean DEFAULT false,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own settings"
ON public.user_settings
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

COMMIT;

