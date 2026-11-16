-- 16/11/2026 — FICHA DA LOJA (memorial descritivo): uma ficha por loja + histórico das versões.
-- Acesso só pela Edge Function ficha-loja-api (service_role). RLS ligado, sem GRANT para anon/authenticated.
create table if not exists public.loja_fichas (
  loja_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  versao integer not null default 0,
  atualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.loja_fichas enable row level security;
revoke all on public.loja_fichas from anon, authenticated;

create table if not exists public.loja_fichas_historico (
  id bigserial primary key,
  loja_id text not null,
  payload jsonb not null,
  versao integer not null,
  por text,
  em timestamptz not null default now()
);
create index if not exists loja_fichas_historico_loja_idx on public.loja_fichas_historico (loja_id, em desc);
alter table public.loja_fichas_historico enable row level security;
revoke all on public.loja_fichas_historico from anon, authenticated;
revoke all on sequence public.loja_fichas_historico_id_seq from anon, authenticated;
