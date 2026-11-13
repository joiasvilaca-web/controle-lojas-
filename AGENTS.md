# AGENTS.md — Gestão e Controle · Vilaça Joias

> Cole este arquivo no início de toda conversa sobre o app (geral ou por módulo).
> Cursor: coloque na raiz do repo. Claude: cole como primeira mensagem da sessão.

---

## 0. INSTRUÇÕES MESTRAS (11/11/2026 — ordem do Felipe)

Você é o engenheiro principal do Vilaça App. Português, curto, direto, com links diretos. Autonomia para analisar, corrigir, desenvolver, testar e publicar. Não pergunte o que já está documentado aqui ou na memória.

**Antes de começar:** ler este arquivo (seções 3, 11, 12, 13 e 17); o histórico fica em `docs/HISTORICO.md` (ler só o trecho do assunto, por grep) e a memória `/areas/gestao-e-controle.md`. Ler só o necessário; não reexaminar o projeto inteiro.

**Segurança (sistema em uso real nas lojas):**
- Sem DROP/TRUNCATE/exclusão em massa sem autorização expressa.
- Antes de alterar dados de produção: copiar as linhas afetadas para tabela `bkp_AAAAMMDD_*`, planejar a reversão e validar depois. Compatível com versões anteriores; preservar histórico financeiro.
- Nunca expor senhas/tokens no chat nem colocar segredos no repositório (é público). Nunca digitar credenciais reais em teste/treino pelo navegador.
- Sem custo novo: nenhum serviço, plano ou assinatura paga.
- Login aberto (sem senha) SÓ em treino.vilaca.app.

**Publicação:**
- Produção: publicar sozinho, sem perguntar, depois de testar (seção 11, itens 10 e 11). Mudança destrutiva ou irreversível nos dados reais: confirmar antes.
- **Antes de QUALQUER envio ao GitHub: baixar a `teste` atual e conferir o histórico recente.** Felipe trabalha em várias conversas ao mesmo tempo; o upload do GitHub sobrescreve arquivos de mesmo nome. Nunca partir de cópia antiga nem de zip antigo (vilaca-config-unica, vilaca-atualizacao, atualizacao-ouro). Enviar só os arquivos alterados.
- Caminho 1: git push direto, quando a sessão tiver o repositório autorizado. Caminho 2: extensão do Chrome na aba do GitHub logada (anexar os arquivos em `/upload/teste`, até 10 MB por envio, e Commit). Caminho 3: zip pelo SendUserFile e Felipe sobe os arquivos SOLTOS em https://github.com/joiasvilaca-web/controle-lojas-/upload/teste (só mandar esse link quando ele pedir "enviar para teste").
- Depois do commit: conferir o SHA, `create_deployment` (gitSource, target production), `assign_alias` para teste/treino e verificar via pg_net (o sandbox não alcança vilaca.app).
- Ordem: SQL, edge functions, front-end, dados. Barra invertida em edge function como `\`, conferindo se o conteúdo ficou idêntico.
- Nunca dizer que publicou sem ter confirmado.

**Desenvolvimento:** menor alteração possível, reaproveitando o que existe; corrigir na origem (backend/banco), não só na tela; conferir reflexos em vendas, pedidos, caixa, estoque e crédito; concluído só com evidência de teste (`node tests/run.js` verde).

**Regras de negócio (não alterar sem pedido):** Cartão e LINK ECO = +20%, até 12x. À vista = dinheiro, PIX, ouro, fiado. Caixa conta pela data do pagamento. Diretoria vê todas as lojas; gerente e vendedora só as suas. Ouro excedente vira crédito do cliente.

**WhatsApp:** o disparo automático já está implantado (`docs/HISTORICO.md` seções 20 e 24). Não alterá-lo sem pedido. Em testes, NUNCA fazer envio real a clientes. Não mexer na Evolution API, no número do chatbot, em tokens nem em webhooks ativos. Migração para a API oficial: só análise e preparação até o Felipe autorizar.

**Modelo:** Sonnet para o dia a dia. Avisar o Felipe para trocar para Opus em: migração de banco em produção, mudança que mexe ao mesmo tempo em caixa/crédito/estoque, bug crítico sem causa na primeira tentativa, decisão de arquitetura. Avisar para voltar ao Sonnet depois. O modelo só o Felipe troca.

**Resposta:** curta (seção 11, item 9): só o que depende da ação dele, falhas/limitações e onde verificar; sem descrever o que foi implementado.

---

## 1. Identidade do projeto

Sistema web de gestão multimódulo para a rede de joalherias **Grupo Vilaça Joias**
(Juiz de Fora, MG, Brasil). Projeto piloto em produção real com dados reais.

- **Repo GitHub:** `https://github.com/joiasvilaca-web/controle-lojas-`
- **Upload link:** `https://github.com/joiasvilaca-web/controle-lojas-/upload/main`
- **Hosting:** Vercel (frontend estático)
- **Backend:** Supabase — project ID `wxiokmqnjtgbejgoepch`

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Vanilla HTML + CSS + JavaScript (sem frameworks) |
| Backend / API | Supabase Edge Functions (TypeScript/Deno) |
| Banco de dados | Supabase Postgres |
| Storage | Supabase Storage (bucket `atendimento-midia`) |
| E-mail | Edge Function `send-email-gmail` via Gmail API |
| IA | Gemini API (conta própria do Felipe, quota gratuita) |
| WhatsApp | Evolution API v2.3.7 no Railway (`scintillating-wisdom`) |
| Fotos de produto | Photoroom (primário) + Gemini (fallback) |

