/* =========================================================
   SAFESEG LOJA — lógica compartilhada
   ========================================================= */

// -------------------------------------------------------------------
// CONFIGURAÇÃO — troque API_BASE pela URL do seu Apps Script publicado
// (veja LEIA-ME.md). Enquanto vazio, o site lê cursos.json estático
// e o carrinho finaliza via WhatsApp/manual.
// -------------------------------------------------------------------
const CONFIG = {
  API_BASE: "", // ex: "https://script.google.com/macros/s/AKfycb.../exec"
  CURSOS_JSON_FALLBACK: "cursos.json",
  WHATSAPP_NUMERO: "5546999203945", // WhatsApp real da SafeSeg
  NOME_LOJA: "SafeSeg Online",
  NOME_EMPRESA: "SafeSeg Segurança do Trabalho",
  CIDADE: "Dois Vizinhos/PR"
};

const CAT_INFO = {
  "NR-05": {label:"NR-05 · CIPA", color:"var(--cat-gestao)"},
  "NR-06": {label:"NR-06 · EPI", color:"var(--cat-medio)"},
  "NR-10": {label:"NR-10 · Elétrica", color:"var(--cat-alto)"},
  "NR-11": {label:"NR-11 · Movimentação", color:"var(--cat-alto)"},
  "NR-12": {label:"NR-12 · Máquinas", color:"var(--cat-alto)"},
  "NR-17": {label:"NR-17 · Ergonomia", color:"var(--cat-medio)"},
  "NR-18": {label:"NR-18 · Construção", color:"var(--cat-alto)"},
  "NR-20": {label:"NR-20 · Inflamáveis", color:"var(--cat-alto)"},
  "NR-22": {label:"NR-22 · Mineração", color:"var(--cat-alto)"},
  "NR-23": {label:"NR-23 · Incêndio", color:"var(--cat-medio)"},
  "NR-26": {label:"NR-26 · Sinalização", color:"var(--cat-medio)"},
  "NR-29": {label:"NR-29 · Portuário", color:"var(--cat-alto)"},
  "NR-31": {label:"NR-31 · Rural", color:"var(--cat-gestao)"},
  "NR-32": {label:"NR-32 · Saúde", color:"var(--cat-gestao)"},
  "NR-33": {label:"NR-33 · Espaço Confinado", color:"var(--cat-alto)"},
  "NR-34": {label:"NR-34 · A Quente", color:"var(--cat-alto)"},
  "NR-35": {label:"NR-35 · Altura", color:"var(--cat-alto)"},
  "NR-38": {label:"NR-38 · Resíduos", color:"var(--cat-gestao)"},
  "RAC":   {label:"RAC · Reciclagem", color:"var(--cat-medio)"},
  "TBSSMA":{label:"TBSSMA", color:"var(--cat-gestao)"},
  "Diversos":{label:"Diversos", color:"var(--cat-geral)"}
};
function catInfo(cat){ return CAT_INFO[cat] || {label:cat, color:"var(--cat-geral)"}; }

