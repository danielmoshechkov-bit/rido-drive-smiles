
-- AI Conversations & Messages for RidoAI chat history
create table if not exists public.ai_conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text,
  mode text default 'chat',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ai_messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.ai_conversations(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  images jsonb,
  created_at timestamptz default now()
);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy "Users own conversations" on public.ai_conversations
  for all using (auth.uid() = user_id);
create policy "Users own messages" on public.ai_messages
  for all using (auth.uid() = user_id);
