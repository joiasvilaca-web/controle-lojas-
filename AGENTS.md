# AGENTS.md — Gestão e Controle · Vilaça Joias

> Cole este arquivo no início de toda conversa sobre o app (geral ou por módulo).
> Cursor: coloque na raiz do repo. Claude: cole como primeira mensagem da sessão.

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
| `reforma-admin.html` | CAIXA › Reforma — módulo interno (fila de pedidos, orçamento, custódia, Gerar O.S.) |
| `reforma.html` | Página pública do cliente da Reforma (envia fotos, aceita orçamento, acompanha pelo link `?t=TOKEN`) |

**`index.html` (shell) só é editado na conversa APP GERAL.**

---

## 7. Estrutura do shell (index.html)

Grupos de menu com abas em `#shellTopTabs`:

| Grupo | Sub-telas | Permissão base |
|---|---|---|
| **PAINEL** (id `dashboard`) | Avisos · Dashboard · IA (abas) | Avisos: todos; `dashboard` / `ia` |
| **CAIXA** (id `caixa`, cartões) | Vendas · Pedido · Orçamento · Transferências · Gravações · Resumo do caixa · Gastos · Conciliação · Reforma · Aniversário | por sub-tela: `vendas` / `os` / `orcamentos` / `transferencias` / `gravacoes` / `caixa` / `gastos` / `conciliacao` / `reforma` / `marketing` |
| **CHAT** (id `atendimento`) | — | `atendimento` |
| **CONFIGURAÇÕES** (id `config`) | Cadastro · Departamento pessoal (abas) | `config` / `dp` |

- Padrão de texto (28/out): módulos e cartões em CAIXA ALTA; abas só com a 1ª letra maiúscula e sem emoji (`rotuloAba` no shell normaliza o que os módulos mandam). Aba com rótulo repetido não aparece duas vezes.
- O shell marca o `<html>` de cada módulo com `embedded` (`marcarEmbutido`); `tema.css` esconde o `#lojaFaixa` lá dentro (a loja já aparece no cabeçalho).
- Iframes do CAIXA: `caixa_pdv`, `caixa_os`, `caixa_orc`, `caixa_transf`, `caixa_grav`, `caixa_resumo`, `caixa_gastos`, `caixa_conciliacao`, `caixa_reforma`, `caixa_aniv` (`marketing.html?secao=aniversario`).

- Loja selecionada: `<select id="shellLojaSelect">` ao lado da logo
- Módulos absorvidos mapeados em `MODULOS_ABSORVIDOS` (ids antigos → grupo+sub)
- `irParaModulo(id, {registroId, tab})` é o único jeito de navegar entre módulos

---

## 8. Edge Functions (Supabase)

| Função | Versão prod | Uso |
|---|---|---|
| `db-gateway` | v50 | Gateway central — TODA leitura/escrita do banco |
| `funcionario-acesso` | v19 | Login, convite, troca de senha, sessões |
| `send-email-gmail` | v8 | E-mail automático (sem modal de composição) |
| `ia-chat` | v17 | Chat IA + análise de imagem (Gemini) |
| `gemini-agente` | v11 | Monitoramento IA (roda 1x/dia no Dashboard) |
| `confirmar-leitura-dp` | v6 | Confirmação de advertência (página pública) |
| `confirmar-leitura-gravacao` | v3 | Confirmação de leitura da via (cliente) |
| `get-gravacao-status` | v4 | Status público da via de gravação |
| `atendimento-webhook` | v3 | Recebe eventos WhatsApp (Evolution) e Instagram |
| `atendimento-api` | v4 | Todas as ops do módulo Atendimento |
| `upload-foto-drive` | v23 | Upload de fotos para Google Drive |
| `reforma-api` | v2 | Todas as ops do módulo Reforma (públicas `public*` sem sessão + internas com `senha`) — v2: multi-itens, frete, WhatsApp Evolution |
| `insumos-api` | v4 | Insumos da Oficina (ouro, prata, cobre, pedras): cadastro, Kardex (`insumos_movimentos`), saldos por loja dona × local (loja/oficina), baixa por via (`consumoVia`), estorno; v2: `vias`/`via`/`viaAtualizar` (a Oficina vê vias de todas as lojas e só mexe em status aguardando⇄oficina_pronto, local da peça e observação). Código em `insumos-api.ts` |
| `cotacoes-mercado` | — | Cotações (não usa sessão) |
| `agenda-tarefas` | v1 | Agenda do CHAT: tarefas (tabela `agenda_tarefas`), lembretes pro calendário e "Minhas vias". Código em `agenda-tarefas.ts`. Usa `npm:@supabase/supabase-js@2` (o deploy com `jsr:` estava dando timeout) |

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
9. **Resposta ao Felipe (29/out):** não descrever o que foi implementado. Responder só com o que depende da ação dele para finalizar, ou com falhas/limitações encontradas.

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
- [ ] Chave Evolution API precisa ser trocada (Railway Variables + tabela `atendimento_segredos`)
- [ ] `venda-pg.html` e `pg-mes.html`: deletar manualmente no GitHub
- [ ] NFC-e/NF-e: aguardando certificado A1 + orientação do contador
- [ ] Modelo multiloja (loja do select vira contexto fixo): desenhado, não implementado
- [ ] O.S.: migração para o catálogo novo de produtos (hoje usa `produtosOtica` legado)
- [ ] Instagram Atendimento: falta vincular conta da Reforma ao app Meta e gerar token
- [ ] Reforma: Oficina fica com o módulo desligado por padrão (para não aparecer no login da Up Case) — liberar por usuário no DP se a oficina for fazer o check-out
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

