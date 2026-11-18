-- 18/11/2026 — AGENDA nos AVISOS: compartilhamento de agenda avisa por 24 h (com Ciente) e a tarefa reaparece 1 dia antes e no dia.
-- `participantes_em` = quando cada participante entrou na tarefa (início das 24 h do aviso); `cientes` = quem já deu ciente do compartilhamento.
alter table public.agenda_tarefas add column if not exists participantes_em jsonb not null default '{}'::jsonb;
alter table public.agenda_tarefas add column if not exists cientes jsonb not null default '{}'::jsonb;
-- tarefas já compartilhadas: o aviso das 24 h conta a partir da criação (não reaparece nada antigo)
update public.agenda_tarefas set participantes_em = (select coalesce(jsonb_object_agg(p, to_jsonb(created_at)), '{}'::jsonb) from unnest(participantes) p) where tipo = 'compartilhada' and participantes_em = '{}'::jsonb;
-- Ciente atômico (um UPDATE só; dois participantes dando ciente ao mesmo tempo não se atrapalham). Só service_role executa.
create or replace function public.agenda_ciente(p_id uuid, p_user text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  update public.agenda_tarefas set cientes = coalesce(cientes, '{}'::jsonb) || jsonb_build_object(p_user, to_jsonb(now())) where id = p_id;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.agenda_ciente(uuid, text) from public, anon, authenticated;
grant execute on function public.agenda_ciente(uuid, text) to service_role;
