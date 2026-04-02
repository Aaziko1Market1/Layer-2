/**
 * Aaziko Support Chat Widget — Embeddable Snippet
 *
 * === VENDOR PANEL (seller/manufacturer facing) ===
 *   <script>
 *     window.AAZIKO_WIDGET_CONFIG = {
 *       apiUrl: 'https://your-server.com/api/support-chat',
 *       position: 'bottom-right',
 *       userRole: 'seller',         // locked to seller — no switcher shown
 *       title: 'Vendor Support',
 *     };
 *   </script>
 *   <script src="https://your-server.com/widget/embed.js" async></script>
 *
 * === BUYER PANEL (importer/distributor facing) ===
 *   <script>
 *     window.AAZIKO_WIDGET_CONFIG = {
 *       apiUrl: 'https://your-server.com/api/support-chat',
 *       position: 'bottom-right',
 *       userRole: 'buyer',          // locked to buyer — no switcher shown
 *       title: 'Buyer Support',
 *     };
 *   </script>
 *   <script src="https://your-server.com/widget/embed.js" async></script>
 *
 * === ADMIN PANEL (operator/admin facing) ===
 *   <script>
 *     window.AAZIKO_WIDGET_CONFIG = {
 *       apiUrl: 'https://your-server.com/api/support-chat',
 *       position: 'bottom-left',
 *       userRole: 'admin',          // locked to admin — no switcher shown
 *       title: 'Admin Support',
 *     };
 *   </script>
 *   <script src="https://your-server.com/widget/embed.js" async></script>
 *
 * === VISITOR / PUBLIC PAGE (role switcher shown) ===
 *   <script>
 *     window.AAZIKO_WIDGET_CONFIG = {
 *       apiUrl: 'https://your-server.com/api/support-chat',
 *       position: 'bottom-right',
 *       // no userRole → shows visitor/buyer/seller switcher
 *     };
 *   </script>
 *   <script src="https://your-server.com/widget/embed.js" async></script>
 */
