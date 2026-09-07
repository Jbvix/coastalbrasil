/*
 * Coastal Navigator Brasil — espelhamento da navegação
 * Autor: Jossian Brito (Charlie Bravo)
 *
 * A embarcação transmite posição e telemetria por um canal do Supabase
 * Realtime identificado por um token aleatório. Quem está em terra abre o app
 * com ?watch=TOKEN e vê os mesmos dados ao vivo, em modo somente-leitura. O
 * Realtime é efêmero: posição não é gravada em banco.
 *
 * DOIS LADOS, DUAS RESPONSABILIDADES
 *   Embarcação  cria e revoga links, registra o token no servidor e transmite.
 *   Observador  valida o token, assina o canal, diagnostica falhas e reconecta.
 *
 * O QUE ESTE ARQUIVO APRENDEU DA PRÁTICA (v2.2.1)
 *   · `supa.rpc()` NÃO lança exceção em erro do servidor — devolve
 *     { data, error } e só lança em falha de rede. Envolver em try/catch e
 *     ignorar o `error` produz link que nasce morto.
 *   · "Erro de conexão" não é diagnóstico. Sem internet no aparelho, backend
 *     fora do ar e canal caído têm consertos diferentes e donos diferentes.
 *   · Conectado não é o mesmo que recebendo: a embarcação pode ter parado de
 *     transmitir, e isso precisa de sinalização própria.
 *
 * Depende de globais do app.html (map, waypoints, tripData, drawBoat,
 * recordTrackPoint, navFollow…) e de escapeHtml (nautical.js). Carregado como
 * script clássico, antes do bloco principal.
 */

// ═══════════════════════════════════════════════════════════════════════
// ESPELHAMENTO DE NAVEGAÇÃO (token + Supabase Realtime broadcast)
// ═══════════════════════════════════════════════════════════════════════
/*
A embarcação transmite (broadcast) sua posição e telemetria por um canal
identificado por um token aleatório. Quem está em terra abre o app com
?watch=TOKEN e recebe os mesmos dados ao vivo, em modo somente-leitura.
O Realtime é efêmero (não grava posição em banco).
*/
const SUPA_URL = 'https://nsbeddfkcdyssrirrhzt.supabase.co';
const SUPA_KEY = 'sb_publishable_RJjmXL721BwcD8fHfF0jyw_zHtlBlTb';
let supaClient = null;
let mirrorShares = [];      // [{ token, label, channel, expiresAt, viewers }]
let mirrorToken = null;     // token do lado OBSERVADOR (?watch=)
let watchMode = false;      // true quando aberto como observador (?watch=)
let mirrorRouteLayer = null;
let mirrorWaypoints = [];        // waypoints recebidos (lado observador) p/ o botão INFO
let mirrorAttitude = null;       // atitude (roll/pitch/proa) recebida p/ o painel 3D do observador
let shipAttitude = null;         // atitude atual (sensores) p/ transmitir aos observadores
let viewerChannel = null;        // canal do observador (terra)
let viewerRecheckTimer = null;   // revalida periodicamente revogação/expiração
let _lastBroadcastMs = 0;            // throttle de transmissão
const MIRROR_INTERVAL_MS = 3000;     // transmite no máx. 1x a cada 3s (economiza cota do Supabase)
const SHARES_KEY = 'coastal_nav_shares';

function getSupa() {
  if (!supaClient) {
    if (!window.supabase || !window.supabase.createClient) return null;
    supaClient = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
      realtime: { params: { eventsPerSecond: 5 } }
    });
  }
  return supaClient;
}

