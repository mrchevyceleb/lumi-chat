ALTER TABLE public.vault_items 
ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;



