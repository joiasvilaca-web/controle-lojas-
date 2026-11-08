-- Retirada com código rotativo (09/11): quem retirou, como (rotativo/terceiro/sem_codigo) e trava de tentativas do código rotativo.
alter table public.retiradas_terceiro
  add column if not exists portador_nome text,
  add column if not exists recebido_por text,
  add column if not exists metodo text,
  add column if not exists tent_rot integer not null default 0,
  add column if not exists bloq_ate timestamptz;