**Não usar React, Vue, npm, ou qualquer bundler.** Todo JS é vanilla, sem `import/export` de módulos ES6 (exceto dentro das Edge Functions Deno).

---

## 3. Segurança — NUNCA contornar

- **`db-gateway`** é o único ponto de acesso ao banco. Versão em produção: **v45+**
- RLS ativo em todas as tabelas. Zero `GRANT` para `anon`/`authenticated`
- Funções SQL com `SECURITY DEFINER` têm `EXECUTE` revogado de `public/anon/authenticated`
- O gateway valida sessão (`sessaoValida()`), permissão por módulo e isolamento por loja
- **Nunca acessar tabelas diretamente via anon key** (exceto `gestao_config` leitura básica e legacy)
- Anti-overwrite: `saveConfig` com array vazio de users/lojas retorna HTTP 409
- Tabela protegida `atendimento_segredos`: só service_role

---

## 4. Autenticação e sessões

- Login por **apelido** (ou nome completo se sem apelido) + senha bcrypt
- Servidor gera token de sessão → guardado em `users[].sessoes[]` (até 5 simultâneas)
- Sessão: 12h no servidor, 8h no app (localStorage)
- 6 tentativas erradas → bloqueia usuário (`users[].bloqueado`)
- Desbloquear: botão no DP (só Diretoria)
- Níveis de acesso: `Diretoria` / `Gerente` / `Vendedora` / `Oficina`

---

## 5. Lojas (5 unidades)

| Slug | Nome | Observação |
|---|---|---|
| `loja_mc` | Marechal Center | |
| `loja_jb` | João Beraldo | |
| `loja_jn` | Jardim Norte | |
| `loja_ec` | Ecommerce | |
| `loja_rj` | Reforma Joias | Piloto WhatsApp/Instagram |
| `loja_uc` | Up Case | Parceira externa (só Gravações) |

Cada loja tem cor temática. Login da Up Case abre direto em Gravações.

---

## 6. Arquivos do frontend

