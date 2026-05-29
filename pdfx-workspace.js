/* ════════════════════════════════════════════════════════
   pdfx-workspace.js
   File loading · workspace state · card rendering
   Download modal · browser backup · memory tracking
   ════════════════════════════════════════════════════════ */

const MAX_FILE_BYTES  = 100 * 1024 * 1024;
const WARN_FILE_BYTES =  50 * 1024 * 1024;
const MAX_WS_BYTES    = 300 * 1024 * 1024;
const WARN_WS_BYTES   = 200 * 1024 * 1024;

let workspace          = [];
let nextId             = 1;
let selectedId         = null;
let viewingId          = null;
let backupEnabled      = false;
let backupDismissed    = false;
let warnCancelCallback = null;

/* ── utils ── */
function genId()        { return nextId++; }
function stripExt(n)    { return n.replace(/\.(pdf|jpg|jpeg|png|webp)$/i, ''); }
function escHtml(s)     { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function totalWsBytes() { return workspace.reduce((a,f)=>a+f.size,0); }
function getFileById(id){ return workspace.find(f=>f.id===id); }

function formatBytes(b) {
  if(b<1024)    return b+' B';
  if(b<1048576) return (b/1024).toFixed(1)+' KB';
  return (b/1048576).toFixed(2)+' MB';
}

function readFileAsBytes(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=e=>res(new Uint8Array(e.target.result));
    r.onerror=rej;
    r.readAsArrayBuffer(file);
  });
}

