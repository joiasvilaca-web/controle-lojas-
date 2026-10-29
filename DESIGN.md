# DESIGN — Gestão e Controle · Vilaça Joias

Sistema visual "azul-petróleo refinado" (29/out). Modo de superfície: **Operate** (app de trabalho). Prioridade: legibilidade, consistência e rapidez no balcão; a marca aparece nos detalhes, não em decoração.

## Arquivos do sistema
| Arquivo | O que faz |
|---|---|
| `tema.css` | Tokens (claro e escuro), base e aparência de todos os componentes comuns. Telas internas têm `<html lang="pt-BR" data-ds>`: o sistema **manda** nas cores mesmo que a tela tenha o próprio `:root`. |
| `tema.js` | No `<head>` de toda tela interna. Aplica `data-theme="light|dark"` sem piscar. Preferência em `localStorage.vilaca_tema` = `claro` (padrão) / `escuro` / `auto`. Todas as telas abertas mudam juntas. |
| `icones.js` | `Icone('nome', {tam, titulo})` → SVG (traço 2px). Classe `.btn-icone` para botões só de ícone (32px; 40px no celular). |
| `formato.js` | `Fmt.brl`, `Fmt.num`, `Fmt.pct`, `Fmt.data`, `Fmt.dataHora`, `Fmt.relativo`, `Fmt.tel`. |
| `modal-x.js` | × no topo e "Fechar" no rodapé de todo popup (já existente). |

## Cores (use SEMPRE as variáveis, nunca hex no código da tela)
| Papel | Variável do módulo | Token | Claro | Escuro |
|---|---|---|---|---|
| Fundo da página | `--bg` | `--t-bg` | #F3F5F8 | #0B1620 |
| Superfície (cartão, popup) | `--surface` | `--t-surface` | #FFFFFF | #111E29 |
| Superfície 2 (faixa, cabeçalho de tabela, hover forte) | `--surface-2` | `--t-surface-2` | #EEF2F6 | #172633 |
| Linha | `--line` / `--line-strong` | `--t-line` / `--t-line-strong` | #E1E7ED / #C8D1DA | #223443 / #33495B |
| Texto | `--ink` | `--t-text` | #132231 | #E3EBF2 |
| Texto secundário | `--ink-soft` | `--t-text-soft` | #3A4B5B | #B7C5D1 |
| Texto apagado (legendas) | `--ink-faint` / `--muted` | `--t-muted` | #5A6A79 | #8C9EAE |
| Ação / link / seleção | `--accent` | `--t-primary` | #17647E | #62B0CB |
| Fundo do botão principal | — | `--t-primary-strong` | #17647E | #1F6E89 |
| Fundo suave da ação | `--accent-soft` | `--t-primary-soft` | #E5F0F4 | azul 14% |
| Sucesso / pago | `--ok` / `--ok-soft` | `--t-success` | #147A4C | #4CC38A |
| Perigo / atraso / erro | `--danger` / `--danger-soft` | `--t-danger` | #B42318 | #F2857A |
| Atenção / pendente | `--wait` / `--wait-soft` | `--t-warning` | #94600F | #E3AE55 |
| Informação | `--info` | `--t-info` | #1D5FD1 | #86AEF7 |
| Barra lateral | — | `--t-dark` | #0E2233 | #08111A |
Contraste conferido ≥ 4.5:1 para todo texto em todas as superfícies, nos dois temas. Cor da loja: só no balão/sigla da loja. Cor nunca é o único sinal: sempre com texto ("Atrasado", "Pago").

## Tipografia
Inter (já carregada). Base 14px no computador; campos 16px no celular. Escala: 12 (legenda) · 13 (tabela/apoio) · 14 (corpo) · 16 (subtítulo) · 20 (título de tela) · 24 (número de destaque). Pesos 400/600/700. Títulos com `letter-spacing:-.015em`. Valores e tabelas com números tabulares (automático em `table`, `.num`, `.valor`, `.total`). **CAIXA ALTA só** em nome de módulo/cartão (regra do projeto) e siglas de loja; resto em frase normal.

## Espaço, forma, profundidade
Espaçamento múltiplo de 4 (4, 8, 12, 16, 24, 32). Raio: 8px campos/botões, 12px cartões, 16px popups, 999px selos. Sombras: `--t-shadow-sm` (cartão), `--t-shadow` (elevado), `--t-shadow-lg` (popup). Nada de sombra "3D" dura nem borda colorida grossa de um lado só.

## Componentes
- **Botões**: `.btn` + `.btn-accent` (principal — no máximo UM por área), `.btn-ghost` (secundário), `.btn-danger` (destrutivo, sempre com confirmação), `.btn-ok`, `.btn-wa` (WhatsApp), `.btn-sm`. Rótulo diz a ação ("Salvar venda", "Gerar O.S."), sem emoji. Ícone + texto: `Icone('mais')+' Nova venda'`.
- **Ações de linha de tabela**: `.btn-icone` com `Icone(...)` e `title`/`aria-label` (nunca emoji). Ação destrutiva: `.btn-icone.perigo`. Mais de 3 ações → menu "Mais".
- **Campos**: rótulo em cima (`.field > label`), dica abaixo em `.muted`. Datas exibidas dd/mm/aaaa. Telefone (XX) XXXXX-XXXX.
- **Tabelas**: cabeçalho 11–12px maiúsculo leve em `--ink-faint`; linhas 13px; valores à direita; no celular viram cartões ou rolam dentro do cartão.
- **Selos de status**: pílula com fundo `*-soft` e texto da cor forte (Pago=ok, Pendente=wait, Atrasado/Cancelado=danger, Pronto=info).
- **Estados obrigatórios** em toda lista: carregando (esqueleto ou "Carregando…" discreto), vazio que explica o próximo passo, erro com o que fazer.
- **Popups**: usar só quando proteger foco for necessário; título curto, ação principal à direita no rodapé; não fecham clicando fora (regra do projeto).
- **Abas**: `.abas-std` (padrão único do projeto).

## Movimento
150–250ms, `--t-ease`. Só para mudança de estado (hover, abrir popup, toast). Respeitar `prefers-reduced-motion`.

## Texto (voz)
Português simples e direto, tratando a vendedora por "você". Botões com verbo. Erros dizem o problema e como resolver ("Informe o telefone com DDD"). Sem jargão técnico na tela.

## Proibido
Emoji como ícone · hex solto no CSS da tela (use variáveis) · gradiente em texto · cartão dentro de cartão · rótulo pequeno acima de título ("eyebrow") · sombra dura deslocada · valor em `R$ 1234.00` (sempre `Fmt.brl`) · data em formato americano.