| Arquivo | Módulo |
|---|---|
| `index.html` | Shell principal (menu, autenticação, roteamento de módulos via iframe) |
| `vendas.html` | CAIXA › Vendas (PDV) |
| `painel-ordens.html` | Pedido / O.S. |
| `orcamentos.html` | Orçamentos |
| `transferencias-reposicoes.html` | Transferências / Reposições |
| `gravacoes.html` | Gravações (serviço Up Case) |
| `caixa.html` | CAIXA › Resumo do caixa |
| `gastos.html` | Gastos (sub-tela do Caixa) |
| `conciliacao.html` | Conciliação (sub-tela do Caixa) |
| `dashboard.html` | PAINEL › Dashboard (Visão geral com gráficos + relatórios) |
| `ia.html` | Módulo IA (Diretoria/Gerente) |
| `marketing.html` | CAIXA › Aniversário (abas Aniversário + Mala direta, com `?secao=aniversario`). O follow-up de orçamentos foi para a aba Follow-up do `orcamentos.html` |
| `dp.html` | Departamento Pessoal (inclui Funcionários e Perfis de Acesso) |
| `avisos.html` | PAINEL › Avisos (tela inicial pós-login para todos) |
| `atendimento.html` | CHAT: WhatsApp/Instagram + conversas internas na mesma lista + Agenda (tarefas, calendário, minhas vias, assistente) |
| `definir-senha.html` | Página pública de setup de senha (link de convite) |
| `advertencia.html` | Página pública de confirmação de advertência (DP) |
| `insumos.html` | CAIXA › **OFICINA** (cartão; id interno `insumos`): aba Vias (todas as lojas, filtros, leitor de código/câmera, status Oficina pronto, local da peça, observação para a loja, material usado) + Saldos, Lançar, Movimentos, Cadastro de insumos — fala só com a Edge Function `insumos-api` |
| `inventario.html` | CAIXA › **INVENTÁRIO** (cartão; sub `inventario`, iframe `caixa_inventario`, **usa a permissão de Transferências**): relatório de estoque por loja (filtros + CSV/Excel/PDF) e contagem de peças com leitor/câmera — fala só com a Edge Function `inventario-api` |
| `controle-horas.html` | CAIXA › **CONTROLE DE HORAS** (cartão; sub `horas`, iframe `caixa_horas`, permissão `horas`, todos os perfis): registrar entrada/almoço/café/saída pelo celular da loja (GPS), editar dados, registro fora do horário, espelho, equipe, aprovações, relatório, log e configurações — fala só com a Edge Function `horas-api` |
| `reforma-admin.html` | CAIXA › Reforma — módulo interno (fila de pedidos, orçamento, custódia, Gerar O.S.) |
| `reforma.html` | Página pública do cliente da Reforma (envia fotos, aceita orçamento, acompanha pelo link `?t=TOKEN`) |

**`index.html` (shell) só é editado na conversa APP GERAL.**

---

## 7. Estrutura do shell (index.html)

Grupos de menu com abas em `#shellTopTabs`:

| Grupo | Sub-telas | Permissão base |
|---|---|---|
| **PAINEL** (id `dashboard`) | Dashboard · Avisos · IA (abas) — **Dashboard é a aba principal** (abre nela; quem não tem o módulo `dashboard` abre em Avisos, que é de todos) | Avisos: todos; `dashboard` / `ia` |
| **PDV** (id `pdvg`, cartões; 08/11) | Venda · Pedido · Orçamento · Resumo do caixa · Reservar + barra BUSCAR VIA / PREÇO no topo | `vendas` / `os` / `orcamentos` / `caixa` / `reserva` (a barra aparece para quem vende, tem pedido ou orçamento; a Oficina vê a barra no ADM) |
| **ADM** (id `caixa`, cartões; era o CAIXA) | Cancelamento · Transferências · Gravações · Gastos · Conciliação · Reforma · Oficina · Controle de horas · Inventário · Marketing · Código · Outra loja | por sub-tela: `transferencias` / `gravacoes` / `gastos` / `conciliacao` / `reforma` / `insumos` / `horas` / `inventario` / `marketing` … |
| **CHAT** (id `atendimento`) | — | `atendimento` |
| **CONFIGURAÇÕES** (id `config`) | Cadastro · Departamento pessoal (abas) | `config` / `dp` |

- Padrão de texto (28/out): módulos e cartões em CAIXA ALTA; abas só com a 1ª letra maiúscula e sem emoji (`rotuloAba` no shell normaliza o que os módulos mandam). Aba com rótulo repetido não aparece duas vezes.
- O shell marca o `<html>` de cada módulo com `embedded` (`marcarEmbutido`); `tema.css` esconde o `#lojaFaixa` lá dentro (a loja já aparece no cabeçalho).
- Iframes do PDV e do ADM usam a mesma chave `caixa_<sub>` (`chaveIframeSub`): `caixa_pdv`, `caixa_os`, `caixa_orc`, `caixa_transf`, `caixa_grav`, `caixa_resumo`, `caixa_gastos`, `caixa_conciliacao`, `caixa_reforma`, `caixa_aniv` (`marketing.html?secao=aniversario`).

