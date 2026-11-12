-- via-ciente-append.sql — auditoria de 11/11/2026
--
-- PROBLEMA: a ação pública `ciente` da Edge Function `retirada-terceiro` gravava o payload
-- INTEIRO da via de volta (ler → alterar → escrever), sem trava. O "Ciente" é o portão de
-- entrada do link do cliente (seção 23, item 08/11 (10)), então isso acontece em TODA abertura
-- da via. Se a loja salvasse a mesma via dentro da janela de ~50 ms entre a leitura e a escrita,
-- uma das duas gravações era perdida em silêncio — inclusive um pagamento recém-lançado.
-- A coincidência não é exótica: no balcão, o cliente abre o link enquanto a vendedora
-- lança o pagamento da mesma via.
--
-- SOLUÇÃO: `via_ciente_append` faz o acréscimo numa só instrução UPDATE. O Postgres trava a
-- linha e avalia a expressão sobre a versão corrente, então nada além de `payload->leituras`
-- é tocado. A função é SECURITY DEFINER com EXECUTE revogado de public/anon/authenticated
-- (só o service_role das Edge Functions chama).
--
-- Aplicada no REAL e no TESTE (migration `via_ciente_append_atomico`).
-- Reverter: drop function public.via_ciente_append(text,text,jsonb);
--           drop function public._ultimos_jsonb(jsonb,int);
-- A função da Edge tem fallback: se a RPC falhar, ela volta ao modo antigo e o cliente
-- nunca fica sem o Ciente.

create or replace function public._ultimos_jsonb(arr jsonb, n int)
returns jsonb
language sql
immutable
set search_path to ''
as $f$
  select case
    when arr is null or jsonb_typeof(arr) <> 'array' then '[]'::jsonb
    when jsonb_array_length(arr) <= n then arr
    else (select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
            from jsonb_array_elements(arr) with ordinality as t(e, ord)
           where t.ord > jsonb_array_length(arr) - n)
  end
$f$;

create or replace function public.via_ciente_append(p_tabela text, p_id text, p_evento jsonb)
returns boolean
language plpgsql
security definer
set search_path to ''
as $f$
declare n int;
begin
  if p_tabela not in ('ordens_servico', 'vendas_pdv', 'orcamentos', 'reservas') then
    raise exception 'tabela nao permitida: %', p_tabela;
  end if;
  if p_evento is null or jsonb_typeof(p_evento) <> 'object' then
    raise exception 'evento invalido';
  end if;
  execute format(
    'update public.%I set payload = jsonb_set(payload, ''{leituras}'','
    || ' public._ultimos_jsonb(coalesce(payload->''leituras'', ''[]''::jsonb) || jsonb_build_array($2), 300), true),'
    || ' updated_at = now() where id = $1', p_tabela)
    using p_id, p_evento;
  get diagnostics n = row_count;
  return n > 0;
end
$f$;

revoke all on function public._ultimos_jsonb(jsonb, int) from public;
revoke all on function public._ultimos_jsonb(jsonb, int) from anon;
revoke all on function public._ultimos_jsonb(jsonb, int) from authenticated;
revoke all on function public.via_ciente_append(text, text, jsonb) from public;
revoke all on function public.via_ciente_append(text, text, jsonb) from anon;
revoke all on function public.via_ciente_append(text, text, jsonb) from authenticated;

-- ---------------------------------------------------------------------------
-- PROVA (rodar SÓ no banco de TESTE; escreve e desfaz numa via de treinamento).
-- Troque o id pela via de teste que quiser usar.
-- Resultado esperado:
--   antigo (payload inteiro)   | alteracao_da_loja_sobreviveu = false  <- o bug
--   novo (via_ciente_append)   | alteracao_da_loja_sobreviveu = true   <- corrigido
-- ---------------------------------------------------------------------------
-- create or replace function pg_temp.prova_corrida() returns table(cenario text, alteracao_da_loja_sobreviveu boolean, ciente_sobreviveu boolean)
-- language plpgsql as $$
-- declare p0 jsonb; vid text := 'ord_mw88czb2w121a';
-- begin
--   update ordens_servico set payload = (payload - 'obsAuditoria') || jsonb_build_object('leituras','[]'::jsonb) where id = vid;
--
--   -- CENÁRIO 1: padrão ANTIGO (ler → a loja salva no meio → gravar o payload inteiro que foi lido)
--   select payload into p0 from ordens_servico where id = vid;                                                     -- cliente abre o link
--   update ordens_servico set payload = p0 || jsonb_build_object('obsAuditoria','a loja salvou') where id = vid;    -- loja salva
--   update ordens_servico set payload = jsonb_set(p0, '{leituras}', jsonb_build_array(jsonb_build_object('ciente',true))) where id = vid;  -- cliente toca Ciente
--   return query select 'antigo (payload inteiro)',
--                       (select payload ? 'obsAuditoria' from ordens_servico where id = vid),
--                       (select jsonb_array_length(coalesce(payload->'leituras','[]'::jsonb)) > 0 from ordens_servico where id = vid);
--
--   -- CENÁRIO 2: padrão NOVO (RPC atômica), mesma ordem de eventos
--   update ordens_servico set payload = (payload - 'obsAuditoria') || jsonb_build_object('leituras','[]'::jsonb) where id = vid;
--   select payload into p0 from ordens_servico where id = vid;
--   update ordens_servico set payload = p0 || jsonb_build_object('obsAuditoria','a loja salvou') where id = vid;
--   perform public.via_ciente_append('ordens_servico', vid, jsonb_build_object('ciente', true));
--   return query select 'novo (via_ciente_append)',
--                       (select payload ? 'obsAuditoria' from ordens_servico where id = vid),
--                       (select jsonb_array_length(coalesce(payload->'leituras','[]'::jsonb)) > 0 from ordens_servico where id = vid);
--
--   update ordens_servico set payload = (payload - 'obsAuditoria' - 'leituras') where id = vid;   -- devolve a via ao estado limpo
-- end $$;
-- select * from pg_temp.prova_corrida();