function downloadBlob(bytes,filename){
  const blob=new Blob([bytes],{type:'application/pdf'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function downloadText(text,filename){
  const blob=new Blob([text],{type:'text/plain'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function downloadDataURL(dataURL,filename){
  const a=document.createElement('a');
  a.href=dataURL; a.download=filename; a.click();
}

function buildOutputName(f){
  if(f._renamedTo) return f._renamedTo;
  const base=f.baseName||stripExt(f.name);
  const ops=f.operations||[];
  if(f.isOriginal&&ops.length===0) return base+'_copy.pdf';
  return base+(ops.length?'_'+ops.join('_'):'')+'.pdf';
}

function addResult(bytes,parentId,opSuffix){
  const parent=getFileById(parentId);
  const base=parent?parent.baseName:'output';
  const ops=[...(parent?parent.operations:[]),opSuffix];
  const name=base+'_'+ops.join('_')+'.pdf';
  const id=genId();
  const f={id,name,baseName:base,size:bytes.length,bytes,
    isOriginal:false,parentId,operations:ops,_renamedTo:null,type:'pdf'};
  workspace.push(f);
  renderAllWorkspaces();
  updateMemBars();
  if(backupEnabled) saveBackup();
  return f;
}

/* ── file loading ── */
function triggerLoad(){
  document.getElementById('main-file-input').click();
}

function handleFileInputChange(inp){
  Array.from(inp.files).forEach(f=>loadFile(f));
  inp.value='';
}

async function loadFile(file){
  const isPDF=file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf');
  const isImg=/image\/(jpeg|png|webp)/.test(file.type);
  if(!isPDF&&!isImg){toast('Unsupported file type: '+file.name,'err');return;}
  if(file.size>MAX_FILE_BYTES){
    showWarn('File Too Large',
      `<strong>${escHtml(file.name)}</strong> is ${formatBytes(file.size)} — over the 100 MB v1 limit.<br><br>This limit prevents crashes and will increase after stability testing.`,
      'OK');
    return;
  }
  if(file.size>WARN_FILE_BYTES){
    showWarn('Large File Warning',
      `<strong>${escHtml(file.name)}</strong> is ${formatBytes(file.size)}. May be slow on some devices. Proceed?`,
      'Load Anyway',()=>doLoadFile(file));
    return;
  }
  const tot=totalWsBytes();
  if(tot+file.size>MAX_WS_BYTES){toast('Workspace full (300 MB). Download and remove files first.','warn',7000);return;}
  if(tot+file.size>WARN_WS_BYTES) toast('Workspace getting large. Download your work soon.','warn',5000);
  await doLoadFile(file);
}

async function doLoadFile(file){
  setStatus('Loading '+file.name+'…','busy');
  try{
    const bytes=await readFileAsBytes(file);
    const isPDF=file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf');
    const id=genId();
    const f={id,name:file.name,baseName:stripExt(file.name),size:bytes.length,bytes,
      isOriginal:true,parentId:null,operations:[],_renamedTo:null,type:isPDF?'pdf':'image'};
    workspace.push(f);
    selectedId=f.id;
    renderAllWorkspaces();
    updateMemBars();
    if(typeof updateFileStrips==='function') updateFileStrips();
    setStatus('Loaded: '+file.name,'ok');
    toast(`Loaded <strong>${escHtml(file.name)}</strong> (${formatBytes(bytes.length)}). Original untouched in workspace.`,'ok');
    if(!backupEnabled&&!backupDismissed&&!localStorage.getItem('pdfx_backup_dismissed'))
      document.getElementById('backup-banner')?.classList.remove('hidden');
    if(backupEnabled) saveBackup();
  }catch(err){
    toast('Failed to load '+file.name+': '+err.message,'err',8000);
    setStatus('Load failed','err');
  }
}

/* ── workspace rendering ── */
function renderAllWorkspaces(){
  renderWsInto('desk-ws-scroll','desk-ws-empty','desk-clear-btn');
  renderWsInto('mob-ws-scroll','mob-ws-empty','mob-clear-btn');
  renderLsCards();
  renderIconStrips();
}

function renderWsInto(scrollId,emptyId,clearId){
  const scroll=document.getElementById(scrollId);
  const empty=document.getElementById(emptyId);
  const clearBtn=document.getElementById(clearId);
  if(!scroll) return;
  scroll.querySelectorAll('.file-card').forEach(c=>c.remove());
  const has=workspace.length>0;
  if(empty)    empty.style.display=has?'none':'';
  if(clearBtn) clearBtn.classList.toggle('hidden',!has);
  workspace.forEach(f=>{
    const card=buildFileCard(f);
    empty&&empty.parentNode===scroll?scroll.insertBefore(card,empty):scroll.appendChild(card);
  });
}

function buildFileCard(f){
  const card=document.createElement('div');
  card.className='file-card'+(f.id===selectedId?' selected':'')+(f.id===viewingId?' viewing':'');
  card.id='fc-'+f.id;
  const icon=f.type==='image'?'🖼️':'📄';
  const origBadge=f.isOriginal
    ?'<span class="badge badge-original">ORIGINAL</span>'
    :'<span class="badge badge-derived">DERIVED</span>';
  const opBadge=f.operations.length
    ?`<span class="badge badge-op">${escHtml(f.operations.slice(-2).join('→'))}</span>`:'';
  const parentLine=f.parentId
    ?`<div class="fc-parent">from: ${escHtml(getFileById(f.parentId)?.name||'?')}</div>`:'';
  card.innerHTML=`
    <div class="fc-top">
      <div class="fc-icon">${icon}</div>
      <div class="fc-info">
        <div class="fc-name" id="fcname-${f.id}" ondblclick="startRename(${f.id})" title="${escHtml(f.name)}">${escHtml(f.name)}</div>
        <div class="fc-meta">${formatBytes(f.size)} · ${f.type.toUpperCase()}</div>
      </div>
    </div>
    ${parentLine}
    <div class="fc-badges">${origBadge}${opBadge}<span class="badge badge-size">${formatBytes(f.size)}</span></div>
    <div class="fc-actions">
      <button class="fc-btn view"   onclick="viewFile(${f.id})">👁 View</button>
      <button class="fc-btn"        onclick="selectAndGoTools(${f.id})">🔧 Tools</button>
      <button class="fc-btn"        onclick="startRename(${f.id})">✏ Rename</button>
      <button class="fc-btn delete" onclick="removeFile(${f.id})">✕ Remove</button>
    </div>`;
  return card;
}

function renderLsCards(){
  const c=document.getElementById('ls-ws-cards');
  if(!c) return;
  c.innerHTML='';
  workspace.forEach(f=>c.appendChild(buildFileCard(f)));
}

function renderIconStrips(){
  ['desk-icon-strip','ls-icon-strip'].forEach(id=>{
    const strip=document.getElementById(id);
    if(!strip) return;
    strip.innerHTML='';
    workspace.forEach(f=>{
      const item=document.createElement('div');
      item.className='ws-icon-item'+(f.id===selectedId?' selected':'')+(f.id===viewingId?' viewing':'');
      item.title=f.name;
      item.textContent=f.type==='image'?'🖼️':'📄';
      item.onclick=()=>{selectedId=f.id;if(typeof updateFileStrips==='function')updateFileStrips();renderAllWorkspaces();};
      strip.appendChild(item);
    });
  });
}

function selectAndGoTools(id){
  selectedId=id;
  if(typeof updateFileStrips==='function') updateFileStrips();
  renderAllWorkspaces();
  if(typeof switchTab==='function') switchTab('tools');
}

function viewFile(id){
  viewingId=id; selectedId=id;
  if(typeof updateFileStrips==='function') updateFileStrips();
  renderAllWorkspaces(); renderIconStrips();
  if(typeof switchTab==='function') switchTab('view');
  if(typeof loadViewer==='function') loadViewer(id);
}

function removeFile(id){
  workspace=workspace.filter(f=>f.id!==id);
  if(selectedId===id) selectedId=workspace.length?workspace[workspace.length-1].id:null;
  if(viewingId===id)  viewingId=null;
  renderAllWorkspaces(); updateMemBars();
  if(typeof updateFileStrips==='function') updateFileStrips();
  if(backupEnabled) saveBackup();
}

function startRename(id){
  const f=getFileById(id); if(!f) return;
  document.querySelectorAll(`#fcname-${id}`).forEach(nameEl=>{
    const inp=document.createElement('input');
    inp.className='fc-name-input'; inp.value=f.name;
    inp.onclick=e=>e.stopPropagation();
    inp.onblur=()=>finishRename(id,inp.value);
    inp.onkeydown=e=>{if(e.key==='Enter')inp.blur();if(e.key==='Escape'){inp.value=f.name;inp.blur();}};
    nameEl.replaceWith(inp);
    setTimeout(()=>{inp.focus();inp.select();},30);
  });
}

function finishRename(id,value){
  const f=getFileById(id); if(!f) return;
  value=value.trim();
  if(value&&value!==f.name){
    f.name=value; f._renamedTo=value.endsWith('.pdf')?value:value+'.pdf';
    toast('Renamed to '+f._renamedTo,'ok');
    if(backupEnabled) saveBackup();
  }
  renderAllWorkspaces();
}

function clearWorkspace(){
  showWarn('Clear Workspace',
    'Remove all files? <strong>Download anything you need first.</strong>',
    'Clear Everything',()=>{
      workspace=[]; selectedId=null; viewingId=null;
      renderAllWorkspaces(); updateMemBars();
      if(typeof updateFileStrips==='function') updateFileStrips();
      if(backupEnabled) saveBackup();
      toast('Workspace cleared.','info');
    });
}

/* ── memory bars ── */
function updateMemBars(){
  const total=totalWsBytes();
  const pct=Math.min(100,total/MAX_WS_BYTES*100);
  const color=pct>=90?'var(--danger)':pct>=65?'var(--warn)':pct>=40?'var(--acc2)':'var(--acc3)';
  ['desk-mem-bar','mob-mem-bar'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){el.style.width=pct+'%';el.style.background=color;}
  });
  ['desk-mem-label','mob-mem-label'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.textContent=formatBytes(total);
  });
}

/* ── download modal ── */
let dlSelectedIds=new Set();

function openDownloadModal(){
  dlSelectedIds.clear();
  renderDlList();
  openModal('download-modal');
}

function renderDlList(){
  const list=document.getElementById('dl-list');
  const countEl=document.getElementById('dl-count');
  const goBtn=document.getElementById('dl-go-btn');
  if(!list) return;
  list.innerHTML='';
  if(!workspace.length){
    list.innerHTML='<div style="font-family:\'DM Mono\',monospace;font-size:11px;color:var(--t3);padding:16px;text-align:center">No files in workspace</div>';
    if(goBtn) goBtn.disabled=true;
    return;
  }
  workspace.forEach(f=>{
    const outName=buildOutputName(f);
    const item=document.createElement('div');
    item.className='dl-item'+(dlSelectedIds.has(f.id)?' selected':'');
    item.innerHTML=`
      <input type="checkbox" id="dlck-${f.id}" ${dlSelectedIds.has(f.id)?'checked':''}
             onchange="dlToggle(${f.id},this.checked)">
      <div class="dl-item-info">
        <div class="dl-item-name">${escHtml(outName)}</div>
        <div class="dl-item-meta">${formatBytes(f.size)} · ${f.isOriginal?'ORIGINAL':'DERIVED'}</div>
      </div>`;
    item.onclick=e=>{
      if(!e.target.matches('input')){
        const cb=document.getElementById('dlck-'+f.id);
        if(cb){cb.checked=!cb.checked;dlToggle(f.id,cb.checked);}
      }
    };
    list.appendChild(item);
  });
  updateDlCount();
}

function dlToggle(id,checked){
  if(checked) dlSelectedIds.add(id); else dlSelectedIds.delete(id);
  const item=document.querySelector(`#dlck-${id}`)?.closest('.dl-item');
  if(item) item.classList.toggle('selected',checked);
  updateDlCount();
}

function updateDlCount(){
  const el=document.getElementById('dl-count');
  const btn=document.getElementById('dl-go-btn');
  if(el) el.textContent=dlSelectedIds.size+' selected';
  if(btn) btn.disabled=dlSelectedIds.size===0;
}

function dlSelectAll(){
  workspace.forEach(f=>dlSelectedIds.add(f.id));
  renderDlList();
}

async function downloadSelected(){
  if(!dlSelectedIds.size) return;
  let n=0;
  for(const id of dlSelectedIds){
    const f=getFileById(id); if(!f) continue;
    await new Promise(r=>setTimeout(r,80));
    downloadBlob(f.bytes,buildOutputName(f)); n++;
  }
  toast(`Downloaded ${n} file(s)`,'ok');
  closeModal('download-modal');
}

async function downloadAll(){
  if(!workspace.length){toast('No files to download','warn');return;}
  for(const f of workspace){await new Promise(r=>setTimeout(r,80));downloadBlob(f.bytes,buildOutputName(f));}
  toast(`Downloaded ${workspace.length} file(s)`,'ok');
  closeModal('download-modal');
}

async function downloadOutputsOnly(){
  const derived=workspace.filter(f=>!f.isOriginal);
  if(!derived.length){toast('No output files yet','warn');return;}
  for(const f of derived){await new Promise(r=>setTimeout(r,80));downloadBlob(f.bytes,buildOutputName(f));}
  toast(`Downloaded ${derived.length} output file(s)`,'ok');
  closeModal('download-modal');
}

/* ── backup ── */
function enableBackup(){
  backupEnabled=true;
  const btn=document.getElementById('backup-btn');
  if(btn) btn.style.color='var(--acc3)';
  document.getElementById('backup-banner')?.classList.add('hidden');
  toast('Browser backup enabled. Download files to keep them permanently.','info',5000);
  saveBackup(); closeModal('backup-modal');
}

function disableBackup(){
  backupEnabled=false;
  const btn=document.getElementById('backup-btn');
  if(btn) btn.style.color='var(--t3)';
  toast('Browser backup disabled.','info');
  closeModal('backup-modal');
}

function dismissBackup(){
  backupDismissed=true;
  localStorage.setItem('pdfx_backup_dismissed','1');
  document.getElementById('backup-banner')?.classList.add('hidden');
  closeModal('backup-modal');
}

function showBackupStatus(){
  const bodyEl=document.getElementById('backup-modal-body');
  const footEl=document.getElementById('backup-modal-footer');
  if(!bodyEl||!footEl) return;
  const statusLine=backupEnabled
    ?'<strong style="color:var(--acc3)">✓ Browser backup is enabled.</strong>'
    :'<span style="color:var(--t3)">Browser backup is off.</span>';
  bodyEl.innerHTML=`<div class="about-text">${statusLine}<br><br>
    Saves workspace to browser IndexedDB. Survives tab closes and restarts.<br><br>
    <strong>Can be lost:</strong> clear browser data · private/incognito mode · switching browsers · browser clears storage under pressure.<br><br>
    Files in storage are <strong>not encrypted by this app</strong>. Safety net only — download to keep files permanently.</div>`;
  footEl.innerHTML=backupEnabled
    ?`<button class="btn btn-secondary" onclick="disableBackup()">Disable</button>
      <button class="btn btn-secondary" onclick="closeModal('backup-modal')">Close</button>`
    :`<button class="btn btn-primary" onclick="enableBackup()">Enable Backup</button>
      <button class="btn btn-secondary" onclick="closeModal('backup-modal')">Close</button>`;
  openModal('backup-modal');
}

function openDB(){
  return new Promise((res,rej)=>{
    const req=indexedDB.open('pdfx_v1',1);
    req.onupgradeneeded=e=>e.target.result.createObjectStore('workspace',{keyPath:'id'});
    req.onsuccess=e=>res(e.target.result);
    req.onerror=e=>rej(e);
  });
}

async function saveBackup(){
  if(!backupEnabled) return;
  try{
    const db=await openDB();
    const tx=db.transaction('workspace','readwrite');
    const store=tx.objectStore('workspace');
    await new Promise((res,rej)=>{const r=store.clear();r.onsuccess=res;r.onerror=rej;});
    for(const f of workspace){
      await new Promise((res,rej)=>{
        const r=store.put({id:f.id,name:f.name,baseName:f.baseName,size:f.size,bytes:f.bytes,
          isOriginal:f.isOriginal,parentId:f.parentId,operations:f.operations,_renamedTo:f._renamedTo,type:f.type});
        r.onsuccess=res; r.onerror=rej;
      });
    }
    setStatus('Workspace backed up to browser','ok');
  }catch(err){console.warn('Backup failed:',err);}
}

/* ── drop zone helper ── */
function setupDropZone(zoneId,inputId,onFiles){
  const zone=document.getElementById(zoneId);
  const input=document.getElementById(inputId);
  if(!zone||!input) return;
  zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag');});
  zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));
  zone.addEventListener('drop',e=>{
    e.preventDefault(); zone.classList.remove('drag');
    const files=Array.from(e.dataTransfer.files)
      .filter(f=>f.type==='application/pdf'||/image\/(jpeg|png|webp)/.test(f.type));
    if(files.length) onFiles(files);
  });
  input.onchange=()=>{if(input.files.length)onFiles(Array.from(input.files));input.value='';};
}

function fileSourceHTML(wsFile,dzId,inpId,accept='.pdf'){
  if(wsFile) return `
    <div class="loaded-file">
      <div style="font-size:18px">${wsFile.type==='image'?'🖼️':'📄'}</div>
      <div><div class="loaded-file-name">${escHtml(wsFile.name)}</div>
      <div class="loaded-file-meta">${formatBytes(wsFile.size)}</div></div>
    </div>`;
  return `
    <div class="drop-zone" id="${dzId}" onclick="document.getElementById('${inpId}').click()">
      <input type="file" id="${inpId}" accept="${accept}">
      <div class="dz-icon">📂</div>
      <div class="dz-text">Tap to select a PDF</div>
      <div class="dz-sub">Nothing leaves your device</div>
    </div>`;
}
