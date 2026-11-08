-- Avaliação do atendimento pelo cliente (09/11): uma linha por via (id = tipo:via_id). RLS sem GRANT; só a Edge Function retirada-terceiro acessa.
create table if not exists public.avaliacoes_cliente (
  id text primary key, tipo text not null, via_id text not null, via_codigo text, loja_id text,
  atendente text, cliente text, estrelas integer check (estrelas between 1 and 5), comentario text,
  pulou boolean not null default false, lida boolean not null default false, resposta jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists avaliacoes_cliente_atendente on public.avaliacoes_cliente (atendente);
create index if not exists avaliacoes_cliente_criado on public.avaliacoes_cliente (criado_em desc);
alter table public.avaliacoes_cliente enable row level security;
revoke all on public.avaliacoes_cliente from anon, authenticated;
