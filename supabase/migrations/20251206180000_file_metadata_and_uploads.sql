-- 2025-12-06: Add uploads bucket, file metadata table, and message metadata column
-- Stores only minimal metadata (no file contents) for auditing and UI display.

begin;

-- Ensure uploads bucket exists (private by default)
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

-- Storage policies for uploads bucket (owner-based access)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Allow uploads select'
  ) then
    create policy "Allow uploads select"
      on storage.objects
      for select
      using (bucket_id = 'uploads' and auth.uid() = owner);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Allow uploads insert'
  ) then
    create policy "Allow uploads insert"
      on storage.objects
      for insert
      with check (bucket_id = 'uploads' and auth.uid() = owner);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Allow uploads delete'
  ) then
    create policy "Allow uploads delete"
      on storage.objects
      for delete
      using (bucket_id = 'uploads' and auth.uid() = owner);
  end if;
end$$;

-- Lightweight file metadata table (no file contents)
create table if not exists public.file_metadata (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_id uuid references public.chats(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  bucket text not null,
  path text not null,
  zip_entry_path text,
  original_name text not null,
  extension text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

alter table public.file_metadata enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'file_metadata' and policyname = 'Allow users manage own file metadata'
  ) then
    create policy "Allow users manage own file metadata"
      on public.file_metadata
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end$$;

create index if not exists idx_file_metadata_user on public.file_metadata(user_id);
create index if not exists idx_file_metadata_message on public.file_metadata(message_id);

-- Minimal metadata on messages for UI reuse (no content)
alter table public.messages
  add column if not exists file_metadata jsonb default '[]'::jsonb;

commit;

