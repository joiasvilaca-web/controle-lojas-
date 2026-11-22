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
-- 22/11 (v4): BEM-ESTAR da equipe — só com CONSENTIMENTO da pessoa (LGPD: dado sensível). Só a diretoria vê (op `equipe` da função copiloto).
create table if not exists public.copiloto_consentimento ( user_id text primary key, nome text, aceito boolean not null default false, em timestamptz not null default now() );
create table if not exists public.copiloto_bemestar ( id bigserial primary key, user_id text not null, nome text, loja_id text, criado_em timestamptz not null default now(), pergunta text not null, resposta text not null, detalhe text );
create index if not exists copiloto_bemestar_user_idx on public.copiloto_bemestar (user_id, criado_em desc);
alter table public.copiloto_consentimento enable row level security; alter table public.copiloto_bemestar enable row level security;
revoke all on public.copiloto_consentimento, public.copiloto_bemestar from anon, authenticated;
revoke all on sequence public.copiloto_bemestar_id_seq from anon, authenticated;
