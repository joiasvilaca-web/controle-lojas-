-- Ajustes de segurança do banco (Supabase > SQL Editor > colar e Run). Não apaga nada.
alter function public.registrar_movimento_estoque(text, text, text, numeric, text, text, text) set search_path = public, pg_temp;
alter function public.incrementar_via_sequence(text) set search_path = public, pg_temp;
alter function public.liberar_via_sequence(text, integer) set search_path = public, pg_temp;
alter function public.abrev_para_loja_id(text) set search_path = public, pg_temp;
alter function public.temp_sigla_loja(text) set search_path = public, pg_temp;
revoke execute on function public.temp_sigla_loja(text) from public, anon, authenticated;
alter table public.clientes_backup_pre_limpeza_20260914 enable row level security;
alter table public.vendas_backup_pre_limpeza_20260914 enable row level security;
