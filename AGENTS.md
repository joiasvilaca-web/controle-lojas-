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
| `vendas.html` | CUPOM → PDV + O.S. + Orçamento + Transferências + Gravações |
| `painel-ordens.html` | Pedido / O.S. |
| `orcamentos.html` | Orçamentos |
| `transferencias-reposicoes.html` | Transferências / Reposições |
| `gravacoes.html` | Gravações (serviço Up Case) |
| `caixa.html` | Caixa (abas: Resumo + Gastos + Conciliação) |
| `gastos.html` | Gastos (sub-tela do Caixa) |
| `conciliacao.html` | Conciliação (sub-tela do Caixa) |
| `dashboard.html` | Dashboard (abas: Painel + IA) |
| `ia.html` | Módulo IA (Diretoria/Gerente) |
| `marketing.html` | Marketing |
| `dp.html` | Departamento Pessoal (inclui Funcionários e Perfis de Acesso) |
| `avisos.html` | Avisos (tela inicial pós-login para todos) |
| `atendimento.html` | Atendimento WhatsApp/Instagram |
| `definir-senha.html` | Página pública de setup de senha (link de convite) |
| `advertencia.html` | Página pública de confirmação de advertência (DP) |

**`index.html` (shell) só é editado na conversa APP GERAL.**

---

## 7. Estrutura do shell (index.html)

Grupos de menu com abas em `#shellTopTabs`:

| Grupo | Sub-telas | Permissão base |
|---|---|---|
| **Avisos** | — | todos |
| **CUPOM** | PDV · O.S. · Orçamento · Transferências · Gravações | por sub-tela |
| **Dashboard** | Painel · IA | `dashboard` / `ia` |
| **Caixa** | Resumo · Gastos · Conciliação | `caixa` / `gastos` / `conciliacao` |
| **ADMINISTRAÇÃO** | Cadastro · Departamento Pessoal | `config` / `dp` |
| **Marketing** | — | `marketing` |
| **Atendimento** | — | `atendimento` |

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
| `cotacoes-mercado` | — | Cotações (não usa sessão) |

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

**Tabelas KV** têm colunas `key`/`value`. Acesso via `kvGet`/`kvSet` no db-gateway (não anon direto).

**JSONB:** usar `payload->>'campo'` em queries SQL.

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

**Antes de qualquer ação:** verificar se o app foi atualizado em outra conversa paralela (Felipe trabalha em múltiplas conversas ao mesmo tempo).

---

## 13. Pendências em aberto

- [ ] SQL de segurança aguardando aprovação do Felipe: `search_path` fixo nas funções `registrar_movimento_estoque`, `incrementar_via_sequence`, `liberar_via_sequence`, `abrev_para_loja_id`, `temp_sigla_loja`; revogar EXECUTE de `temp_sigla_loja` pro anon; ligar RLS em `clientes_backup_pre_limpeza_20260914` e `vendas_backup_pre_limpeza_20260914`
- [ ] Railway: upgrade pro Hobby pendente (cartão deu erro em 14/set) — trial vence ~12/out
- [ ] Chave Evolution API precisa ser trocada (Railway Variables + tabela `atendimento_segredos`)
- [ ] `venda-pg.html` e `pg-mes.html`: deletar manualmente no GitHub
- [ ] NFC-e/NF-e: aguardando certificado A1 + orientação do contador
- [ ] Integração Correios Vipp: aguardando credenciais da agência parceira
- [ ] Modelo multiloja (loja do select vira contexto fixo): desenhado, não implementado
- [ ] O.S.: migração para o catálogo novo de produtos (hoje usa `produtosOtica` legado)
- [ ] Instagram Atendimento: falta vincular conta da Reforma ao app Meta e gerar token

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
