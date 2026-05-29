/* pdfx-ui.js — UI shell (tab switching + layout detection)
   Most logic is stubbed — full implementation in next session */

// ══════════════════════════════════════
// LAYOUT DETECTION
// ══════════════════════════════════════

function isMobile()    { return window.innerWidth < 768; }
function isLandscape() {
  return window.innerWidth < 933
      && window.innerHeight < 501
      && window.innerWidth > window.innerHeight;
}

function applyLayout() {
  const mobile    = isMobile();
  const landscape = isLandscape();
  const deskLeft  = document.getElementById('desk-left');
  const lsLeft    = document.getElementById('landscape-left');
  const tabBar    = document.getElementById('tab-bar');

  if (!isMobile() && !isLandscape()) {
    // Desktop
    if (deskLeft) deskLeft.style.display = 'flex';
    if (lsLeft)   lsLeft.classList.add('hidden');
    if (tabBar)   tabBar.style.display = 'none';
  } else if (landscape) {
    // Mobile landscape
    if (deskLeft) deskLeft.style.display = 'none';
    if (lsLeft)   lsLeft.classList.remove('hidden');
    if (tabBar)   tabBar.style.display = 'block';
  } else {
    // Mobile portrait
    if (deskLeft) deskLeft.style.display = 'none';
    if (lsLeft)   lsLeft.classList.add('hidden');
    if (tabBar)   tabBar.style.display = 'block';
  }
}

window.addEventListener('resize', applyLayout);
window.addEventListener('orientationchange', () => setTimeout(applyLayout, 100));


// ══════════════════════════════════════
// TAB SWITCHING
// ══════════════════════════════════════

let currentTab = 'files';

function switchTab(tab) {
  currentTab = tab;

  // Update tab bar buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === 'tab-' + tab);
  });

  // Show/hide panels
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.remove('active');
  });
  const target = document.getElementById('panel-' + tab);
  if (target) target.classList.add('active');

  // Update file strips
  updateFileStrips();

  // Populate memory detail if about panel
  if (tab === 'about') populateMemoryDetail();
}


// ══════════════════════════════════════
// FILE STRIPS
// ══════════════════════════════════════

function updateFileStrips() {
  updateStrip('tools-strip-empty', 'tools-strip-icon', 'tools-strip-info',
              'tools-strip-name', 'tools-strip-meta', 'tools-strip-change');
  updateStrip('view-strip-empty', 'view-strip-icon', 'view-strip-info',
              'view-strip-name', 'view-strip-meta', 'view-strip-change');
}

function updateStrip(emptyId, iconId, infoId, nameId, metaId, changeId) {
  const f = selectedId ? getFileById(selectedId) : null;
  const show = !!f;

  setHidden(emptyId,  show);
  setHidden(iconId,  !show);
  setHidden(infoId,  !show);
  setHidden(changeId,!show);

  if (f) {
    const nameEl = document.getElementById(nameId);
    const metaEl = document.getElementById(metaId);
    if (nameEl) nameEl.textContent = f.name;
    if (metaEl) metaEl.textContent = formatBytes(f.size) + ' · ' + (f.isOriginal ? 'ORIGINAL' : 'DERIVED');
  }
}

function setHidden(id, hidden) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden', hidden);
}


// ══════════════════════════════════════
// STATUS + TOASTS
// ══════════════════════════════════════

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

  if (duration > 0) setTimeout(() => t.remove && t.remove(), duration);
  return t;
}


// ══════════════════════════════════════
// MODALS
// ══════════════════════════════════════

function openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

function showWarn(title, body, okLabel, okCallback, cancelCallback) {
  document.getElementById('warn-modal-title').textContent = title;
  document.getElementById('warn-modal-body').innerHTML = body;
  const okBtn = document.getElementById('warn-modal-ok');
  okBtn.textContent = okLabel || 'Continue';
  okBtn.onclick = () => { closeModal('warn-modal'); okCallback && okCallback(); };
  warnCancelCallback = cancelCallback || null;
  openModal('warn-modal');
}


// ══════════════════════════════════════
// SIDEBAR COLLAPSE
// ══════════════════════════════════════

let deskLeftCollapsed = false;
let lsLeftCollapsed   = false;

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
}


// ══════════════════════════════════════
// ABOUT PANEL — MEMORY DETAIL
// ══════════════════════════════════════

function toggleDetail(id) {
  const el  = document.getElementById(id);
  const btn = el?.previousElementSibling;
  if (!el) return;

  const open = el.classList.toggle('hidden') === false;
  // classList.toggle('hidden') removes hidden when opening
  // We want: clicking toggles visibility
  // Actually let's just check current state:
  const isNowVisible = !el.classList.contains('hidden');
  if (btn) {
    btn.textContent = (isNowVisible ? '▾ Hide' : '▸ Show') + btn.textContent.slice(2);
  }
  if (id === 'mem-detail') populateMemoryDetail();
}

function populateMemoryDetail() {
  const el = document.getElementById('mem-detail-text');
  if (!el) return;

  const wsTotal = workspace ? workspace.reduce((a, f) => a + f.size, 0) : 0;
  let html = `<strong>App file data:</strong> ${formatBytes(wsTotal)} of ${formatBytes(300 * 1024 * 1024)} max<br>`;

  if (window.performance && performance.memory) {
    const pm = performance.memory;
    html += `<strong>JS heap used:</strong> ${formatBytes(pm.usedJSHeapSize)}<br>`;
    html += `<strong>JS heap limit:</strong> ${formatBytes(pm.jsHeapSizeLimit)}<br>`;
    html += `<em>Chrome only — heap limit ≠ total RAM. All open tabs share this budget.</em>`;
  } else {
    html += `<em>Your browser doesn't expose memory info. Monitor your system when working with large files.</em>`;
  }

  el.innerHTML = html;
}


// ══════════════════════════════════════
// HELPERS
// ══════════════════════════════════════

function formatBytes(b) {
  if (b < 1024)       return b + ' B';
  if (b < 1048576)    return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

function getFileById(id) {
  return workspace ? workspace.find(f => f.id === id) : null;
}


// ══════════════════════════════════════
// BEFOREUNLOAD WARNING
// ══════════════════════════════════════

window.addEventListener('beforeunload', e => {
  if (workspace && workspace.length > 0) {
    e.preventDefault();
    e.returnValue = 'You have files in your workspace. Make sure you have downloaded everything you need.';
  }
});


// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════

(function init() {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  applyLayout();
  switchTab('files');
  setStatus('Ready — add files to begin');

  // Restore backup dismissed state
  if (localStorage.getItem('pdfx_backup_dismissed')) {
    backupDismissed = true;
  }

  console.log('PDFX v1.0 — shell loaded. JS logic coming in next session.');
})();