function brl(v){
  return v.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function svgLogoMark(){
  return `<svg viewBox="0 0 40 40" class="brand-mark" aria-hidden="true">
    <polygon points="20,1 37,9 37,21 20,39 3,21 3,9" fill="#14171B" stroke="#F59E0B" stroke-width="2"/>
    <path d="M13 20.5 L18 25.5 L27.5 14.5" fill="none" stroke="#F59E0B" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function iconCart(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`;}
function iconClock(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;}
function iconCheck(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;}
function iconCert(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M9 14l-2 7 5-3 5 3-2-7"/></svg>`;}
function iconInfinity(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.229-8-5.096 0-5.096 8 0 8 5.096 0 7.135-8 12.229-8z"/></svg>`;}

// -------------------------------------------------------------------
// Dados dos cursos
// -------------------------------------------------------------------
let _cursosCache = null;
async function getCursos(){
  if(_cursosCache) return _cursosCache;
  try{
    if(CONFIG.API_BASE){
      const r = await fetch(`${CONFIG.API_BASE}?action=cursos`);
      if(r.ok){ _cursosCache = await r.json(); return _cursosCache; }
    }
  }catch(e){ console.warn("API indisponível, usando cursos.json local", e); }
  const r2 = await fetch(CONFIG.CURSOS_JSON_FALLBACK);
  _cursosCache = await r2.json();
  return _cursosCache;
}
async function getCursoBySlug(slug){
  const cursos = await getCursos();
  return cursos.find(c => c.slug === slug);
}

// -------------------------------------------------------------------
// Carrinho (localStorage)
// -------------------------------------------------------------------
const CART_KEY = "safeseg_cart_v1";
function readCart(){
  try{ return JSON.parse(localStorage.getItem(CART_KEY)) || []; }catch(e){ return []; }
}
function writeCart(items){
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartBadge();
  document.dispatchEvent(new CustomEvent('cart:changed'));
}
function addToCart(curso, qty=1){
  const items = readCart();
  const found = items.find(i => i.slug === curso.slug);
  if(found){ found.qty += qty; }
  else{ items.push({slug:curso.slug, nome:curso.nome, valor:curso.valor_venda, carga:curso.carga_horaria, categoria:curso.categoria, qty}); }
  writeCart(items);
  showToast(`Adicionado ao carrinho: ${curso.nome}`);
}
function removeFromCart(slug){
  writeCart(readCart().filter(i => i.slug !== slug));
}
function setQty(slug, qty){
  const items = readCart();
  const it = items.find(i => i.slug === slug);
  if(!it) return;
  it.qty = Math.max(1, qty);
  writeCart(items);
}
function cartCount(){ return readCart().reduce((s,i)=>s+i.qty,0); }
function cartTotal(){ return readCart().reduce((s,i)=>s+i.qty*i.valor,0); }
function updateCartBadge(){
  document.querySelectorAll('.cart-count').forEach(el=>{
    const n = cartCount();
    el.textContent = n;
    el.style.display = n>0 ? 'flex' : 'none';
  });
}

// -------------------------------------------------------------------
// Toast
// -------------------------------------------------------------------
let _toastTimer;
function showToast(msg){
  let t = document.querySelector('.toast');
  if(!t){
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.innerHTML = `${iconCheck()}<span>${msg}</span>`;
  requestAnimationFrame(()=>t.classList.add('show'));
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(()=>t.classList.remove('show'), 2600);
}

// -------------------------------------------------------------------
// Cart drawer (injected into every page via layout.js)
// -------------------------------------------------------------------
function renderCartDrawer(){
  const items = readCart();
  const wrap = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');
  if(!wrap) return;
  if(items.length === 0){
    wrap.innerHTML = `<div class="cart-empty">Seu carrinho está vazio.<br>Explore o catálogo e adicione um treinamento.</div>`;
    if(footer) footer.style.display='none';
    return;
  }
  if(footer) footer.style.display='block';
  wrap.innerHTML = items.map(i => `
    <div class="cart-item" data-slug="${i.slug}">
      <div style="flex:1">
        <div class="ci-title">${i.nome}</div>
        <div class="ci-meta">${catInfo(i.categoria).label} · ${i.carga}h</div>
        <div class="ci-controls">
          <div class="qty-ctrl">
            <button data-act="dec" aria-label="Diminuir quantidade">–</button>
            <span>${i.qty}</span>
            <button data-act="inc" aria-label="Aumentar quantidade">+</button>
          </div>
          <div class="ci-price">R$ ${brl(i.valor*i.qty)}</div>
        </div>
        <button class="ci-remove" data-act="rm">Remover</button>
      </div>
    </div>
  `).join('');
  const totalEl = document.getElementById('cartTotalVal');
  if(totalEl) totalEl.textContent = `R$ ${brl(cartTotal())}`;

  wrap.querySelectorAll('.cart-item').forEach(row=>{
    const slug = row.dataset.slug;
    const item = items.find(i=>i.slug===slug);
    row.querySelector('[data-act="inc"]').onclick = ()=>setQty(slug, item.qty+1);
    row.querySelector('[data-act="dec"]').onclick = ()=>setQty(slug, item.qty-1);
    row.querySelector('[data-act="rm"]').onclick = ()=>removeFromCart(slug);
  });
}

function openCart(){
  document.getElementById('cartOverlay')?.classList.add('open');
  document.getElementById('cartDrawer')?.classList.add('open');
  renderCartDrawer();
}
function closeCart(){
  document.getElementById('cartOverlay')?.classList.remove('open');
  document.getElementById('cartDrawer')?.classList.remove('open');
}

document.addEventListener('cart:changed', renderCartDrawer);
document.addEventListener('DOMContentLoaded', ()=>{
  updateCartBadge();
  document.querySelectorAll('[data-open-cart]').forEach(b=>b.addEventListener('click', openCart));
  document.getElementById('cartOverlay')?.addEventListener('click', closeCart);
  document.getElementById('cartClose')?.addEventListener('click', closeCart);
});

// -------------------------------------------------------------------
// Checkout — Mercado Pago (via Apps Script proxy) com fallback WhatsApp
// -------------------------------------------------------------------
async function iniciarCheckout(){
  const items = readCart();
  if(items.length===0) return;
  const btn = document.getElementById('checkoutBtn');
  const original = btn ? btn.innerHTML : null;
  if(btn){ btn.disabled=true; btn.innerHTML = "Gerando pagamento…"; }

  if(CONFIG.API_BASE){
    try{
      let buyer = {};
      try{ buyer = JSON.parse(sessionStorage.getItem('safeseg_buyer')) || {}; }catch(e){}
      const resp = await fetch(`${CONFIG.API_BASE}?action=checkout`, {
        method:"POST",
        headers:{"Content-Type":"text/plain"},
        body: JSON.stringify({items, buyer})
      });
      const data = await resp.json();
      if(data && data.init_point){
        window.location.href = data.init_point;
        return;
      }
      throw new Error(data.error || "Falha ao criar preferência de pagamento");
    }catch(e){
      console.error(e);
      showToast("Não foi possível iniciar o pagamento automático. Redirecionando via WhatsApp…");
    }
  }
  // fallback: monta o pedido e abre WhatsApp para fechamento manual
  const linhas = items.map(i=>`• ${i.nome} (${i.qty}x) — R$ ${brl(i.valor*i.qty)}`).join('%0A');
  const total = `%0A%0A*Total: R$ ${brl(cartTotal())}*`;
  const msg = `Olá! Quero finalizar a matrícula nos seguintes treinamentos:%0A${linhas}${total}`;
  window.open(`https://wa.me/${CONFIG.WHATSAPP_NUMERO}?text=${msg}`, '_blank');
  if(btn){ btn.disabled=false; btn.innerHTML = original; }
}
