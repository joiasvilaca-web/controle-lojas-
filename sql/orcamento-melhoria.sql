-- 18/11/2026 — Orçamento recusado: "o que podemos melhorar?" (resposta do cliente fica em orcamentos.payload.melhoria).
-- Gravação ATÔMICA (um UPDATE só, sem ler-e-reescrever o payload inteiro: se a loja salvar o orçamento no mesmo instante, nada se perde).
-- Só service_role executa (a Edge Function retirada-terceiro). RLS segue ligado; sem GRANT para anon/authenticated.
create or replace function public.orc_melhoria_gravar(p_id text, p_obj jsonb, p_so_se_vazio boolean default false)
returns boolean language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  if p_obj is null or jsonb_typeof(p_obj) <> 'object' then raise exception 'objeto invalido'; end if;
  update public.orcamentos
     set payload = jsonb_set(payload, '{melhoria}', case when p_so_se_vazio then p_obj else coalesce(payload->'melhoria', '{}'::jsonb) || p_obj end, true),
         updated_at = now()
   where id = p_id and (not p_so_se_vazio or payload->'melhoria' is null);
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.orc_melhoria_gravar(text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.orc_melhoria_gravar(text, jsonb, boolean) to service_role;
