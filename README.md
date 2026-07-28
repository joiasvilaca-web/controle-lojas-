# Controle de Transferências e Reposições

App web para controle de:
- **Transferências** entre lojas (JN, JV, MC) — troca ou saída definitiva, com vistos de saída/entrada/baixa/entrada no estoque.
- **Reposição** de mercadoria — pedido da loja, venda/nota fiscal, disponibilização, recebimento e aprovações (diretoria, administrativo, recebimento na loja, sistema).

## Stack
- Frontend: HTML/CSS/JS puro (`index.html`), sem build necessário.
- Banco de dados: [Supabase](https://supabase.com) (Postgres), tabelas `transferencias_controle` e `reposicao_controle`.
- Hospedagem: [Vercel](https://vercel.com).

## Como rodar localmente
Basta abrir o `index.html` em um navegador, ou servir a pasta com qualquer servidor estático:

```bash
npx serve .
```

## Configuração do Supabase
As credenciais (URL + chave anônima) já estão embutidas no `index.html` (uso interno, protegido por senha nas ações sensíveis: excluir registro e vistos da diretoria).

Tabelas usadas (ver migração aplicada no projeto Supabase):
- `transferencias_controle (id text primary key, payload jsonb, created_at, updated_at)`
- `reposicao_controle (id text primary key, payload jsonb, created_at, updated_at)`

RLS habilitado com policy de acesso liberado (equivalente ao modelo sem login do app).

## Deploy
Publicado no Vercel a partir deste repositório. Qualquer push na branch principal pode ser conectado ao projeto Vercel para deploy automático.