- Loja selecionada: `<select id="shellLojaSelect">` ao lado da logo
- Módulos absorvidos mapeados em `MODULOS_ABSORVIDOS` (ids antigos → grupo+sub)
- `irParaModulo(id, {registroId, tab})` é o único jeito de navegar entre módulos

---

## 8. Edge Functions (Supabase)

| Função | Versão prod | Uso |
|---|---|---|
| `db-gateway` | v54 | Gateway central — TODA leitura/escrita do banco |
| `funcionario-acesso` | v19 | Login, convite, troca de senha, sessões |
| `send-email-gmail` | v8 | E-mail automático (sem modal de composição) |
| `ia-chat` | v17 | Chat IA + análise de imagem (Gemini) |
| `gemini-agente` | v11 | Monitoramento IA (roda 1x/dia no Dashboard) |
| `confirmar-leitura-dp` | v6 | Confirmação de advertência (página pública) |
| `confirmar-leitura-gravacao` | v3 | Confirmação de leitura da via (cliente) |
| `get-gravacao-status` | v4 | Status público da via de gravação |
| `atendimento-webhook` | v3 | Recebe eventos WhatsApp (Evolution) e Instagram |
| `atendimento-api` | v15 (painel) | Todas as ops do módulo Atendimento. 29/out: considera a loja extra da sessão (OUTRA LOJA) |
| `upload-foto-drive` | v23 | Upload de fotos para Google Drive |
| `reforma-api` | v11 (painel) | 29/out: considera a loja extra da sessão (OUTRA LOJA). Todas as ops do módulo Reforma (públicas `public*` sem sessão + internas com `senha`) — v2: multi-itens, frete, WhatsApp Evolution |
| `insumos-api` | v5 | Insumos da Oficina (ouro, prata, cobre, pedras): cadastro, Kardex (`insumos_movimentos`), saldos por loja dona × local (loja/oficina), baixa por via (`consumoVia`), estorno; v2: `vias`/`via`/`viaAtualizar` (a Oficina vê vias de todas as lojas e só mexe em status aguardando⇄oficina_pronto, local da peça e observação). Código em `insumos-api.ts` |
| `site-public` | v5 | API pública dos sites (catálogo/frete/pedidos). Canal `vilaca` (padrão) ou `reforma` (`canal:"reforma"`: config na linha `site_config` id `reforma`, só produtos com `site.lojaId='loja_rj'`; o site da Vilaça nunca mostra peças da Reforma). Código em `site-public.ts` |
| `site-admin` | v5 | API do módulo SITE (produtos, pedidos, config). v3: campos `condicao/estado/historia/garantiaDias` do produto e `salvarConfig` com `canal:'reforma'`. Código em `site-admin.ts` |
| `inventario-api` | v4 | 29/out (v4): considera a loja extra da sessão (OUTRA LOJA). Inventário: `init`/`catalogo`/`iniciar`/`abrir`/`poll`/`ler`/`desfazer`/`concluir`/`ajustar`/`recontagem`/`cancelar`. Código em `inventario-api.ts`. Permissão: módulo `transferencias` (ou diretoria/gerente); só diretoria/gerente ajusta estoque; vendedora só vê as lojas dela |
| `cotacoes-mercado` | — | Cotações (não usa sessão) |
| `agenda-tarefas` | v2 | v2: considera a loja extra da sessão (OUTRA LOJA). Agenda do CHAT: tarefas (tabela `agenda_tarefas`), lembretes pro calendário e "Minhas vias". Código em `agenda-tarefas.ts`. Usa `npm:@supabase/supabase-js@2` (o deploy com `jsr:` estava dando timeout) |

Deploy: **`files` param precisa do conteúdo completo com `name: index.ts`** e `verify_jwt: true` (boolean).

Quando uma Edge Function chama outra internamente, incluir **ambos** os headers:
```
Authorization: Bearer ${SERVICE_ROLE_KEY}
apikey: ${SERVICE_ROLE_KEY}
```

