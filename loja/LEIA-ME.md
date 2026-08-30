# SafeSeg Online — planilha + pagamento automático (Etapas 2 e 3)

Você já tem a Etapa 1 no ar (`safeseg.eng.br/loja`). Este guia liga tudo a uma
Google Sheets (pra você ativar/desativar curso valendo pra todo mundo) e ao
Mercado Pago de verdade — com confirmação **segura** do pagamento, não só
"a pessoa voltou pro site".

## Por que tem uma etapa extra de confirmação?

O Mercado Pago manda o cliente de volta pro seu site assim que ele *termina*
o checkout — mas isso não quer dizer que o pagamento foi aprovado (pode
falhar, ficar pendente no Pix, ser recusado no cartão). Por isso a loja usa
um **webhook**: o próprio Mercado Pago avisa o backend quando o status do
pagamento muda, o backend confere na API oficial dele e só aí marca o
pedido como "aprovado" na planilha. A página de "obrigado" fica consultando
esse status por alguns segundos — ela nunca confia sozinha no simples fato
de a pessoa ter voltado do checkout. Isso evita, por exemplo, alguém fechar
a aba do Mercado Pago sem pagar e ainda assim ver "matrícula confirmada".

## Passo 1 — Criar a planilha

1. Crie uma **Google Sheets** nova (pode chamar de "SafeSeg Online — Dados").
2. Crie duas abas: **Cursos** e **Pedidos** (o nome tem que ser exatamente esse).

## Passo 2 — Colar o backend

1. Na planilha, vá em **Extensões > Apps Script**.
2. Apague o conteúdo padrão (`Code.gs`) e cole o arquivo **Code.gs** desta entrega.
3. Na função `seedFromJson()` (perto do fim do arquivo), cole o conteúdo de
   `cursos.json` no lugar indicado (`const cursosJson = [];`) e rode essa
   função uma vez (▶ no editor) — ela preenche a aba Cursos com os 85 cursos.
4. Rode também a função `seedPedidosHeader()` uma vez — ela cria o
   cabeçalho da aba Pedidos.

## Passo 3 — Pegar o Access Token do Mercado Pago

1. Entre em https://www.mercadopago.com.br/developers/panel
2. **Suas integrações** > sua aplicação (ou crie uma nova) > **Credenciais de produção**.
3. Copie o **Access Token** de produção (começa com `APP_USR-...`).

## Passo 4 — Configurar as propriedades do script

No editor do Apps Script: **Configurações do projeto (ícone de engrenagem) >
Propriedades do script > Adicionar propriedade do script**. Adicione três:

| Propriedade | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | o Access Token copiado no Passo 3 |
| `ADMIN_SENHA` | a mesma senha usada em `admin.html` (hoje: `safeseg2026`) |
| `SITE_URL` | `https://safeseg.eng.br/loja` (sem barra no final) |

## Passo 5 — Publicar o Web App

1. No editor do Apps Script: **Implantar > Nova implantação**.
2. Tipo: **Aplicativo da Web**.
3. Executar como: **Eu** (sua conta Google).
4. Quem tem acesso: **Qualquer pessoa**.
5. Clique em **Implantar** e copie a URL gerada (termina em `/exec`).

## Passo 6 — Ligar o site à planilha

1. Abra `loja/assets/app.js`.
2. Troque a linha `API_BASE: ""` para `API_BASE: "COLE_A_URL_AQUI"`.
3. Suba esse arquivo atualizado pro repositório (`git add`, `commit`, `push`).

A partir daqui: o catálogo já lê os cursos direto da planilha, e o
`admin.html` ativa/desativa valendo pra todo mundo — mesmo sem o Mercado
Pago configurado ainda, se você quiser testar por partes.

## Passo 7 — Cadastrar o webhook no Mercado Pago

Isso é o que permite a confirmação automática e segura do pagamento.

1. No painel do Mercado Pago: **Suas integrações** > sua aplicação > **Webhooks**.
2. Adicione a **mesma URL** do Passo 5 (a que termina em `/exec`).
3. Marque o evento **Pagamentos**.
4. Salve.

## Pronto — o que passa a acontecer

1. Cliente monta o carrinho, preenche os dados e clica em pagar.
2. O backend grava o pedido na aba **Pedidos** como `pendente` e cria a
   cobrança no Mercado Pago (Pix, cartão, boleto).
3. Cliente paga e é levado pra página "Sua matrícula" — que fica checando
   o status real do pedido por até ~30 segundos.
4. Quando o Mercado Pago confirma o pagamento, ele avisa o webhook, que
   atualiza a planilha para `aprovado` — só aí a página mostra "Matrícula
   confirmada!".
5. Você acompanha todos os pedidos (pagos, pendentes, recusados) direto na
   aba **Pedidos** da planilha, com nome, e-mail, WhatsApp, CPF e itens.

## Testando antes de valer

O Mercado Pago tem um **modo de teste** com Access Token de teste e cartões
fictícios — se quiser testar sem cobrar de verdade, troque temporariamente
o `MP_ACCESS_TOKEN` pelo token de teste (mesma tela do Passo 3, aba
"Credenciais de teste") e use os cartões de teste da documentação deles.
Depois volte para o token de produção.

## Editar preço, WhatsApp ou senha depois

- **Preços/cursos**: edite direto na aba **Cursos** da planilha — vale na hora.
- **WhatsApp de pedidos**: `loja/assets/app.js`, campo `WHATSAPP_NUMERO`.
- **Senha do admin**: troque em `admin.html` (`ADMIN_PASS`) **e** na
  propriedade `ADMIN_SENHA` do Apps Script — as duas precisam ser iguais.

## Trocar a logo

O site usa uma marca em SVG (escudo com "check") definida em
`loja/assets/app.js`, função `svgLogoMark()`. Me manda o arquivo da logo
oficial que eu troco em todas as páginas.

## Descrição própria por curso

Hoje cada página de curso usa uma descrição padrão gerada a partir do nome
e da categoria. Me diga quais cursos você quer com conteúdo programático
específico (ex: NR-35, NR-10) que eu escrevo o texto completo de cada um.