(function() {
  'use strict';

  if (window.__AAZIKO_WIDGET_LOADED) return;
  window.__AAZIKO_WIDGET_LOADED = true;

  var config = window.AAZIKO_WIDGET_CONFIG || {};
  var API_BASE = config.apiUrl || (window.location.protocol + '//' + window.location.host + '/api/support-chat');
  var position = config.position || 'bottom-right';
  var defaultRole = config.userRole || null;   // null = show switcher
  var widgetTitle = config.title || 'Aaziko Support';
  var lockRole = !!defaultRole;                // true = hide role switcher

  var sessionId = null;
  try { sessionId = localStorage.getItem('az_session_id'); } catch(e) {}
  // If role is locked by config, always use that — don't restore from localStorage
  var userRole = defaultRole || 'visitor';
  if (!lockRole) { try { userRole = localStorage.getItem('az_user_role') || 'visitor'; } catch(e) {} }

  var isOpen = false;
  var isSending = false;
  var firstMessage = true;

  // ── CREATE STYLES ──────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = '\
#az-w{--p:#1B4F72;--pl:#2471A3;--ac:#F39C12;--bg:#FFF;--bgl:#F8F9FA;--tx:#2C3E50;--txl:#7F8C8D;--bd:#E5E8EB;--ok:#27AE60;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;position:fixed;z-index:999999}\
#az-b{position:fixed;' + (position === 'bottom-left' ? 'left:24px' : 'right:24px') + ';bottom:24px;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,var(--p),var(--pl));border:none;cursor:grab;box-shadow:0 4px 20px rgba(27,79,114,.4);display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s;z-index:1000000;touch-action:none;user-select:none}\
#az-b:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(27,79,114,.5)}\
#az-b svg{width:28px;height:28px;fill:#fff;pointer-events:none}\
#az-b .bdg{position:absolute;top:-2px;right:-2px;width:18px;height:18px;background:var(--ac);border-radius:50%;border:2px solid #fff;display:none}\
#az-b.unr .bdg{display:block}\
#az-d{position:fixed;' + (position === 'bottom-left' ? 'left:24px' : 'right:24px') + ';bottom:96px;width:400px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 120px);background:var(--bg);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.12);display:none;flex-direction:column;overflow:hidden;z-index:1000000;border:1px solid var(--bd);animation:azu .3s ease}\
#az-d.op{display:flex}\
@keyframes azu{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}\
.azh{background:linear-gradient(135deg,var(--p),var(--pl));color:#fff;padding:16px 20px;display:flex;align-items:center;gap:12px;flex-shrink:0}\
.azha{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;flex-shrink:0}\
.azhi{flex:1;min-width:0}\
.azhn{font-size:16px;font-weight:600}\
.azhs{font-size:12px;opacity:.85;display:flex;align-items:center;gap:4px}\
.azhs::before{content:"";width:6px;height:6px;background:var(--ok);border-radius:50%}\
.azx{background:rgba(255,255,255,.15);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}\
.azx:hover{background:rgba(255,255,255,.3)}\
.azrb{display:flex;gap:6px;padding:10px 16px;background:var(--bgl);border-bottom:1px solid var(--bd);flex-shrink:0}\
.azr{flex:1;padding:6px 8px;border:1px solid var(--bd);border-radius:8px;background:#fff;color:var(--txl);font-size:12px;font-weight:500;cursor:pointer;transition:all .2s;text-align:center}\
.azr.ac{background:var(--p);color:#fff;border-color:var(--p)}\
.azr:hover:not(.ac){border-color:var(--pl);color:var(--p)}\
.azm{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth}\
.azm::-webkit-scrollbar{width:4px}.azm::-webkit-scrollbar-thumb{background:#ccc;border-radius:4px}\
.msg{max-width:85%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;word-wrap:break-word;white-space:pre-wrap}\
.mu{align-self:flex-end;background:var(--p);color:#fff;border-bottom-right-radius:4px}\
.mb{align-self:flex-start;background:var(--bgl);color:var(--tx);border-bottom-left-radius:4px;border:1px solid var(--bd)}\
.mt{font-size:10px;opacity:.6;margin-top:4px}\
.mu .mt{text-align:right}\
.aztp{align-self:flex-start;padding:10px 14px;background:var(--bgl);border-radius:12px;border-bottom-left-radius:4px;border:1px solid var(--bd);display:none;gap:4px;align-items:center}\
.aztp.sh{display:flex}\
.aztd{width:6px;height:6px;background:var(--txl);border-radius:50%;animation:azbn 1.4s infinite}\
.aztd:nth-child(2){animation-delay:.2s}.aztd:nth-child(3){animation-delay:.4s}\
@keyframes azbn{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}\
.azwl{text-align:center;padding:16px;color:var(--txl);font-size:13px;line-height:1.5}\
.azwl strong{color:var(--tx);display:block;font-size:15px;margin-bottom:6px}\
.azqa{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 12px;flex-shrink:0}\
.azqb{padding:6px 12px;border:1px solid var(--bd);border-radius:20px;background:#fff;color:var(--p);font-size:12px;cursor:pointer;transition:all .2s;white-space:nowrap}\
.azqb:hover{background:var(--p);color:#fff;border-color:var(--p)}\
.azia{display:flex;align-items:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--bd);background:var(--bg);flex-shrink:0}\
#az-i{flex:1;border:1px solid var(--bd);border-radius:12px;padding:10px 14px;font-size:14px;font-family:inherit;resize:none;min-height:42px;max-height:100px;outline:none;transition:border-color .2s;line-height:1.4;color:var(--tx)}\
#az-i:focus{border-color:var(--pl)}\
#az-s{width:42px;height:42px;border-radius:50%;background:var(--p);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s,transform .1s;flex-shrink:0}\
#az-s:hover{background:var(--pl)}#az-s:disabled{opacity:.5;cursor:not-allowed}\
#az-s svg{width:18px;height:18px;fill:#fff;pointer-events:none}\
.azpw{text-align:center;padding:6px;font-size:10px;color:var(--txl);background:var(--bgl);border-top:1px solid var(--bd);flex-shrink:0}\
.azpw a{color:var(--p);text-decoration:none;font-weight:600}\
@media(max-width:480px){#az-d{bottom:0;right:0;left:0;width:100vw;height:100vh;max-height:100vh;border-radius:0}}';
  document.head.appendChild(style);

  // ── CREATE DOM ─────────────────────────────────────────
  var container = document.createElement('div');
  container.id = 'az-w';
  var roleLabel = lockRole
    ? (userRole === 'seller' ? 'Vendor / Seller' : userRole === 'buyer' ? 'Buyer' : userRole === 'admin' ? 'Admin' : userRole)
    : '';
  var roleSwitcherHtml = lockRole
    ? '<div class="azrb" style="justify-content:flex-start"><span style="color:#9ca3af;font-size:11px;margin-right:6px">Signed in as:</span><span style="background:#1e3a5f;color:#60a5fa;border:1px solid #2563eb44;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:600">' + roleLabel + '</span></div>'
    : '<div class="azrb"><button class="azr' + (userRole==='visitor'?' ac':'') + '" data-r="visitor">Visitor</button><button class="azr' + (userRole==='buyer'?' ac':'') + '" data-r="buyer">Buyer</button><button class="azr' + (userRole==='seller'?' ac':'') + '" data-r="seller">Seller</button></div>';

  container.innerHTML = '\
<button id="az-b" title="' + widgetTitle + '"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg><span class="bdg"></span></button>\
<div id="az-d">\
<div class="azh"><div class="azha">A</div><div class="azhi"><div class="azhn">' + widgetTitle + '</div><div class="azhs">Online — powered by AI</div></div><button class="azx" id="az-x">&times;</button></div>\
' + roleSwitcherHtml + '\
<div class="azm" id="az-ms"><div class="azwl"><strong>Welcome to Aaziko Support!</strong>Ask me anything about sourcing from India, our platform, trade processes, pricing, shipping, or getting started.</div></div>\
<div class="aztp" id="az-tp"><div class="aztd"></div><div class="aztd"></div><div class="aztd"></div></div>\
<div class="azqa" id="az-qa">\
<button class="azqb" data-q="What is Aaziko?">What is Aaziko?</button>\
<button class="azqb" data-q="How does sourcing work?">How sourcing works</button>\
<button class="azqb" data-q="What are the payment terms?">Payment terms</button>\
<button class="azqb" data-q="How is quality assured?">Quality assurance</button>\
<button class="azqb" data-q="How do I get started as a seller?">Join as seller</button>\
</div>\
<div class="azia"><textarea id="az-i" placeholder="Type your question..." rows="1"></textarea><button id="az-s" title="Send"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button></div>\
<div class="azpw">Powered by <a href="https://aaziko.com" target="_blank">Aaziko AI</a></div>\
</div>';

  document.body.appendChild(container);

  var btnEl = document.getElementById('az-b');
  var dlg = document.getElementById('az-d');
  var xBtn = document.getElementById('az-x');
  var msEl = document.getElementById('az-ms');
  var tpEl = document.getElementById('az-tp');
  var inEl = document.getElementById('az-i');
  var sBtn = document.getElementById('az-s');
  var qaEl = document.getElementById('az-qa');

  // ── DRAG ───────────────────────────────────────────────
  var dragging = false, dragMoved = false, dsx, dsy, bsx, bsy;

  btnEl.addEventListener('pointerdown', function(e) {
    dragging = true; dragMoved = false;
    dsx = e.clientX; dsy = e.clientY;
    var r = btnEl.getBoundingClientRect();
    bsx = r.left; bsy = r.top;
    btnEl.setPointerCapture(e.pointerId);
    btnEl.style.transition = 'none';
  });

  document.addEventListener('pointermove', function(e) {
    if (!dragging) return;
    var dx = e.clientX - dsx, dy = e.clientY - dsy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
    if (!dragMoved) return;
    var nx = Math.max(0, Math.min(window.innerWidth - 60, bsx + dx));
    var ny = Math.max(0, Math.min(window.innerHeight - 60, bsy + dy));
    btnEl.style.left = nx + 'px'; btnEl.style.top = ny + 'px';
    btnEl.style.right = 'auto'; btnEl.style.bottom = 'auto';
  });

  document.addEventListener('pointerup', function() {
    if (!dragging) return;
    dragging = false;
    btnEl.style.transition = '';
    if (!dragMoved) toggle();
  });

  // ── TOGGLE ─────────────────────────────────────────────
  function toggle() {
    isOpen = !isOpen;
    if (isOpen) {
      dlg.classList.add('op'); btnEl.classList.remove('unr');
      inEl.focus(); scroll();
    } else {
      dlg.classList.remove('op');
    }
  }

  xBtn.addEventListener('click', function() { isOpen = false; dlg.classList.remove('op'); });

  // ── ROLE ───────────────────────────────────────────────
  if (!lockRole) {
    container.querySelectorAll('.azr').forEach(function(rb) {
      rb.addEventListener('click', function() {
        container.querySelectorAll('.azr').forEach(function(b) { b.classList.remove('ac'); });
        rb.classList.add('ac');
        userRole = rb.dataset.r;
        try { localStorage.setItem('az_user_role', userRole); } catch(e) {}
      });
    });
  }

  // ── QUICK ACTIONS ──────────────────────────────────────
  qaEl.addEventListener('click', function(e) {
    var qb = e.target.closest('.azqb');
    if (qb && qb.dataset.q) send(qb.dataset.q);
  });

  // ── INPUT ──────────────────────────────────────────────
  inEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });
  inEl.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
  });
  sBtn.addEventListener('click', doSend);

  function doSend() {
    var t = inEl.value.trim();
    if (t && !isSending) send(t);
  }

  // ── SEND ───────────────────────────────────────────────
  function send(text) {
    if (isSending) return;
    isSending = true; sBtn.disabled = true;
    addMsg(text, 'u');
    inEl.value = ''; inEl.style.height = 'auto';
    if (firstMessage) { qaEl.style.display = 'none'; firstMessage = false; }
    showTp(true);

    fetch(API_BASE + '/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, message: text, userRole: userRole }),
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.sessionId) {
        sessionId = d.sessionId;
        try { localStorage.setItem('az_session_id', sessionId); } catch(e) {}
      }
      addMsg(d.reply || d.error || 'Something went wrong.', 'b');
    })
    .catch(function() {
      addMsg('Unable to connect. Please check your connection and try again.', 'b');
    })
    .finally(function() {
      showTp(false); isSending = false; sBtn.disabled = false;
    });
  }

  // ── UI HELPERS ─────────────────────────────────────────
  function addMsg(text, who) {
    var wl = msEl.querySelector('.azwl');
    if (wl) wl.remove();

    var d = document.createElement('div');
    d.className = 'msg ' + (who === 'u' ? 'mu' : 'mb');
    var c = document.createElement('div');
    c.textContent = text;
    d.appendChild(c);

    var t = document.createElement('div');
    t.className = 'mt';
    var n = new Date();
    t.textContent = ('0'+n.getHours()).slice(-2) + ':' + ('0'+n.getMinutes()).slice(-2);
    d.appendChild(t);

    msEl.appendChild(d);
    scroll();
  }

  function showTp(s) {
    if (s) { tpEl.classList.add('sh'); msEl.appendChild(tpEl); }
    else { tpEl.classList.remove('sh'); }
    scroll();
  }

  function scroll() {
    requestAnimationFrame(function() { msEl.scrollTop = msEl.scrollHeight; });
  }
})();