---

## 9. Banco de dados — tabelas principais

| Tabela | Descrição |
|---|---|
| `gestao_config` | Config geral (JSONB, id=`config`). Nunca sobrescrever com vazio |
| `clientes_cadastro` | Cadastro unificado de clientes (22k+ registros) |
| `vendas` | Vendas / PDV |
| `ordens_servico` | Pedidos / O.S. |
| `orcamentos` | Orçamentos |
| `dp_registros` | Fichas de RH (Departamento Pessoal) |
| `gravacoes_kv` | KV do módulo Gravações |
| `estoque_movimentos` | Kardex (movimentos de estoque) |
| `atendimento_conversas` | Conversas WhatsApp/Instagram |
| `atendimento_mensagens` | Mensagens individuais |
| `atendimento_segredos` | Segredos protegidos (só service_role) |
| `painel_ordens_kv` | KV do módulo O.S. |
| `ia_memoria` | Memória do módulo IA |
| `reforma_pedidos` | Pedidos de reforma (colunas reais: `numero` bigserial, `token`, `status`, `loja_id`, `telefone_digits` + `payload`) |
| `insumos` | Cadastro de insumos da Oficina (`id`, `payload` {nome, categoria metal/pedra/outro, unidade g/ct/un, teor, origemPedra, dimensoes, peso, quilates, ncm, custoRef}, `ativo`) |
| `insumos_movimentos` | Kardex dos insumos: `insumo_id`, `loja_id` (dona fiscal), `local` loja/oficina, `tipo` COMPRA/ENVIO/RETORNO/CONSUMO/PERDA/AJUSTE/ESTORNO, `quantidade` (com sinal), `valor_unit`, `os_id`, `codigo_via`, `finalidade` servico/fabricacao, `ref_id`, `payload` (por, obs, fiscal da compra, par) |
| `insumos_contagens` | Contagem real da Oficina por metal: `quantidade_real`, `saldo_sistema` (bruto na data), `quebra_padrao_pct` (vigente na data), `acertada`. A quebra padrão global fica em `insumos` id `_config` (`quebraPadraoPct`, padrão 5) |
| `inventarios` | Contagens de estoque (`id`, `loja_id`, `nome`, `status` em_andamento/concluido/cancelado, `cego`, `payload` {itens:[{produtoId, esperado}] = foto do saldo no início, relatorio (congelado ao concluir), ajustes}). RLS, sem GRANT |
| `inventario_leituras` | Cada leitura/digitação da contagem (`seq`, `inventario_id`, `codigo`, `qtd`, `cid` único por inventário = não duplica em reenvio, `por`, `anulada`). A classificação (verde/vermelho) nunca é gravada: é derivada |
| `reforma_config` | Config do módulo Reforma (id=`config`: lojas públicas, endereços, serviços, textos, mensagens WhatsApp) |

**Tabelas KV** têm colunas `key`/`value`. Acesso via `kvGet`/`kvSet` no db-gateway (não anon direto).

**JSONB:** usar `payload->>'campo'` em queries SQL.

**Storage:** buckets privados `atendimento-midia` e `reforma-fotos` (fotos do cliente/custódia da Reforma — sempre via signed URL gerada pela Edge Function, nunca URL pública).

---

## 10. Padrões de código obrigatórios

### Texto
```js
// Maiúscula automática ao salvar
function maiusc(str) {
  return str ? str.toUpperCase() : str;
}
```

### Telefone
```
Formato: (XX) XXXXX-XXXX
DDD separado. 9 dígitos. Valida completo ou vazio.
Fixo: 8 dígitos → (XX) XXXX-XXXX
```

### Carregamento de listas
**Nenhuma lista ou relatório carrega automaticamente ao abrir.**
O filtro começa recolhido. Conteúdo só aparece após o usuário apertar o botão de busca/filtro.

### Numeração de vias
Sequência: `LOJA+NÚMERO+TIPO` (ex: `MC1P`). Via `bumpCodigoViaSequence` no gateway.

### Código de autorização (O.S.)
Quando vendedora sobrescreve data sugerida → aciona fluxo de código de autorização validado em tempo real (Oficina/Diretoria).

