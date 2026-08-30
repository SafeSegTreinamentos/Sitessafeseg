/**
 * SAFESEG ONLINE — Backend (Google Apps Script)
 * =============================================================
 * Publica um "Web App" que serve como API para a loja (/loja):
 *
 *   ?action=cursos        (GET)  -> lista de cursos + ativo/inativo
 *   ?action=toggle        (POST) -> ativa/desativa um curso (senha)
 *   ?action=checkout      (POST) -> cria pedido + preferência Mercado Pago
 *   ?action=order_status  (GET)  -> status de um pedido (pendente/aprovado/recusado)
 *   ?action=mp_webhook    (GET/POST) -> notificação do Mercado Pago (não chamar manualmente)
 *
 * Por que existe order_status + webhook, e não só o link de "sucesso"?
 * -----------------------------------------------------------------
 * O Mercado Pago redireciona o cliente para a página de obrigado assim
 * que ele TERMINA o checkout — mas isso não significa que o pagamento
 * foi aprovado (pode cair, ser recusado, ficar pendente no Pix/boleto).
 * Por isso a confirmação real de "matrícula paga" só acontece quando
 * o Mercado Pago avisa este backend via webhook, que consulta a API
 * oficial e só então marca o pedido como aprovado na planilha. A
 * página de obrigado consulta esse status — nunca confia sozinha no
 * simples fato de o cliente ter voltado do checkout.
 *
 * CONFIGURAÇÃO (uma vez só):
 * 1. Crie uma Planilha Google nova, com duas abas: "Cursos" e "Pedidos".
 * 2. Extensões > Apps Script > apague o conteúdo padrão e cole este arquivo.
 * 3. Rode a função seedFromJson() uma vez (cole o array de cursos.json
 *    onde indicado) para preencher a aba "Cursos".
 * 4. Rode a função seedPedidosHeader() uma vez para criar o cabeçalho
 *    da aba "Pedidos".
 * 5. Configurações do projeto > Propriedades do script, adicione:
 *      MP_ACCESS_TOKEN   = seu Access Token de PRODUÇÃO do Mercado Pago
 *      ADMIN_SENHA       = mesma senha usada em admin.html
 *      SITE_URL          = https://safeseg.eng.br/loja  (sem barra no final)
 * 6. Implantar > Nova implantação > Tipo: Aplicativo da Web
 *      Executar como: Eu
 *      Quem tem acesso: Qualquer pessoa
 * 7. Copie a URL gerada (.../exec) e cole em loja/assets/app.js,
 *    na linha CONFIG.API_BASE.
 * 8. No painel do Mercado Pago (Suas integrações > sua aplicação >
 *    Webhooks), cadastre a MESMA URL do passo 7 com o evento "Pagamentos".
 *    Isso é o que permite ao backend confirmar pagamentos automaticamente.
 * =============================================================
 */

const SHEET_CURSOS = "Cursos";
const SHEET_PEDIDOS = "Pedidos";

function doGet(e) {
  const action = e.parameter.action;
  if (action === "cursos") return jsonOut(getCursos());
  if (action === "order_status") return jsonOut(getOrderStatus(e.parameter.order));
  if (action === "mp_webhook") return handleWebhook(e.parameter);
  return jsonOut({ error: "ação desconhecida" });
}

function doPost(e) {
  const action = e.parameter.action;
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}

  if (action === "toggle") return jsonOut(handleToggle(body));
  if (action === "checkout") return jsonOut(handleCheckout(body));
  if (action === "mp_webhook") return handleWebhook(body);
  return jsonOut({ error: "ação desconhecida" });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function cursosSheet() { return ss().getSheetByName(SHEET_CURSOS); }
function pedidosSheet() { return ss().getSheetByName(SHEET_PEDIDOS); }

// -------------------------------------------------------------------
// CURSOS
// -------------------------------------------------------------------
function getCursos() {
  const sheet = cursosSheet();
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  return rows
    .filter(r => r[0] !== "")
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = r[i]));
      obj.ativo = obj.ativo === true || obj.ativo === "TRUE" || obj.ativo === "true";
      return obj;
    });
}

function handleToggle(body) {
  const props = PropertiesService.getScriptProperties();
  if (body.senha !== props.getProperty("ADMIN_SENHA")) {
    return { ok: false, error: "senha inválida" };
  }
  const sheet = cursosSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const slugCol = headers.indexOf("slug");
  const ativoCol = headers.indexOf("ativo");

  for (let i = 1; i < data.length; i++) {
    if (data[i][slugCol] === body.slug) {
      sheet.getRange(i + 1, ativoCol + 1).setValue(!!body.ativo);
      return { ok: true };
    }
  }
  return { ok: false, error: "curso não encontrado" };
}

