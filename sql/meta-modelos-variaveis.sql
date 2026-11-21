-- 22/11/2026: modelos com variável a mais (pós-venda e aniversário levam o texto configurado) e botão do Google com link da LOJA.
-- Cópia antes: bkp_20261122_meta_modelos. O envio (disparo-cloud v9 / acompanhamento-auto v23) manda só as variáveis do modelo ATIVO,
-- então mudar `variaveis` aqui só libera a tela a enviar uma versão nova com {{2}}; nada muda no envio até a Meta aprovar.
create table if not exists bkp_20261122_meta_modelos as select * from meta_modelos;
alter table bkp_20261122_meta_modelos enable row level security;
revoke all on bkp_20261122_meta_modelos from anon, authenticated;

alter table meta_modelos add column if not exists botao_dinamico boolean not null default false;
alter table meta_modelos add column if not exists rascunho_botao_dinamico boolean not null default false;

update meta_modelos set
  variaveis = '["Nome do cliente","Texto do pós-venda (Configurações do pós-venda automático)"]'::jsonb,
  exemplos  = '["Ana","Queremos agradecer a oportunidade de fazer parte de um momento especial através da sua nova joia. Estamos à sua disposição."]'::jsonb,
  extras    = '[{"type":"FOOTER","text":"Equipe Vilaça Joias"},{"type":"BUTTONS","buttons":[{"type":"URL","text":"Avaliar no Google","url":"https://g.page/r/{{1}}","example":"https://g.page/r/CROryIy-tHyXEBM/review"}]}]'::jsonb,
  atualizado_em = now()
where chave = 'posvenda';

update meta_modelos set
  variaveis = '["Nome do cliente","Mensagem de aniversário (Marketing)"]'::jsonb,
  exemplos  = '["Maria","É um prazer ter você como cliente da Vilaça Joias. Agradecemos pela confiança e preferência."]'::jsonb,
  atualizado_em = now()
where chave = 'aniversario';