---

## 11. Regras de entrega (para Claude e Cursor)

1. **Nunca reescrever arquivo inteiro** sem necessidade — fazer edição cirúrgica no trecho exato
2. **Reclone o repo antes de cada edição** — não confiar em memória/cache
3. **Nunca remover feature não mencionada no pedido**
4. **Avisar antes de codar** se a mudança afetar: schema do banco, roteamento Vercel, outro arquivo não mencionado
5. **Verificar se já existe** antes de reimplementar
6. **Se for só backend** (Edge Function): avisar que não precisa subir nada no GitHub
7. **Validar JS** com `node --check arquivo.html` antes de entregar
8. **Sempre entregar** arquivo completo + link: `https://github.com/joiasvilaca-web/controle-lojas-/upload/main`
10. **Publicação (08/11, ordem do Felipe):** depois de testar no branch `teste`, **sempre publicar também na versão oficial** (servidor antes da tela quando houver mudança de banco/função; depois merge `teste` → `main`) sem perguntar de novo, e avisar no fim. Exceção: mudança destrutiva ou irreversível nos dados reais — aí confirmar antes.
11. **Testes de regressão (10/11, ordem do Felipe):** todo bug corrigido ganha um teste em `tests/regressao/` (precisa falhar com o bug e passar com a correção); os testes são **mantidos para sempre** (nunca apagar/enfraquecer para ficar verde); rodar `node tests/run.js` antes de publicar — vermelho = não publica. Detalhes e como escrever: `tests/LEIA-ME.md`.
9. **Resposta ao Felipe (29/out):** não descrever o que foi implementado. Responder só com o que depende da ação dele para finalizar, ou com falhas/limitações encontradas.
12. **Retroagir (12/11, ordem do Felipe):** toda mudança que afeta dado gravado (cadastro de cliente, via, saldo, caixa) deve ser aplicada também aos registros ANTIGOS, com backup antes (`bkp_AAAAMMDD_*`), e informar o que não pôde ser corrigido.

---

## 12. Convenção de conversas (Claude)

Cada conversa é **escopada a um único módulo**:

| Conversa | Escopo |
|---|---|
| `APP GERAL` | Shell index.html, assuntos transversais, novos módulos |
| `APP VENDAS` | vendas.html (PDV) |
| `APP OS` | painel-ordens.html |
| `APP ORCAMENTO` | orcamentos.html |
| `APP TRANSFERENCIAS` | transferencias-reposicoes.html |
| `APP CAIXA` | caixa.html + gastos.html + conciliacao.html |
| `APP GRAVACOES` | gravacoes.html |
| `APP DASHBOARD` | dashboard.html |
| `APP IA` | ia.html |
| `APP MARKETING` | marketing.html |
| `APP DP` | dp.html |
| `APP CADASTRO` | Trecho Cadastro dentro do index.html |
| `APP ATENDIMENTO` | atendimento.html |
| `APP REFORMA` | reforma-admin.html + reforma.html + Edge Function reforma-api |

**Antes de qualquer ação:** verificar se o app foi atualizado em outra conversa paralela (Felipe trabalha em múltiplas conversas ao mesmo tempo).

---

## 13. Pendências em aberto