## 15. Lições de 23/set (auditoria geral)

- Edições anteriores apagaram blocos inteiros sem perceber (ex.: commit de 17/set no painel-ordens levou impressão e fotos). **Antes de entregar, rodar a varredura de "função chamada e não definida"** em todo arquivo editado, e comparar a lista de funções com a versão anterior.
- Bibliotecas externas só entram na tela que realmente usa: o SDK do Supabase ficou só onde é chamado (index, painel-ordens, gravacoes, dp); XLSX é carregado sob demanda no index (`carregarXLSX()`).
- `sw.js` v2: bibliotecas de CDN e imagens vêm do cache (stale-while-revalidate); HTML sempre da rede.
- A logo da tela de login virou arquivo (`logo-vilaca.png`), não base64.
- 24/set: `db-gateway` v50 — `selectAll` pagina de 1000 em 1000 (antes o Supabase cortava em 1000 linhas e sumiam os registros mais novos).
- 24/set: o mesmo commit de 17/set (`ba04bba`) também quebrou o `orcamentos.html`: colou uma cópia antiga da tela de Novo Orçamento dentro de `abrirSeletorCliente` e apagou os botões Confirmar/Cancelar do modal de cliente. Restaurado a partir do `87dc6fc`. Ao revisar qualquer arquivo, conferir se as funções fecham onde deveriam (função de 90 linhas que vira 300 é sinal de colagem errada).
- Dashboard: metas gravadas com `mergeConfigKey` na chave `metasMensais` (nunca mais `saveConfig` da config inteira).
- Marketing: aba Orçamentos carrega sob demanda (`carregarOrcamentosSeNecessario`).
- 28/out: Avisos e Dashboard viraram um módulo só, **PAINEL** (id interno continua `dashboard`; `avisos` virou sub-tela `dashboard_avisos`, mapeada em `MODULOS_ABSORVIDOS`). PAINEL não tem tela de cartões: abre sempre em Avisos. Dashboard ganhou a seção **Visão geral** (`renderVisaoGeral`, gráficos em SVG puro, só diretoria/gerente).
- 28/out (2): CUPOM + Caixa + Reforma + Aniversário viraram o módulo CAIXA; Administração → CONFIGURAÇÕES; Atendimento → CHAT. Marketing dividido (Aniversário/Mala direta no CAIXA; follow-up de orçamentos na aba Follow-up do Orçamento, com contador de atrasados). Abas padronizadas e sem repetição; `orcamentos.html` tinha um `@media` sem fechar que deixava a barra escura duplicada aparecer.
- 28/out (2): Chat interno entra na lista principal do CHAT (etiqueta azul "Interno"); o botão Interno só inicia conversa. Agenda virou quadro de tarefas (privada/loja/compartilhada, cores por tipo, classificação), calendário e Minhas vias.
- 28/out (3): Chat interno pode ser finalizado por cada participante (`atendimento_interno_leituras.finalizada_em`; aba Finalizadas; mensagem nova reabre). `atendimento-chat` v3, código em `atendimento-chat.ts`. Barra lateral: abre ao passar o mouse (classe `.aberta`, empurra o conteúdo), não recolhe ao clicar, só quando o mouse sai pelo lado do conteúdo; itens na mesma altura aberta/fechada. Pop-ups não fecham mais ao clicar fora (só pelos botões).
- 28/out (4): **Grupo Vilaça** — conversa coletiva fixa no topo do CHAT (chave `g:vilaca`, `destino_tipo` `grupo`, todos veem, não finaliza). `atendimento-chat` v4. Mensagem interna toca um aviso curto estilo WhatsApp (`tocarSomInterno`); enquanto o CHAT não foi aberto, o shell consulta o `atendimento-chat` a cada 15s (`pollChatInternoShell`) e avisa em qualquer módulo. O sino 🔔 do CHAT (`atd_aviso`) liga/desliga o som.
- 28/out (5): Chat interno aceita foto e arquivo (📎, colar imagem ou arrastar; até 15 MB). Arquivo vai pro bucket privado `atendimento-midia`, pasta `interno/<chave>/`; colunas `anexo_path/anexo_tipo/anexo_nome/anexo_tamanho` em `atendimento_interno`; link temporário pela op `anexoUrl` (`atendimento-chat` v5).
- 28/out (6): a tabela `atendimento_interno` tinha CHECK em `destino_tipo` (só pessoa/departamento); liberado `grupo` (migração `chat_interno_tipo_grupo`). Lição: testar o INSERT real no banco, não só a tela com dados simulados. `atendimento-chat` v7 devolve o erro do banco em texto.
- 28/out (7): **padrão único de abas** (`tema.css`, classe `.abas-std` e as antigas `.mini-tabs` / `.abas` / `.ag-abas` / `.filtros-abas`): texto só com a 1ª letra maiúscula, sem emoji, ativa com fundo azul claro + barra grossa — igual às abas do topo do shell (`.tabs-line` e o 2º nível `.tabs-seg`, que deixou de ser "pílula" preenchida). Não criar CSS de abas novo nos módulos: usar `.abas-std`. Gravações escondia mal a barra escura própria dentro do app (agora `html.embedded header.topbar{display:none}`).
- 29/out: **Clientes** ganharam `observacoes` (texto) e `tags` (lista de ids). A lista de tags fica em `config.tagsClientes` `[{id,nome,cor}]` (salva com `configSave()` no Cadastro; só quem tem o módulo `config` cria/edita/exclui; renomear vale pra todos os clientes). Cadastro › Clientes: filtro por tag, busca por nome de tag, botão "Gerenciar tags"; mesclar duplicados junta observações e tags.
- 29/out (2): **Tags** são criadas/editadas/excluídas no botão "Tags" da tela Cadastro › Clientes (sem aba própria); a lista de clientes abre sozinha, 50 por página; no cadastro do cliente só se marca. **Bolinhas de loja** (`cliente-lojas.js`, `window.ClienteLojas`): cor + sigla da loja onde o cliente já teve venda, orçamento ou O.S. (vínculo por telefone, senão nome, pois os registros não guardam `clienteId`); aparece em Cadastro › Clientes e nos seletores de cliente de Vendas, Orçamento e O.S.
- 29/out (3): **Tag MARKETING OFF** (`marketing-off.js`, `window.MarketingOff`): antes de qualquer envio de WhatsApp/e-mail a cliente com essa tag (nome da tag, sem diferenciar maiúsculas/acentos), abre pop-up "Enviar mesmo assim / Cancelar"; mala direta pergunta uma vez (enviar todos / pular restritos / cancelar). Vale em Aniversário, Mala direta, Follow-up, Orçamento, Pedido/O.S., Gravações e Reforma; **não** vale no CHAT. Rede de segurança: links `wa.me` de qualquer tela que carregue o script passam pela checagem. Novo módulo que envie mensagem a cliente deve carregar o script e chamar `await MarketingOff.permitir({telefone,nome})` antes do envio.
- 29/out (4): **Fiscal — fase 1 (reforma tributária)**, só campos opcionais, nada emite nota. Produto › aba Fiscal: `origem`, `cfopSaida`, `cstIbsCbs`, `cClassTrib`, `regimeItem` (novo/usado), `unidadeTributavel`, `exTipi`, `cest`. Tipos de ordem **não** têm campos fiscais (só controle de agenda — removidos a pedido em 29/out). Formas de pagamento: `tPag`, `cnpjCredenciadora`. Lojas: `nomeFantasia`, `regimeTributario` (simples/simplesExcesso/normal/mei), `porte`, `cnaePrincipal`, `inicioAtividade`, `codigoMunicipioIbge`, `inscricaoMunicipal`, `documentosFiscais`, `serieNfe`, `serieNfce`, `situacaoCadastral`. Clientes: `tipoPessoa`, `cnpj`, `indIE`, `inscricaoEstadual`, `codigoMunicipioIbge` (preenche pelo CEP). Dados das lojas gravados direto em `gestao_config` a partir da consulta SEFAZ-MG (backup em `gestao_config` id `backup_lojas_pre_fiscal_20261029`). Reforma Joias (`loja_rj`) usa os dados do Ecommerce, sem CNPJ, nome e IE; Up Case sem dados fiscais. **Ecommerce consta "Bloqueado como Destinatário na UF"** e é Regime Normal (as demais, Simples; Marechal Center sem regime informado). CST IBS/CBS e cClassTrib ficam em branco até o contador confirmar. Certificado A1 e CSC nunca entram em `config`.
- 29/out (5): preenchimento fiscal sugerido (a confirmar com o contador): produtos `cstIbsCbs 000` / `cClassTrib 000001` / `regimeItem novo`, `origem 0` e NCM (Ouro 71131900, Prata 71131100) nos 491 produtos existentes (backup `produtos_estoque_backup_fiscal_20261029`); relógios ficaram sem NCM (depende do mostrador) e sem origem; `cfopSaida` e NBS em branco. Tipos de ordem: SERVIÇO com item LC 116 14.01. Pelas fontes consultadas, Simples (CRT 1) só passa a ser obrigado a informar IBS/CBS em 2027.
- 29/out (6): **Perfil fiscal por Tipo** (Fator › Venda, `config.fator.tiposVenda[].fiscal` = `{ncm, origem, cfopSaida, cstIbsCbs, cClassTrib, regimeItem}`; padrões em `fiscalPadraoTipo`). Ao escolher/criar o Tipo no produto, `sincronizarFiscalTipo` preenche esses campos só se estiverem vazios ou com o último valor automático; o que foi digitado à mão não é sobrescrito. Não mexe no CFOP de entrada (continua `cfopPadrao`).
- 29/out (7): **Compartilhar cadastros** (botão 📤 nas linhas de Clientes, Lojas e Fornecedores em Cadastro; `abrirCompartilhar` + `textoCompartilhar*` no index.html): modal com texto editável, WhatsApp (número opcional) e e-mail (via `send-email-gmail`) ou copiar. Não vai observações, tags, crédito, fator do fornecedor; contas bancárias da loja só se marcar a opção.
- 29/out (8): **Grupos de tipos de ordem** (`config.gruposTipoOrdem [{id,nome,maxPorDia,prazoMinimoDias}]`, `tiposServico[].grupoId`): tipos do mesmo grupo dividem as vagas por dia (soma) e o prazo. Grupo `fabricacao` = 10 tipos "<CATEGORIA> <OURO|PRATA> PERSONALIZADO / FABRICAÇÃO" (ANEL, PINGENTE, PULSEIRA, CORDÃO, BRINCO) com NCM, CFOP 5.101, origem 0 e CST 000/cClassTrib 000001; prazo e máx. editados no cartão do grupo (copiados para cada tipo). `painel-ordens.html`: `idsDoMesmoGrupo` + `checkSlot` somam o grupo e a agenda mostra um chip por grupo. **Pendente:** `reforma-api` (`sugerirData`) ainda conta vagas por tipo isolado. Backup: `gestao_config` id `backup_tipos_ordem_20261029`.
- 29/out (9): grupo de tipos de ordem `alianca` ("ALIANÇA PERSONALIZADO / FABRICAÇÃO"): `st_lente_simples` (id antigo, renomeado para ALIANÇA OURO ...) e `st_alianca_prata`, prazo 7 / máx. 1 por dia somados. Só dados em `gestao_config`; nenhum arquivo de código mudou.
- 29/out (10): os grupos de tipos de ordem foram **desativados a pedido** (`gruposTipoOrdem` vazio): cada tipo tem prazo e máx./dia próprios; ALIANÇA e SERVIÇO voltaram como eram. O suporte a grupos continua no código (cartão do grupo, soma de vagas em `checkSlot`) mas só aparece se existir grupo.
- 29/out (11): **Fator** e **Tipos de ordem** deixaram de ser abas/cartões do Cadastro e viraram botões no topo de Cadastro › Produto (`abrirSubtelaProduto`, com "← Voltar para Produtos"). As permissões continuam as das abas `fator` e `tiposOrdem` (DP › perfis, `podeSubtelaProduto`).
- 29/out (12): grupo de tipos de ordem `agenda` ("PRODUÇÃO", `prazoIndividual:true`): os 8 tipos atuais (ALIANÇA/SERVIÇO/FABRICACAO × SEM/COM CRAVACAO, RELOGIO ASSISTENCIA AUTORIZADA/JUIZ DE FORA) dividem a MESMA quantidade por dia (máx. 10, soma), cada um com o próprio prazo. Grupo com `prazoIndividual` só propaga `maxPorDia`. Backup: `gestao_config` id `backup_tipos_ordem_pre_agenda_unica_20261029`.
- 29/out (13): Tipos de ordem sem dados fiscais (UI e dados removidos). **Cuidado:** uma tela do Cadastro aberta antes de uma alteração feita direto no banco e depois salva sobrescreve a config inteira (já apagou o grupo `agenda` uma vez); depois de mexer em `gestao_config` por SQL, pedir F5 a todos.
- 29/out (14): as abas **Status de Orçamento** e **Mensagens** do Cadastro viraram uma só, "Status e Mensagens" (`renderStatusMensagensTab`, id `statusOrcamento`), com duas subabas (`.abas-std`). As permissões continuam separadas (`abas.statusOrcamento` e `abas.mensagens` em DP › perfis); a aba aparece se qualquer uma estiver liberada.
- 29/out (15): **Oficina = unidade interna + Insumos.** `loja_of` tem `interna:true` (checkbox em Cadastro › Lojas, chip "UNIDADE INTERNA"); unidade interna some dos seletores de loja de Vendas, Pedido (loja da O.S.), Orçamento e Caixa, mas continua com usuários, dashboard, agenda e autorizações. A Oficina não tem CNPJ: **os insumos pertencem à loja que comprou** e ficam "em poder da Oficina" (`local:'oficina'`). Módulo CAIXA › **INSUMOS** (`insumos.html`, sub `insumos`, iframe `caixa_insumos`, permissão `insumos` com abas `saldos`/`movimentos`/`cadastro`/`baixaVia` em `MODULOS_APP` e nos 3 blocos de `permissoesPadrao` de index.html e dp.html; padrão: diretoria/gerente tudo, oficina saldos + baixaVia, vendedora desligado). Na via (painel-ordens, modal completo e modal da Oficina) o bloco **"Material da Oficina usado nesta via"** (`mountInsumosVia`) lança a saída (serviço ou fabricação) do saldo da **loja da via** em poder da Oficina, valorada pelo custo médio das compras — base para separar material (venda) e mão de obra (serviço) na nota futura. Saldo insuficiente pede confirmação (fica negativo). Nada é apagado: corrigir = estornar. Tabelas com RLS e sem GRANT; só a Edge Function `insumos-api` acessa (permissões conferidas no servidor).
- 29/out (16): **Status `oficina_pronto`** ("Oficina pronto") nas O.S.: a Oficina terminou; a loja confere e marca Pronto. Em painel-ordens (STATUS, `statusLabel`, cores azul, selects e filtro), dashboard (filtro) e acompanhar.html (para o cliente continua "Aguardando"). Não conta vaga na agenda (só `aguardando` conta). O bloco de material saiu do modal da via no Pedido e foi para o cartão **OFICINA** (`insumos.html`, aba Vias): lista com filtros, leitor (campo com Enter — leitor USB/Bluetooth — ou câmera via `BarcodeDetector`), painel da via com status, local da peça (loja/fabrica), observação "[OFICINA] …" que entra em `observacoes` da O.S. (com "avisar a loja" = `notificarPara` das vendedoras/gerentes da loja da via, aparece nos alertas do Pedido) e material usado. Permissão nova aba `vias` no módulo `insumos` (nome "CAIXA › Oficina (vias e insumos)"). Gravação da O.S. pela `insumos-api` com service role (a Oficina não tem lojas no usuário, o db-gateway esconderia as vias), limitada aos campos acima; histórico em `payload.historicoOficina`.
- 29/out (17): Status **`pendencia`** ("Pendência", laranja) nas O.S. — a Oficina parou por um problema (observação obrigatória). No cartão OFICINA a via só pode ir para **Oficina pronto** ou **Pendência** (rádio); sem campo de local (a peça está sempre na Oficina); saída de material com **Ouro 18K como padrão**; serviço × fabricação é **fixo pelo tipo da via** (`finalidadeDoTipo`: nome com SERVI/RELOG/GRAVA/CONSERT = serviço, o resto = fabricação — calculado no servidor); um botão **"Salvar e finalizar"** grava material + status + observação de uma vez. `insumos-api` v3. Para o cliente (acompanhar.html), pendência e oficina pronto aparecem como "Aguardando".
- 29/out (18): Status **`enviado_fabrica`** ("Enviado p/ fábrica", roxo): a via está na Oficina em processo. Rótulo de `oficina_pronto` passou a ser **"Fábrica pronto"** (id não mudou). Fluxo: aguardando → enviado_fabrica (loja; marcar o status na lista ou o botão "Enviar para a fábrica" da localização já troca o outro) → pendencia / oficina_pronto (Oficina) → pronto/entregue (loja). O cartão OFICINA lista só enviado_fabrica, pendencia e oficina_pronto. Vagas da agenda: `STATUS_OCUPA_VAGA` = aguardando, enviado_fabrica e pendencia. `insumos-api` v4. Para o cliente, os três aparecem como "Aguardando".
- 28/out: RLS ligado em `atendimento_pessoal_usuarios`, `atendimento_lembretes` e `atendimento_setup_log` (só Edge Functions com service_role usam).

