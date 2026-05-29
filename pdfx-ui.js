/* ════════════════════════════════════════════════════════
   pdfx-ui.js
   Tab switching · layout detection · tool grid
   File strips · toasts · status · modals · init
   ════════════════════════════════════════════════════════ */

let currentTab = 'files';
let deskLeftCollapsed = false;
let lsLeftCollapsed   = false;

/* ══════════════════════════════════════
   LAYOUT DETECTION
══════════════════════════════════════ */
function isMobile()    { return window.innerWidth < 768; }
function isLandscape() {
  return window.innerWidth < 933 && window.innerHeight < 501 && window.innerWidth > window.innerHeight;
}

function applyLayout() {
  const mobile    = isMobile();
  const landscape = isLandscape();
  const deskLeft  = document.getElementById('desk-left');
  const lsLeft    = document.getElementById('landscape-left');
  const tabBar    = document.getElementById('tab-bar');
  const appBody   = document.getElementById('app-body');

  if (!mobile && !landscape) {
    // Desktop
    if (deskLeft) deskLeft.style.display = 'flex';
    if (lsLeft)   lsLeft.classList.add('hidden');
    if (tabBar)   tabBar.style.display = 'none';
    if (appBody)  appBody.style.flexDirection = 'row';
    // Show tools + view panels simultaneously on desktop
    const tp = document.getElementById('panel-tools');
    const vp = document.getElementById('panel-view');
    if (tp) tp.classList.add('active');
    if (vp) vp.classList.add('active');
    document.getElementById('panel-files')?.classList.remove('active');
  } else if (landscape) {
    // Mobile landscape
    if (deskLeft) deskLeft.style.display = 'none';
    if (lsLeft)   lsLeft.classList.remove('hidden');
    if (tabBar)   tabBar.style.display = 'block';
    if (appBody)  appBody.style.flexDirection = 'row';
  } else {
    // Mobile portrait
    if (deskLeft) deskLeft.style.display = 'none';
    if (lsLeft)   lsLeft.classList.add('hidden');
    if (tabBar)   tabBar.style.display = 'block';
    if (appBody)  appBody.style.flexDirection = 'column';
  }
}

window.addEventListener('resize', applyLayout);
window.addEventListener('orientationchange', () => setTimeout(applyLayout, 100));

/* ══════════════════════════════════════
   TAB SWITCHING
══════════════════════════════════════ */
function switchTab(tab) {
  currentTab = tab;

  // Update tab bar
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === 'tab-' + tab);
  });

  // On mobile/landscape: hide all panels, show target
  if (isMobile() || isLandscape()) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-' + tab)?.classList.add('active');
  } else {
    // Desktop: keep tools+view always visible, toggle about
    if (tab === 'about') {
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-about')?.classList.add('active');
    } else if (tab === 'files') {
      document.getElementById('panel-about')?.classList.remove('active');
      document.getElementById('panel-tools')?.classList.add('active');
      document.getElementById('panel-view')?.classList.add('active');
    }
  }

  updateFileStrips();
  if (tab === 'about') populateMemoryDetail();
  if (tab === 'tools') buildToolGrid();
}

/* ══════════════════════════════════════
   TOOL GRID (re-build without losing scroll)
══════════════════════════════════════ */
const TOOL_GROUPS = [
  { label: 'View & Read', tools: [
    { id: null,          icon: '👁',      name: 'View',         action: ()=>switchTab('view') },
    { id: null,          icon: '📖',      name: 'Reader',       action: openReader },
    { id: null,          icon: '✏️',      name: 'Annotate',     action: openAnnotate },
  ]},
  { label: 'Organize', tools: [
    { id: 'merge',       icon: '🔗',      name: 'Merge' },
    { id: 'split',       icon: '✂️',      name: 'Split' },
    { id: 'reorder',     icon: '🔀',      name: 'Reorder' },
    { id: 'rotate',      icon: '🔄',      name: 'Rotate' },
    { id: 'pages',       icon: '🗂',      name: 'Pages' },
  ]},
  { label: 'Transform', tools: [
    { id: 'compress',    icon: '📦',      name: 'Compress' },
    { id: 'watermark',   icon: '🔏',      name: 'Watermark' },
    { id: 'headerfooter',icon: '📑',      name: 'Header/Footer' },
    { id: 'pagenums',    icon: '#️⃣',      name: 'Page Nums' },
    { id: 'grayscale',   icon: '🖤',      name: 'Grayscale' },
    { id: 'img2pdf',     icon: '🖼️',      name: 'Image→PDF' },
  ]},
  { label: 'Extract', tools: [
    { id: 'extracttext', icon: '📝',      name: 'Extract Text' },
    { id: 'pdf2img',     icon: '🌅',      name: 'PDF→Images' },
    { id: 'redact',      icon: '■',       name: 'Redact' },
  ]},
  { label: 'Security', tools: [
    { id: 'protect',     icon: '🔒',      name: 'Protect' },
    { id: 'unlock',      icon: '🔓',      name: 'Unlock' },
  ]},
];