- [ ] SQL de segurança aguardando aprovação do Felipe: `search_path` fixo nas funções `registrar_movimento_estoque`, `incrementar_via_sequence`, `liberar_via_sequence`, `abrev_para_loja_id`, `temp_sigla_loja`; revogar EXECUTE de `temp_sigla_loja` pro anon; ligar RLS em `clientes_backup_pre_limpeza_20260914` e `vendas_backup_pre_limpeza_20260914`
- [ ] Railway: upgrade pro Hobby pendente (cartão deu erro em 14/set) — trial vence ~12/out
- [x] Chave Evolution API trocada em 30/out (Railway `AUTHENTICATION_API_KEY` + tabela `atendimento_segredos`). **Pendente (Felipe):** apagar o segredo antigo `EVOLUTION_API_KEY` em Supabase › Edge Functions › Secrets (as funções ignoram esse segredo e leem só a tabela)
- [ ] `venda-pg.html` e `pg-mes.html`: deletar manualmente no GitHub
- [ ] NFC-e/NF-e: aguardando certificado A1 + orientação do contador
- [x] Modelo multiloja: implementado em 29/out (ver lição 31)
- [ ] O.S.: migração para o catálogo novo de produtos (hoje usa `produtosOtica` legado)
- [ ] Instagram Atendimento: falta vincular conta da Reforma ao app Meta e gerar token
- [ ] Reforma: Oficina fica com o módulo desligado por padrão (para não aparecer no login da Up Case) — liberar por usuário no DP se a oficina for fazer o check-out
- [x] **Segurança (30/out):** `BOT_TOKEN` e `WEBHOOK_TOKEN` não estão mais no código: ficam em `atendimento_segredos` (chaves `BOT_TOKEN`, `WEBHOOK_TOKEN`, geradas aleatórias), lidos por `tokenInterno()` com cache de 60 s; o pg_cron job 2 (`atendimento-tick`) lê o token da tabela. Tokens antigos recusados (401). `atendimento-diag` e `ig-token-exchange` viraram stub 410. **Ainda no código público (risco baixo):** `VERIFY_TOKEN` do WhatsApp Cloud e `IG_VERIFY_TOKEN` (handshake da Meta; trocar exige mudar no painel da Meta). Ainda no código publicado (não está no repo): `SETUP_TOKEN` (`atendimento-pessoal-setup`) e `CRON_TOKEN` (`atendimento-lembretes-scheduler` + pg_cron job 4)
- [ ] Apagar no painel do Supabase as funções desativadas (devolvem 410): `site-public-teste`, `db-gateway-teste`, `atendimento-diag`, `atendimento-rotacao`, `ig-token-exchange`, `site-import-tray`, e as ~30 `bi4cia-*` (esta última só se Felipe quiser; o bi4cia foi preservado a pedido)
- [ ] Reforma: Felipe já tem contrato com os Correios, mas ainda não configurou as credenciais (usuário do Meu Correios, código de acesso à API do CWS, número do cartão de postagem) em Configurações do módulo — enquanto isso, `frete.provider` fica em `"tabela"` (valores fixos por faixa)

---

## 14. Contatos do ambiente

- **Supabase project:** `wxiokmqnjtgbejgoepch`
- **Railway projeto:** `scintillating-wisdom` (Evolution API)
- **Evolution API URL:** `https://evolution-api-production-951d.up.railway.app`
- **Instância WhatsApp:** `reformajoias` (canal Baileys)
- **Meta App:** "Atendimento Reforma Joia" (id `2230560377789265`)
- **GitHub org:** `joiasvilaca-web`

---

## 17. Ambiente de TREINO/TESTE (4/nov/2026)

Um só código (mesmo repo, mesmo projeto Vercel `vilaca-controle-lojas`), três endereços. O banco é escolhido pelo endereço em `supabase-config.js`:

- `vilaca.app` (e `www`) → banco REAL `wxiokmqnjtgbejgoepch`. Nada mudou.
- `treino.vilaca.app` e `teste.vilaca.app` → banco de TESTE `mpgkvstzigeaimuynpxc` (projeto "VILACA TESTE", organização grátis "VILACA TESTE", região us-west-2, custo zero). Faixa fixa no rodapé (verde = TREINAMENTO, marrom = TESTE). Qualquer host `teste.*`, `treino.*` ou `*-teste.*` cai no teste.
- DNS: `vilaca.app` está no DNS da Vercel com `*` ALIAS; subdomínio novo só precisa ser adicionado ao projeto (`add_project_domain`), sem mexer em DNS.

Regras de código para TODA edição futura:
- Tela nova nunca escreve URL/chave do Supabase fixa: usar `window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY`. Link que vai para o cliente usa `window.APP_URL` (real = `https://vilaca.app`; treino/teste = o próprio endereço).
- `index.html` desliga `atendimento`, `site`, `ia` e `reforma` fora da produção (`MODULOS_DESLIGADOS_FORA_DA_PRODUCAO`, dentro de `permissoesDoUsuario`). Nada do treino pode falar com o mundo de fora (WhatsApp, e-mail, Drive, IA).
- A chave anon do teste fica no `supabase-config.js` (pública por natureza, como a do real). Ao digitar chave nova: provar contra o servidor (pg_net) e comparar sha256 — chave errada derruba o login do endereço.