/* Gera um token curto e legível para o canal de compartilhamento. */
function genToken() {
  const bytes = new Uint8Array(6);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Registro persistente de compartilhamentos ───
function loadShares() {
  try {
    const arr = JSON.parse(localStorage.getItem(SHARES_KEY) || '[]');
    mirrorShares = arr.map(x => ({
      token: x.token, label: x.label, expiresAt: x.expiresAt || null,
      channel: null, viewers: 0, dbOk: !!x.dbOk
    }));
  } catch (e) { mirrorShares = []; }
}
function persistShares() {
  try {
    localStorage.setItem(SHARES_KEY, JSON.stringify(mirrorShares.map(s => ({
      token: s.token, label: s.label, expiresAt: s.expiresAt || null, dbOk: !!s.dbOk
    }))));
  } catch (e) { }
}

/*
═══════════════════════════════════════════════════════════════════════
REGISTRO DO COMPARTILHAMENTO NO SERVIDOR
═══════════════════════════════════════════════════════════════════════

Um link de acompanhamento só funciona se o token estiver REGISTRADO no
servidor: é ele que o observador consulta em check_nav_share antes de
assinar o canal. Token não registrado = "Link inválido" para quem recebeu.

DUAS ARMADILHAS que faziam links nascerem mortos:

1. `supa.rpc()` NÃO LANÇA EXCEÇÃO em erro do servidor. O cliente devolve
   { data, error } e só lança em falha de rede. Um try/catch sozinho,
   portanto, não vê erro nenhum vindo do banco.

2. O código marcava `_dbSynced = true` ANTES de chamar, e descartava os
   dois desfechos com `.then(() => {}, () => {})`. Com o backend fora do
   ar, o link era gerado, copiado e enviado — e o token nunca chegava ao
   servidor. Quem recebia via "Link inválido", sem que ninguém soubesse
   por quê.

Agora a confirmação é honesta: `dbOk` só vira true depois que o servidor
confirma, o estado é persistido, aparece na lista, e o registro é tentado
de novo sozinho quando a conexão volta.
*/
async function registrarShare(s) {
  const supa = getSupa();
  if (!supa) return false;
  try {
    const { error } = await supa.rpc('create_nav_share', {
      p_token: s.token, p_label: s.label,
      p_vessel: tripData ? tripData.vesselName : null, p_expires: s.expiresAt || null
    });
    s.dbOk = !error;                     // erro do servidor NÃO vem como exceção
  } catch (e) {
    s.dbOk = false;                      // falha de rede
  }
  persistShares();
  return s.dbOk;
}

/* Tenta registrar de novo tudo o que ainda não foi confirmado. */
async function ressincronizarShares() {
  const pendentes = mirrorShares.filter(s => !s.dbOk);
  if (!pendentes.length) return;
  for (const s of pendentes) await registrarShare(s);
  renderShareList();
}

// ─── Canais (criados sob demanda; ativos enquanto navegando) ───
function ensureShareChannel(s) {
  if (s.channel) return;
  const supa = getSupa();
  if (!supa) return;
  // Garante a linha no banco (idempotente) — habilita revogação/expiração
  if (!s.dbOk) registrarShare(s).then(() => renderShareList());
  s.channel = supa.channel('coastal-nav-' + s.token, { config: { broadcast: { self: false } } });
  // Presença (Nível 2): conta observadores conectados a este compartilhamento
  s.channel.on('presence', { event: 'sync' }, () => {
    try { s.viewers = Object.keys(s.channel.presenceState()).length; } catch (e) { s.viewers = 0; }
    if (document.getElementById('shareModal').classList.contains('active')) renderShareList();
  });
  s.channel.subscribe(() => { });
}
function ensureAllShareChannels() { mirrorShares.forEach(ensureShareChannel); }
function closeShareChannels() {
  mirrorShares.forEach(s => {
    if (s.channel) { try { getSupa().removeChannel(s.channel); } catch (e) { } s.channel = null; }
  });
}

/* Abre o gerenciador de compartilhamentos. (chamado pelos botões 📤) */
function toggleShare() { openShareManager(); }
window.addEventListener('online', () => { if (!watchMode) ressincronizarShares(); });

function openShareManager() {
  ressincronizarShares();
  if (watchMode) return;
  ensureAllShareChannels();
  renderShareList();
  document.getElementById('shareModal').classList.add('active');
}
function closeShareModal() {
  document.getElementById('shareModal').classList.remove('active');
}

/* Cria um novo compartilhamento nomeado (token + canal + linha no banco). */
async function createShare() {
  const supa = getSupa();
  if (!supa) { alert('⚠️ Tempo real indisponível (sem conexão).'); return; }
  const input = document.getElementById('shareLabelInput');
  const label = (input.value || '').trim() || ('Link ' + (mirrorShares.length + 1));
  const hours = parseInt((document.getElementById('shareExpiry') || {}).value || '24', 10);
  const expiresAt = hours > 0 ? new Date(Date.now() + hours * 3600000).toISOString() : null;
  const s = { token: genToken(), label, expiresAt, channel: null, viewers: 0, dbOk: false };
  mirrorShares.push(s);
  persistShares();
  input.value = '';
  renderShareList();
  updateShareButtons();

  // Só entrega o link depois de saber se o servidor aceitou o token.
  const registrado = await registrarShare(s);
  renderShareList();
  ensureShareChannel(s);

  if (!registrado) {
    alert('⚠️ Link criado, mas AINDA NÃO REGISTRADO no servidor.\n\n' +
          'Quem abrir agora vai ver "Link inválido". O registro será tentado ' +
          'de novo sozinho assim que a conexão voltar — o link fica marcado ' +
          'na lista até lá.\n\nNão envie ainda.');
  }
}

/* Revoga um compartilhamento específico (servidor + fecha canal; quem tem o link perde o acesso). */
async function revokeShare(token) {
  const i = mirrorShares.findIndex(s => s.token === token);
  if (i === -1) return;
  const s = mirrorShares[i];

  /*
  Revogação é o oposto do registro, e falha da mesma forma silenciosa.

  Fechar o canal local só interrompe a TRANSMISSÃO. Quem tem o link
  continua com acesso enquanto o token estiver válido no servidor — e o
  comandante, que acabou de ver o item sumir da lista, acredita que cortou.
  Aqui o item só sai da lista se o servidor confirmar. Se não confirmar, ele
  volta marcado, para uma nova tentativa.
  */
  const supa = getSupa();
  let confirmado = false;
  if (supa) {
    try {
      const { error } = await supa.rpc('revoke_nav_share', { p_token: token });
      confirmado = !error;
    } catch (e) { confirmado = false; }
  }

  if (s.channel) { try { supa && supa.removeChannel(s.channel); } catch (e) { } s.channel = null; }

  if (confirmado) {
    mirrorShares.splice(i, 1);
  } else {
    s.dbOk = false;      // aparece na lista como pendente e será retentado
    alert('⚠️ NÃO foi possível revogar no servidor.\n\n' +
          'A transmissão parou, mas quem tem este link ainda pode ter acesso ' +
          'até a expiração. Tente de novo quando a conexão voltar.');
  }
  persistShares();
  renderShareList();
  updateShareButtons();
}

function shareLinkFor(token) {
  return `${location.origin + location.pathname}?watch=${token}`;
}



/* Renderiza a lista de compartilhamentos no modal. */
function renderShareList() {
  const el = document.getElementById('shareList');
  if (!el) return;
  if (!mirrorShares.length) {
    el.innerHTML = '<p style="color:#90CAF9;font-size:.85rem;margin:8px 0;">Nenhum compartilhamento criado. Crie um link acima para alguém acompanhar em terra.</p>';
    return;
  }
  const navMsg = navActive ? '' : '<p style="color:#FFB74D;font-size:.78rem;margin:0 0 8px;">⚠️ A transmissão começa quando você iniciar a Navegação GPS.</p>';
  const fmtExp = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  el.innerHTML = navMsg + mirrorShares.map(s => {
    const expired = s.expiresAt && new Date(s.expiresAt) <= new Date();
    const expTxt = expired ? '⏳ expirado' : (s.expiresAt ? 'expira ' + fmtExp(s.expiresAt) : 'sem expiração');
    const viewers = navActive ? ` · 👁️ ${s.viewers || 0} acompanhando` : '';
    // Estado de registro visível: um link não registrado NÃO funciona para
    // quem o recebe, e antes isso ficava invisível até o outro reclamar.
    const pendente = s.dbOk ? '' :
      '<div class="share-pendente">⚠️ Ainda não registrado no servidor — ' +
      'quem abrir agora verá "Link inválido". Tentando de novo…</div>';
    return `
    <div class="share-item${s.dbOk ? '' : ' pendente'}">
      <div class="share-item-head">
        <strong>${escapeHtml(s.label)}</strong>
        <button class="nav-icon-btn" title="Revogar este acesso" onclick="revokeShare('${s.token}')">🗑️</button>
      </div>
      ${pendente}
      <div class="share-meta">${expTxt}${viewers}</div>
      <div class="share-link-row">
        <input type="text" readonly value="${shareLinkFor(s.token)}" onclick="this.select()">
        <button class="btn" onclick="copyShareLinkText('${shareLinkFor(s.token)}', event)" title="Copiar">📋</button>
      </div>
    </div>`;
  }).join('');
}

function copyShareLinkText(link, ev) {
  const btn = ev && ev.target;
  const done = () => { if (btn) { const o = btn.textContent; btn.textContent = '✅'; setTimeout(() => btn.textContent = o, 1500); } };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(done).catch(done);
  } else {
    const t = document.createElement('textarea'); t.value = link; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch (e) { } document.body.removeChild(t); done();
  }
}

/* Atualiza os botões 📤 conforme a quantidade de compartilhamentos. */
function updateShareButtons() {
  const n = mirrorShares.length;
  const big = document.getElementById('navShareBig');
  if (big) {
    big.classList.toggle('sharing', n > 0);
    big.textContent = n > 0 ? `📤 Compartilhando (${n}) — gerenciar` : '📤 Compartilhar navegação';
  }
  const ic = document.getElementById('navShareBtn');
  if (ic) ic.style.background = n > 0 ? 'rgba(105,240,174,0.5)' : 'transparent';
}