---

## 16. Módulo Reforma (v2 — 25/set/2026)

Fluxo v2: cliente abre `https://vilaca-controle-lojas.vercel.app/reforma.html` → escolhe **entrega** (leva na loja / envia pelos Correios) e **devolução** (retira na loja / recebe pelos Correios — pede CEP e, se for essa a devolução, endereço completo via ViaCEP) → adiciona **até 10 itens**, cada um com serviço, descrição, peso opcional, observação e 1-6 fotos → pedido entra na fila do módulo **Reforma** (menu 💍) → vendedora orça **peça por peça** (valor, obs pública, obs interna, "inviável") e, se envolver Correios, calcula/edita o **frete** (ida informativa + volta cobrada, com "frete grátis" manual ou por regra `gratisAcima`, e "reembolsar envio do cliente") → WhatsApp (mensagem pronta: **"Enviar pelo sistema"** via Evolution API, registrado no módulo Atendimento, ou **"Abrir no meu WhatsApp"** via `wa.me`) → cliente aprova **item a item** pelo link (ou "Aceite presencial") → **check-in de custódia** com peso, teor, lacre e **foto obrigatória de cada peça aprovada** (+ fotos do pacote se veio pelos Correios) → **Gerar O.S.** → **check-out** com peso e **foto obrigatória de cada peça** → se devolução for Correios: **postar** (rastreio + foto do comprovante, status vira `enviado`) → **entregar** (assinatura). Recibo de custódia imprimível com uma linha por peça.