Banco de teste:
- Mesmas tabelas, funções e gatilhos do real + 15 edge functions: `db-gateway`, `trocar-usuario`, `autorizar-gestor`, `entrar-como`, `meus-dados`, `termos-uso`, `funcionario-acesso` (link de convite aponta para o treino), `estoque-api`, `caixa-resumo` (sem WhatsApp: devolve `desligado`), `retirada-terceiro`, `reservas-api`, `agenda-tarefas`, `lancamentos-api`, `inventario-api`, `insumos-api`.
- NÃO publicadas no teste de propósito (falam com o exterior ou são de outros apps): `send-email-gmail`, `upload-foto-drive`, `backup-*`, `atendimento-*`, `ia-chat`, `gemini-agente`, `reforma-api`, `site-*`, `crm-api`, `cotacoes-mercado`, `bi4cia-*`, `confirmar-leitura-*`. Chamar uma delas no teste dá 404 (inofensivo).
- Dados: cópia ANONIMIZADA (clientes com nome, telefone e CPF inventados; produtos e estoque reais; configuração com as lojas + a loja `loja_tr` TREINAMENTO). A função `treino-export` no REAL só entrega dado já anonimizado, protegida por chave (no real fica só o hash); o teste puxa por pg_net.
- Logins de treino: `TREINO GERENTE`, `TREINO VENDEDORA 1`, `TREINO VENDEDORA 2` (loja TREINAMENTO) e `TREINO OFICINA` (loja OFICINA). A senha combinada com o Felipe não fica neste arquivo (repo público). O primeiro acesso com senha padrão foi desligado (seção 18): quem estiver sem senha no teste recebe a senha inicial da diretoria no DP.
- Mudou função ou tabela no REAL? Repetir no TESTE (mesmo código; a única diferença é o `APP_BASE_URL` da `funcionario-acesso`).

Manutenção:
- Projeto grátis pausa após ~7 dias sem uso. O pg_cron do REAL tem o job `treino-mantem-acordado` (todo dia 09:23 UTC) que dá um toque no `db-gateway` do teste. Se pausar mesmo assim: `restore_project` pelo conector "Supabase Teste".
- O conector MCP "Supabase Teste" é separado do "Supabase" (real): uma organização por conector.


---

## Histórico detalhado → `docs/HISTORICO.md`

As seções 15 a 26 (menos a 17 acima) foram movidas, sem alteração, para **`docs/HISTORICO.md`**. Não leia o arquivo inteiro: use `grep -n "palavra" docs/HISTORICO.md`. Mapa:

| Seção | Assunto | Procure por |
|---|---|---|
| 15 | Lições e decisões de set–nov/2026 (shell, clientes, fiscal, Oficina, Inventário, multiloja, LOG, caixa, Pedido/Orçamento/Venda, Marketing, fila de disparo, 12/11) | data (ex.: `10/11 (36)`) ou módulo |
| 16 | Módulo Reforma v2 | `reforma` |
| 18 | Versão de 4/nov (LINK ECO, vendedora = gerente, funções `cfg_*`) | `cfg_`, `LINK ECO` |
| 19 | Ouro, nota de entrada, login do teste | `ouro`, `login-teste` |
| 20 | WhatsApp automático da via, Evolution, fila | `enviar-via`, `marketing-disparo` |
| 21 | Controle de horas | `horas-api` |
| 22 | PDV × ADM | `pdvg` |
| 23 | Código rotativo de retirada, cashback, Ciente, avaliações, orçamento automático | `retirada-terceiro` |
| 24 | WhatsApp pela API oficial da Meta | `disparo-cloud`, `meta-modelos` |
| 25 | Modelos WhatsApp e custos da Meta | `modelos-api` |
| 26 | Auditoria técnica de 11/11 e pendências | `Pendente desta auditoria` |

Ao concluir uma mudança relevante, acrescente uma linha **no fim de `docs/HISTORICO.md`** (não aqui).
