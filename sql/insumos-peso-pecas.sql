-- 18/11/2026 — PESO DAS PEÇAS na Oficina: o peso de entrada de cada item do Pedido soma ao saldo de metal em poder da Oficina
-- (tipo PECA_ENTRADA) e o peso de saída abate (tipo PECA_SAIDA). Lançados pela função insumos-api (op pesoVia / viaAtualizar).
alter table public.insumos_movimentos drop constraint if exists insumos_movimentos_tipo_check;
alter table public.insumos_movimentos add constraint insumos_movimentos_tipo_check
  check (tipo = any (array['COMPRA','ENVIO','ENVIO_FELIPE','RETORNO','CONSUMO','PERDA','AJUSTE','ESTORNO','PECA_ENTRADA','PECA_SAIDA']));
-- prata das peças é 925 (o insumo que existia era só PRATA 1000)
insert into public.insumos (id, payload, ativo)
select 'ins_prata925', jsonb_build_object('nome','PRATA 925','categoria','metal','unidade','g','teor','925'), true
where not exists (select 1 from public.insumos where id = 'ins_prata925');