// -------------------------------------------------------------------
// CHECKOUT — cria pedido (linha "pendente") + preferência Mercado Pago
// -------------------------------------------------------------------
function handleCheckout(body) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("MP_ACCESS_TOKEN");
  const siteUrl = (props.getProperty("SITE_URL") || "").replace(/\/$/, "");
  if (!token) return { error: "MP_ACCESS_TOKEN não configurado" };

  const items = body.items || [];
  if (items.length === 0) return { error: "carrinho vazio" };

  const buyer = body.buyer || {};
  const orderId = Utilities.getUuid();
  const total = items.reduce((s, i) => s + Number(i.valor) * Number(i.qty), 0);

  // grava o pedido como "pendente" ANTES de mandar pro Mercado Pago
  pedidosSheet().appendRow([
    orderId,
    new Date(),
    "pendente",
    total,
    buyer.nome || "",
    buyer.email || "",
    buyer.telefone || "",
    buyer.cpf || "",
    JSON.stringify(items),
    "" // payment_id, preenchido pelo webhook
  ]);

  const mpItems = items.map(i => ({
    title: i.nome,
    quantity: Number(i.qty),
    unit_price: Number(i.valor),
    currency_id: "BRL"
  }));

  const webhookUrl = ScriptApp.getService().getUrl();

  const payload = {
    items: mpItems,
    external_reference: orderId,
    payer: buyer.email ? { name: buyer.nome, email: buyer.email } : undefined,
    back_urls: {
      success: siteUrl + "/obrigado.html?order=" + orderId,
      failure: siteUrl + "/carrinho.html?order=" + orderId,
      pending: siteUrl + "/obrigado.html?order=" + orderId
    },
    auto_return: "approved",
    notification_url: webhookUrl,
    statement_descriptor: "SAFESEG ONLINE"
  };

  const resp = UrlFetchApp.fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const result = JSON.parse(resp.getContentText());
  if (result.init_point) {
    return { init_point: result.init_point, order_id: orderId };
  }
  return { error: result.message || "erro ao criar preferência no Mercado Pago" };
}

// -------------------------------------------------------------------
// STATUS DO PEDIDO — consultado pela página obrigado.html
// -------------------------------------------------------------------
function getOrderStatus(orderId) {
  if (!orderId) return { error: "order ausente" };
  const data = pedidosSheet().getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf("order_id");
  const statusCol = headers.indexOf("status");
  const totalCol = headers.indexOf("total");
  const nomeCol = headers.indexOf("nome");

  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === orderId) {
      return {
        found: true,
        status: data[i][statusCol],
        total: data[i][totalCol],
        nome: data[i][nomeCol]
      };
    }
  }
  return { found: false };
}

// -------------------------------------------------------------------
// WEBHOOK — o Mercado Pago chama isso quando o status do pagamento muda
// -------------------------------------------------------------------
function handleWebhook(params) {
  try {
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty("MP_ACCESS_TOKEN");

    // Mercado Pago manda ?type=payment&data.id=XXXX (webhooks v2)
    // ou, no formato legado, ?topic=payment&id=XXXX
    const paymentId = params["data.id"] || params.id;
    const type = params.type || params.topic;
    if (type !== "payment" || !paymentId) {
      return jsonOut({ ok: true }); // ignora outros eventos silenciosamente
    }

    const resp = UrlFetchApp.fetch("https://api.mercadopago.com/v1/payments/" + paymentId, {
      method: "get",
      headers: { Authorization: "Bearer " + token },
      muteHttpExceptions: true
    });
    const payment = JSON.parse(resp.getContentText());
    const orderId = payment.external_reference;
    if (!orderId) return jsonOut({ ok: true });

    const statusMap = {
      approved: "aprovado",
      pending: "pendente",
      in_process: "pendente",
      rejected: "recusado",
      cancelled: "cancelado",
      refunded: "reembolsado"
    };
    const novoStatus = statusMap[payment.status] || payment.status;

    const sheet = pedidosSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol = headers.indexOf("order_id");
    const statusCol = headers.indexOf("status");
    const paymentIdCol = headers.indexOf("payment_id");

    for (let i = 1; i < data.length; i++) {
      if (data[i][idCol] === orderId) {
        sheet.getRange(i + 1, statusCol + 1).setValue(novoStatus);
        sheet.getRange(i + 1, paymentIdCol + 1).setValue(String(paymentId));
        break;
      }
    }
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/**
 * Utilitário: roda uma vez para popular a aba "Cursos" a partir do
 * cursos.json inicial. Cole o conteúdo de cursos.json na variável
 * abaixo e execute esta função pelo editor do Apps Script.
 */
function seedFromJson() {
  const cursosJson = []; // <- cole aqui o array de cursos.json
  const sheet = cursosSheet();
  const headers = ["id","slug","nome","categoria","carga_horaria","valor_esocial","valor_venda","ativo"];
  sheet.clear();
  sheet.appendRow(headers);
  cursosJson.forEach(c => {
    sheet.appendRow(headers.map(h => c[h]));
  });
}

/**
 * Utilitário: roda uma vez para criar o cabeçalho da aba "Pedidos".
 */
function seedPedidosHeader() {
  const sheet = pedidosSheet();
  sheet.clear();
  sheet.appendRow(["order_id","data","status","total","nome","email","telefone","cpf","itens","payment_id"]);
}
