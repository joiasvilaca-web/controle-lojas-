-- 24/11/2026 (varredura) — migration "estoque_mov_tipos_pedido" (aplicada no REAL e no TESTE).
-- A baixa do Pedido ENTREGUE (VENDA_PEDIDO) e a devolução de pedido baixado (CANCELAMENTO_PEDIDO) eram
-- recusadas por esta trava: nenhuma entrega de pedido tinha baixado o estoque desde 28/10.
alter table public.estoque_movimentos drop constraint if exists estoque_movimentos_tipo_movimento_check;
alter table public.estoque_movimentos add constraint estoque_movimentos_tipo_movimento_check
  check (tipo_movimento = any (array['VENDA','CANCELAMENTO_VENDA','TRANSF_SAIDA','TRANSF_ENTRADA','REPOSICAO_ENTRADA',
    'AJUSTE_INVENTARIO','ENTRADA_OURO_TROCA','CRIACAO_INICIAL','VENDA_PEDIDO','CANCELAMENTO_PEDIDO']));