function buildToolGrid() {
  const inner = document.getElementById('tools-inner');
  if (!inner) return;

  // Only rebuild if showing grid, not an active tool
  if (inner.querySelector('.active-tool-wrap')) return;

  // Ensure scroll wrapper exists
  let scroll = document.getElementById('tool-grid-scroll');
  if (!scroll) {
    inner.innerHTML = '';
    scroll = document.createElement('div');
    scroll.className = 'tool-grid-scroll';
    scroll.id = 'tool-grid-scroll';
    inner.appendChild(scroll);
  }
  if (scroll.children.length > 0) return; // already built

  TOOL_GROUPS.forEach(group => {
    const lbl = document.createElement('div');
    lbl.className = 'tool-group-label';
    lbl.textContent = group.label;
    scroll.appendChild(lbl);

    const grid = document.createElement('div');
    grid.className = 'tool-grid';

    group.tools.forEach(t => {
      const card = document.createElement('div');
      card.className = 'tool-card';
      card.innerHTML = `<div class="tool-card-icon">${t.icon}</div><div class="tool-card-name">${t.name}</div>`;
      card.onclick = () => {
        if (t.action) { t.action(); return; }
        openTool(t.id, t.icon, t.name);
      };
      grid.appendChild(card);
    });
    scroll.appendChild(grid);
  });
}

/* ══════════════════════════════════════
   FILE STRIPS
══════════════════════════════════════ */
function updateFileStrips() {
  _updateStrip('tools-strip-empty','tools-strip-icon','tools-strip-info','tools-strip-name','tools-strip-meta','tools-strip-change', selectedId);
  _updateStrip('view-strip-empty','view-strip-icon','view-strip-info','view-strip-name','view-strip-meta','view-strip-change', viewingId||selectedId);
}

function _updateStrip(emptyId,iconId,infoId,nameId,metaId,changeId,fileId) {
  const f = fileId ? getFileById(fileId) : null;
  const show = !!f;
  _setHidden(emptyId,  show);
  _setHidden(iconId,  !show);
  _setHidden(infoId,  !show);
  _setHidden(changeId,!show);
  if (f) {
    const ne = document.getElementById(nameId); if (ne) ne.textContent = f.name;
    const me = document.getElementById(metaId); if (me) me.textContent = formatBytes(f.size) + ' · ' + (f.isOriginal ? 'ORIGINAL' : 'DERIVED');
  }
}

function _setHidden(id, hidden) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden', hidden);
}

/* ══════════════════════════════════════
   STATUS + TOASTS
══════════════════════════════════════ */
function setStatus(msg, type = '') {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (dot)  dot.className  = 'status-dot' + (type ? ' ' + type : '');
  if (text) text.textContent = msg;
}

