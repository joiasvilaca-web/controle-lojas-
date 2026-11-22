-- 22/11/2026: COPILOTO DE VENDAS ("Felipe"). Só a Edge Function copiloto (service_role) lê e grava. RLS ligado, sem GRANT.
create table if not exists public.copiloto_dia (
  id text primary key,                 -- <user_id>|<AAAA-MM-DD>
  user_id text not null,
  dia date not null,
  payload jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create table if not exists public.copiloto_aprendizados (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  origem text not null default 'chat',  -- chat | vendas
  payload jsonb not null default '{}'::jsonb   -- { tecnicas[], objecoes[], perguntas[], frases[], conversas:int }
);
create table if not exists public.copiloto_chat_visto (
  conversa_id text primary key,
  ultima_msg_em timestamptz,
  analisado_em timestamptz not null default now()
);
alter table public.copiloto_dia enable row level security;
alter table public.copiloto_aprendizados enable row level security;
alter table public.copiloto_chat_visto enable row level security;
revoke all on public.copiloto_dia, public.copiloto_aprendizados, public.copiloto_chat_visto from anon, authenticated;
revoke all on sequence public.copiloto_aprendizados_id_seq from anon, authenticated;