Modelo de dados (`reforma_pedidos.payload`):
- `itens[]`: `{id, descricao, servico, servicoNome, pesoInformado, obsCliente, fotos[], orcamento:{valor,obsPublica,obsInterna,inviavel}, aprovado, custodia:{entrada:{peso,teor,teorObs,lacre,observacoes,fotos},saida:{peso,lacre,observacoes,fotos}}}`
- `entrega:{modo:'loja'|'correios', lojaId}`, `devolucao:{modo:'retirar'|'correios', lojaId}`, `endereco:{cep,logradouro,numero,complemento,bairro,cidade,uf}` (só preenchido se algum modo usa Correios)
- `orcamento.frete:{ida,volta:{servico,valor,prazo,origem}, gratis, reembolsarIda, gratisAcima}` — `origem` é `'correios'`, `'tabela'` ou `'manual'`
- `aceite:{em,modo,itens[],totais}`; `custodia:{entrada,fotosPacote,saida,entrega}`; `postagem:{rastreio,servico,valorPago,fotos,em}`
- Totais (`calcularTotais` no backend e replicado no front): `total = subtotal dos itens aprovados + frete de volta cobrado (se Correios e não grátis) − reembolso do frete de ida (se marcado)`; frete grátis = manual OU `subtotal ≥ frete.gratisAcima`; custo que a loja absorve vai só para `infoInterna` da O.S., nunca no total cobrado do cliente
- Pedidos da v1 (um item só) são convertidos em memória por `normalizar()` ao abrir (`it_legado`) — não precisa migração de dados

