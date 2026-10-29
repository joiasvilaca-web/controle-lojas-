# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Equipe do Grupo Vilaça Joias (Juiz de Fora, MG): vendedoras no balcão das lojas, gerentes, a oficina (ourives) e a diretoria. Usam o app o dia inteiro, no **computador da loja** (mouse, teclado, leitor de código USB) e no **celular** (confirmado pelo dono em 29/out). Tarefas típicas: lançar venda, abrir e acompanhar pedido/O.S., montar orçamento, responder cliente no WhatsApp/Instagram, conferir caixa e estoque.

## Product Purpose
Sistema interno único de gestão das lojas (Marechal Center, João Beraldo, Jardim Norte, Ecommerce, Reforma Joias e a Oficina): vendas (PDV), pedidos/O.S. com agenda da oficina, orçamentos, transferências de estoque, gravações (Up Case), caixa/gastos/conciliação, reforma de joias, inventário, chat com clientes e interno, DP, painel e IA. Sucesso = a vendedora conclui a tarefa rápido e sem erro, e a gestão enxerga o que está pendente.

## Positioning
Feito sob medida para a operação real de uma rede de joalherias com oficina própria: código de via por loja (ex. MC12P), agenda de produção da oficina, custódia de peças da Reforma, Kardex por loja, fator/comissão das vendedoras.

## Operating Context
Balcão de loja com cliente na frente (precisa ser rápido e legível), leitor de código de barras, impressão de vias/cupons, WhatsApp. Cada pessoa trabalha na loja definida no DP; operar em outra loja exige senha da gerência e mostra barra vermelha. App em produção com dados reais; publicado direto no app oficial (Vercel) a cada mudança.

## Capabilities and Constraints
- Stack: HTML + CSS + JavaScript puros (sem framework, sem bundler); shell `index.html` carrega cada módulo em iframe; dados só pelas Edge Functions (db-gateway etc.).
- Regras do projeto em AGENTS.md (nenhuma lista carrega sozinha ao abrir, telefone (XX) XXXXX-XXXX, CAIXA ALTA em nomes de módulos/cartões, abas com só a 1ª maiúscula, popups não fecham clicando fora).
- Nenhuma função existente pode ser removida.

## Brand Commitments
- Identidade: **azul-petróleo** (marinho na barra lateral, azul-petróleo nas ações) — escolhido pelo dono para a repaginação ("azul atual refinado"). Logo Vilaça (`logo-vilaca.png`).
- Tema **claro e escuro** (pedido do dono).
- Cada loja tem uma cor própria, usada só no balão/sigla da loja.
- Textos em português do Brasil, linguagem simples (dono autorizou reescrever).

## Evidence on Hand
Logo em `logo-vilaca.png`. Não há fotos, depoimentos ou métricas para inventar.

## Product Principles
1. Balcão primeiro: a ação principal de cada tela visível e a um clique; números grandes e legíveis.
2. Uma linguagem só: o mesmo botão, campo, selo e popup em todas as telas.
3. Nada some: reorganizar e simplificar sem tirar função nem dado.
4. Estado sempre claro: pendente, atrasado, pago, erro — com cor E texto.
5. Funciona no celular da vendedora tanto quanto no computador da loja.

## Accessibility & Inclusion
Contraste mínimo 4.5:1 em texto; alvos de toque ≥ 44px no celular; foco visível para teclado/leitor de código; cor nunca é o único sinal de estado.
