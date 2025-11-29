-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Vault Folders Table
CREATE TABLE IF NOT EXISTS public.vault_folders (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid DEFAULT auth.uid(),
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vault_folders_pkey PRIMARY KEY (id),
  CONSTRAINT vault_folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Vault Items Table
CREATE TABLE IF NOT EXISTS public.vault_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid DEFAULT auth.uid(),
  folder_id uuid REFERENCES public.vault_folders(id) ON DELETE SET NULL,
  content text NOT NULL,
  source_context text, -- Optional: e.g., "From chat: Project Ideas"
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vault_items_pkey PRIMARY KEY (id),
  CONSTRAINT vault_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- RLS Policies for Vault Folders
ALTER TABLE public.vault_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own vault folders" 
ON public.vault_folders FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own vault folders" 
ON public.vault_folders FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own vault folders" 
ON public.vault_folders FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vault folders" 
ON public.vault_folders FOR DELETE 
USING (auth.uid() = user_id);

-- RLS Policies for Vault Items
ALTER TABLE public.vault_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own vault items" 
ON public.vault_items FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own vault items" 
ON public.vault_items FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own vault items" 
ON public.vault_items FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vault items" 
ON public.vault_items FOR DELETE 
USING (auth.uid() = user_id);