Frete (`reforma_config` id=`config`, chave `frete`):
- `provider`: `'tabela'` (padrão — valores fixos por faixa mesmaUf/sudeste/brasil × SEDEX/PAC, editável em Configurações) ou `'correios'` (API oficial)
- Se `provider:'correios'` e a chamada falhar, cai automaticamente na tabela e devolve `aviso` — nunca trava o orçamento
- Credenciais dos Correios ficam em `reforma_config` id=**`segredos`** (nunca voltam para o front — `init` só devolve `segredosStatus:{correios:boolean}`): `correiosUsuario`, `correiosCodigoAcesso` (gerado em cws.correios.com.br → Gestão de acesso a API's — **não é a senha do Meu Correios**, e regerar invalida qualquer outro sistema que já use esse código), `correiosCartao` (número do cartão de postagem do contrato)
- Endpoints usados: token `POST /token/v1/autentica/cartaopostagem`, preço `GET /preco/v1/nacional/{cod}`, prazo `GET /prazo/v1/nacional/{cod}` (`api.correios.com.br`, códigos padrão SEDEX `03220` / PAC `03298`)
- Felipe tem contrato próprio (confirmado 25/set) mas pediu para não configurar ainda — módulo segue com `provider:'tabela'`

WhatsApp: usa os **mesmos segredos do módulo Atendimento** (`atendimento_segredos`: `EVOLUTION_URL`, `EVOLUTION_API_KEY`; instância padrão configurável em `reforma_config.whatsappInstancia`, senão primeira instância não-Instagram de `config.atendimentoInstancias`, senão `'reformajoias'`). Envio pelo sistema cria/atualiza a conversa em `atendimento_conversas`/`atendimento_mensagens` — aparece também no módulo Atendimento. Templates com placeholders `{cliente} {codigo} {itens} {valor} {frete} {prazo} {validade} {link} {loja} {endereco} {entrega} {devolucao} {rastreio}`.

Regras que continuam da v1:
- **A O.S. é criada direto na tabela `ordens_servico`** pela `reforma-api` (op `gerarOS`), no mesmo formato do painel-ordens: `codigoVia` via rpc `incrementar_via_sequence` (`codigo_${ABREV}_pedido` → ex. `MC12P`), `status:'aguardando'`, `momentoPagamento:'na_volta'`, `pagamentos:[]`, **um item de O.S. por peça aprovada** + linha `FRETE RETORNO CORREIOS` (se cobrado) + linha negativa `REEMBOLSO ENVIO DO CLIENTE` (se marcado), fotos com `driveUrl` = signed URL de 10 anos. Marcadores: `origem:'reforma'`, `reformaId`, `reformaCodigo`. **painel-ordens.html não foi alterado** — não recriar essa conversão lá.
- Cliente sem cadastro entra em `clientes_cadastro` (busca pelo telefone antes de inserir; nunca duplica).
- Sessão: mesma regra do db-gateway (`sessaoValida` copiada). Permissão: `permissoes.reforma.ativo`; padrão diretoria/gerente/vendedora = true, oficina = false. Vendedora só vê pedidos das lojas dela (`user.lojas`).
- Ops públicas (`publicInit`, `publicCriar`, `publicConsultar`, `publicAceitar`) não têm sessão: rate limit 5 pedidos/telefone/24h e 25/IP/24h; a visão pública nunca inclui observações internas.
- Numeração do pedido: `R` + `numero` (bigserial) com 5 dígitos (`R00012`). Status: `novo` → `orcado` → `aprovado`/`recusado` → `em_custodia` → `os_gerada` → `pronto` → (`enviado`, só se devolução for Correios) → `entregue` (ou `cancelado`; `expirado` é calculado quando `validadeAte` passou).
- Shell/DP: acréscimos únicos foram `{ id:'reforma', label:'Reforma', icon:'💍', src:'reforma-admin.html' }` em `SIDEBAR_MODULES`, `reforma` em `MODULOS_APP` e `reforma:{ ativo:true|false }` nos três blocos de `permissoesPadrao` (index.html e dp.html). Nada disso mudou na v2 — v2 foi só `reforma-api`, `reforma.html` e `reforma-admin.html`.