function toast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<span style="flex:1">${msg}</span><span class="toast-close" onclick="this.parentElement.remove()">✕</span>`;
  container.appendChild(t);
  if (duration > 0) setTimeout(() => { if (t.parentNode) t.remove(); }, duration);
  return t;
}

/* ══════════════════════════════════════
   MODALS
══════════════════════════════════════ */
function openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

function showWarn(title, body, okLabel, okCallback, cancelCallback) {
  const titleEl = document.getElementById('warn-modal-title');
  const bodyEl  = document.getElementById('warn-modal-body');
  const okBtn   = document.getElementById('warn-modal-ok');
  if (titleEl) titleEl.textContent = title;
  if (bodyEl)  bodyEl.innerHTML = body;
  if (okBtn) {
    okBtn.textContent = okLabel || 'Continue';
    okBtn.onclick = () => { closeModal('warn-modal'); okCallback && okCallback(); };
  }
  warnCancelCallback = cancelCallback || null;
  openModal('warn-modal');
}

/* ══════════════════════════════════════
   SIDEBAR COLLAPSE
══════════════════════════════════════ */
function toggleDeskLeft() {
  const el = document.getElementById('desk-left');
  if (!el) return;
  deskLeftCollapsed = !deskLeftCollapsed;
  el.classList.toggle('collapsed', deskLeftCollapsed);
}

function toggleLandscapeLeft() {
  const el = document.getElementById('landscape-left');
  if (!el) return;
  lsLeftCollapsed = !lsLeftCollapsed;
  el.classList.toggle('collapsed', lsLeftCollapsed);
  const scroll = document.getElementById('ls-ws-scroll');
  if (scroll) scroll.classList.toggle('hidden', lsLeftCollapsed);
}

/* ══════════════════════════════════════
   ABOUT PANEL
══════════════════════════════════════ */
function toggleDetail(id) {
  const el  = document.getElementById(id);
  const btn = el?.previousElementSibling;
  if (!el) return;
  const nowVisible = el.classList.toggle('hidden') === false;
  // classList.toggle returns true if class was added (i.e., now hidden)
  // We need to invert: if toggle('hidden') returns true → class added → now hidden
  const isVisible = !el.classList.contains('hidden');
  if (btn) btn.textContent = (isVisible ? '▾ Hide' : '▸ Show') + ' memory details';
  if (isVisible && id === 'mem-detail') populateMemoryDetail();
}

function populateMemoryDetail() {
  const el = document.getElementById('mem-detail-text');
  if (!el) return;
  const wsTotal = typeof totalWsBytes === 'function' ? totalWsBytes() : 0;
  let html = `<strong>App file data in workspace:</strong> ${formatBytes(wsTotal)} of ${formatBytes(300*1024*1024)} max<br>`;
  if (window.performance && performance.memory) {
    const pm = performance.memory;
    html += `<strong>JS heap used:</strong> ${formatBytes(pm.usedJSHeapSize)}<br>`;
    html += `<strong>JS heap limit:</strong> ${formatBytes(pm.jsHeapSizeLimit)}<br>`;
    html += `<em>Note: Chrome only. Heap limit ≠ total available RAM. All open tabs share this budget. Other tabs may significantly reduce what is actually available.</em>`;
  } else {
    html += `<em>Your browser does not expose memory info to web pages. Monitor your system Activity Monitor or Task Manager when working with large files.</em>`;
  }
  el.innerHTML = html;
}

/* ══════════════════════════════════════
   DRAG-DROP ON FULL WINDOW (prevent default)
══════════════════════════════════════ */
document.body.addEventListener('dragover', e => e.preventDefault());
document.body.addEventListener('drop',     e => e.preventDefault());

/* ══════════════════════════════════════
   BEFOREUNLOAD WARNING
══════════════════════════════════════ */
window.addEventListener('beforeunload', e => {
  if (workspace && workspace.length > 0) {
    e.preventDefault();
    e.returnValue = 'You have files in your workspace. Make sure you have downloaded everything you need.';
  }
});

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
(function init() {
  // Set pdf.js worker
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  // Restore backup dismissed flag
  if (localStorage.getItem('pdfx_backup_dismissed')) {
    backupDismissed = true;
  }

  // Apply layout for current viewport
  applyLayout();

  // Start on files tab (mobile) or build tool grid (desktop)
  if (isMobile() || isLandscape()) {
    switchTab('files');
  } else {
    buildToolGrid();
    updateFileStrips();
  }

  setStatus('Ready — add files to begin');
  console.log('PDFX v1.0 loaded');
})();
