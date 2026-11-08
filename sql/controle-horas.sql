-- CONTROLE DE HORAS (07/11/2026) — tabelas do módulo. RLS ligado e SEM GRANT: só a Edge Function horas-api (service_role) acessa.
create table if not exists public.horas_batidas (
  id bigserial primary key,
  funcionario_id text not null,
  funcionario_nome text,
  loja_id text not null,
  tipo text not null check (tipo in ('entrada','cafe_saida','cafe_volta','almoco_saida','almoco_volta','saida')),
  em timestamptz not null default now(),
  dia date not null,
  lat double precision, lng double precision, precisao double precision, distancia_m double precision,
  origem text not null default 'app' check (origem in ('app','ajuste')),
  solicitacao_id bigint,
  agente text,
  hash_ant text, hash text
);
create index if not exists horas_batidas_func_dia on public.horas_batidas (funcionario_id, dia);
create index if not exists horas_batidas_loja_dia on public.horas_batidas (loja_id, dia);

create table if not exists public.horas_solicitacoes (
  id bigserial primary key,
  tipo text not null check (tipo in ('editar','fora_horario')),
  funcionario_id text not null, funcionario_nome text, loja_id text not null,
  batida_id bigint references public.horas_batidas(id),
  tipo_batida text not null check (tipo_batida in ('entrada','cafe_saida','cafe_volta','almoco_saida','almoco_volta','saida')),
  dia date not null,
  hora_original timestamptz,
  hora_nova timestamptz not null,
  motivo text not null,
  status text not null default 'pendente' check (status in ('pendente','aprovada','recusada')),
  criado_em timestamptz not null default now(),
  decidido_por text, decidido_em timestamptz, motivo_decisao text,
  batida_nova_id bigint
);
create index if not exists horas_sol_status on public.horas_solicitacoes (status, criado_em desc);
create index if not exists horas_sol_func on public.horas_solicitacoes (funcionario_id, criado_em desc);

create table if not exists public.horas_config (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- batida é registro imutável: nunca se altera nem se apaga (correção = solicitação aprovada pela Diretoria)
create or replace function public.horas_batidas_bloqueia() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'horas_batidas é imutável (correção só por solicitação aprovada)'; end $$;
drop trigger if exists trg_horas_batidas_imutavel on public.horas_batidas;
create trigger trg_horas_batidas_imutavel before update or delete on public.horas_batidas for each row execute function public.horas_batidas_bloqueia();

-- cadeia de hash: cada batida guarda o hash da anterior (qualquer adulteração quebra a cadeia)
create or replace function public.horas_batidas_hash() returns trigger language plpgsql set search_path = public as $$
declare v text;
begin
  perform pg_advisory_xact_lock(7771001);
  select hash into v from public.horas_batidas order by id desc limit 1;
  new.hash_ant := v;
  new.hash := encode(sha256(convert_to(coalesce(v,'')||'|'||new.funcionario_id||'|'||new.loja_id||'|'||new.tipo||'|'||new.em::text||'|'||new.dia::text||'|'||coalesce(new.lat::text,'')||'|'||coalesce(new.lng::text,'')||'|'||new.origem, 'UTF8')), 'hex');
  return new;
end $$;
drop trigger if exists trg_horas_batidas_hash on public.horas_batidas;
create trigger trg_horas_batidas_hash before insert on public.horas_batidas for each row execute function public.horas_batidas_hash();

alter table public.horas_batidas enable row level security;
alter table public.horas_solicitacoes enable row level security;
alter table public.horas_config enable row level security;
revoke all on public.horas_batidas, public.horas_solicitacoes, public.horas_config from public, anon, authenticated;
revoke all on sequence public.horas_batidas_id_seq, public.horas_solicitacoes_id_seq from public, anon, authenticated;
revoke execute on function public.horas_batidas_bloqueia(), public.horas_batidas_hash() from public, anon, authenticated;

insert into public.horas_config (id, payload) values ('config', jsonb_build_object(
  'cafeConta', true, 'cafeMinutos', 15, 'almocoMinimoMin', 60, 'raioPadraoM', 100, 'precisaoMaxM', 150, 'toleranciaMin', 10,
  'vigencias', jsonb_build_array(
    jsonb_build_object('de','2000-01-01','horasSemana',44,'dias',6,'confirmado',true),
    jsonb_build_object('de','2026-12-15','horasSemana',42,'dias',5,'confirmado',false),
    jsonb_build_object('de','2028-02-15','horasSemana',40,'dias',5,'confirmado',false))
)) on conflict (id) do nothing;
insert into public.horas_config (id, payload) values ('locais', '{}'::jsonb) on conflict (id) do nothing;
