-- 10/11/2026 — Fila única do número de disparo (vilaca)
-- (1) Uma "vez" de envio por vez: entre duas mensagens automáticas, no mínimo 5 min (proximo_auto_em).
--     Envio feito por pessoa (botão da via, chamar cliente, orçamento salvo) vai na hora e empurra o próximo automático 5 min.
-- (2) disparo_envios: cada mensagem que sai pelo vilaca (telefone, loja, vendedora) — a resposta automática usa para dizer
--     qual loja/vendedora procurar.
-- (3) marketing_fila ganha campos para guardar VIA (envio de pessoa feito com o WhatsApp fora do ar: sai quando voltar).
alter table marketing_disparo_estado
  add column if not exists ultimo_envio_em timestamptz,
  add column if not exists proximo_auto_em timestamptz,
  add column if not exists cards_devidos int not null default 0,
  add column if not exists cards_restantes int not null default 0,
  add column if not exists cards_em timestamptz,
  add column if not exists mkt_restantes int not null default 0,
  add column if not exists aniv_dia date;

alter table marketing_fila
  add column if not exists registro_tabela text,
  add column if not exists registro_id text,
  add column if not exists botao text,
  add column if not exists rotulo text,
  add column if not exists vendedora text,
  add column if not exists marcar jsonb;

create table if not exists disparo_envios (
  id bigserial primary key,
  em timestamptz not null default now(),
  fone8 text not null,
  telefone text,
  loja_id text,
  vendedora text,
  tipo text,
  registro_id text,
  origem text
);
create index if not exists disparo_envios_fone8_em on disparo_envios (fone8, em desc);
alter table disparo_envios enable row level security;
revoke all on disparo_envios from anon, authenticated;

-- pega a vez de um envio AUTOMÁTICO (true = pode enviar agora). p_cards = Venda/Pedido/Orçamento ou via na fila (prioridade);
-- marketing (aniversário/mala direta) só pega a vez quando não há card vencido esperando.
create or replace function disparo_vez(p_cards boolean, p_gap_seg int) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update marketing_disparo_estado
     set ultimo_envio_em = now(), proximo_auto_em = now() + make_interval(secs => greatest(p_gap_seg, 300))
   where id = 1
     and pausado_motivo is null
     and (proximo_auto_em is null or proximo_auto_em <= now())
     and (ultimo_envio_em is null or ultimo_envio_em <= now() - interval '5 minutes')
     and (p_cards or cards_devidos = 0 or cards_em is null or cards_em < now() - interval '3 minutes');
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- envio feito por pessoa: sai na hora; o próximo automático espera 5 min a partir de agora.
create or replace function disparo_manual() returns void
language sql security definer set search_path = public as $$
  update marketing_disparo_estado
     set ultimo_envio_em = now(),
         proximo_auto_em = greatest(coalesce(proximo_auto_em, now()), now() + interval '5 minutes')
   where id = 1;
$$;

revoke execute on function disparo_vez(boolean, int) from public, anon, authenticated;
revoke execute on function disparo_manual() from public, anon, authenticated;
