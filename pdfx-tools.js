/* ════════════════════════════════════════════════════════
   pdfx-tools.js  —  All 18 tools
   ════════════════════════════════════════════════════════ */

/* ── tool grid → active tool ── */
function openTool(id,icon,name){
  const inner=document.getElementById('tools-inner');
  if(!inner) return;
  inner.innerHTML='';
  const wrap=document.createElement('div');
  wrap.className='active-tool-wrap';
  wrap.innerHTML=`
    <div class="tool-back-bar">
      <button class="back-btn" onclick="restoreToolGrid()">&#x25C0; Tools</button>
      <div class="tool-back-title">${icon} ${name}</div>
    </div>
    <div class="tool-content" id="tool-content"></div>`;
  inner.appendChild(wrap);
  const content=document.getElementById('tool-content');
  const renders={
    merge:()=>renderMerge(content),
    split:()=>renderSplit(content),
    reorder:()=>renderReorder(content),
    rotate:()=>renderRotate(content),
    pages:()=>renderPages(content),
    compress:()=>renderCompress(content),
    watermark:()=>renderWatermark(content),
    headerfooter:()=>renderHeaderFooter(content),
    pagenums:()=>renderPageNums(content),
    grayscale:()=>renderGrayscale(content),
    img2pdf:()=>renderImg2Pdf(content),
    extracttext:()=>renderExtractText(content),
    pdf2img:()=>renderPdf2Img(content),
    redact:()=>renderRedact(content),
    protect:()=>renderProtect(content),
    unlock:()=>renderUnlock(content),
  };
  if(renders[id]) renders[id]();
}

function restoreToolGrid(){
  const inner=document.getElementById('tools-inner');
  if(!inner) return;
  inner.innerHTML='';
  const scroll=document.createElement('div');
  scroll.className='tool-grid-scroll';
  scroll.id='tool-grid-scroll';
  inner.appendChild(scroll);
  if(typeof buildToolGrid==='function') buildToolGrid();
}

/* ══ MERGE ══ */
let mergeQ=[];
function renderMerge(c){
  mergeQ=[];
  c.innerHTML=`
    <div class="tp-notice">&#x2713; Creates a new merged file. All sources stay untouched in workspace.</div>
    <div class="drop-zone" id="mg-dz"><input type="file" id="mg-inp" accept=".pdf" multiple>
      <div class="dz-icon">&#x1F4C2;</div><div class="dz-text">Add PDFs to merge</div>
      <div class="dz-sub">Or pick from workspace below</div></div>
    <div id="mg-ws-btns" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px"></div>
    <div id="mg-q"></div>
    <div class="btn-row">
      <button class="btn btn-primary" id="mg-go" onclick="doMerge()" disabled>&#x1F517; Merge &#x2192; Workspace</button>
      <button class="btn btn-secondary" onclick="mergeQ=[];renderMQ()">Clear</button>
    </div>`;
  setupDropZone('mg-dz','mg-inp',async files=>{
    for(const f of files){const b=await readFileAsBytes(f);mergeQ.push({name:f.name,bytes:b,wsId:null});}
    renderMQ();
  });
  const wb=document.getElementById('mg-ws-btns');
  workspace.filter(f=>f.type==='pdf').forEach(f=>{
    const btn=document.createElement('button');
    btn.className='fc-btn'; btn.textContent='+ '+f.name.slice(0,20)+(f.name.length>20?'…':'');
    btn.onclick=()=>{mergeQ.push({name:f.name,bytes:f.bytes,wsId:f.id});renderMQ();};
    wb.appendChild(btn);
  });
}
function renderMQ(){
  const list=document.getElementById('mg-q'); const btn=document.getElementById('mg-go');
  if(!list) return; list.innerHTML='';
  mergeQ.forEach((f,i)=>{
    const item=document.createElement('div'); item.className='fli';
    item.innerHTML=`<div class="fli-icon">&#x1F4C4;</div>
      <div class="fli-inf"><div class="fli-nm">${escHtml(f.name)}</div><div class="fli-mt">${formatBytes(f.bytes.length)}</div></div>
      <div class="fli-btns">${i>0?`<button class="icon-btn" onclick="mqMv(${i},-1)">&#x2191;</button>`:''}
      <button class="icon-btn danger" onclick="mergeQ.splice(${i},1);renderMQ()">&#x2715;</button></div>`;
    list.appendChild(item);
  });
  if(btn) btn.disabled=mergeQ.length<2;
}
function mqMv(i,d){const n=i+d;if(n<0||n>=mergeQ.length)return;[mergeQ[i],mergeQ[n]]=[mergeQ[n],mergeQ[i]];renderMQ();}
async function doMerge(){
  if(mergeQ.length<2) return;
  setStatus('Merging…','busy');
  try{
    const doc=await PDFLib.PDFDocument.create();
    for(const f of mergeQ){const d=await PDFLib.PDFDocument.load(f.bytes,{ignoreEncryption:true});const pgs=await doc.copyPages(d,d.getPageIndices());pgs.forEach(p=>doc.addPage(p));}
    const out=await doc.save();
    const base=stripExt(mergeQ[0].name);
    const parentId=mergeQ.find(f=>f.wsId)?.wsId||null;
    const id=genId(); const name=base+'_merged.pdf';
    workspace.push({id,name,baseName:base,size:out.length,bytes:out,isOriginal:false,parentId,operations:['merged'],_renamedTo:null,type:'pdf'});
    renderAllWorkspaces(); updateMemBars();
    toast(`Merged ${mergeQ.length} files &#x2192; <strong>${name}</strong>`,'ok');
    setStatus('Done','ok'); mergeQ=[]; renderMQ();
  }catch(err){toast('Merge failed: '+err.message,'err',8000);setStatus('Failed','err');}
}

/* ══ SPLIT ══ */
let splitSrc=null;
function renderSplit(c){
  splitSrc=selectedId?getFileById(selectedId):null;
  c.innerHTML=`
    <div class="tp-notice">&#x2713; Each output is a new workspace file. Original untouched.</div>
    ${fileSourceHTML(splitSrc,'sp-dz','sp-inp')}
    <div id="sp-opts" style="${splitSrc?'':'display:none'}">
      <div class="opt-grid">
        <div class="opt-card"><div class="opt-label">Mode</div>
          <select class="opt-input" id="sp-mode" onchange="spModeChange()">
            <option value="range">By page range</option>
            <option value="every">Every N pages</option>
            <option value="each">Each page separately</option>
          </select></div>
        <div class="opt-card" id="sp-range-card"><div class="opt-label">Range (e.g. 1-3, 5, 7-9)</div>
          <input class="opt-input" type="text" id="sp-range" placeholder="1-3, 5, 7-9"></div>
        <div class="opt-card hidden" id="sp-every-card"><div class="opt-label">Every N pages</div>
          <input class="opt-input" type="number" id="sp-n" value="1" min="1"></div>
      </div>
      <div class="btn-row"><button class="btn btn-primary" onclick="doSplit()">&#x2702;&#xFE0F; Split &#x2192; Workspace</button></div>
    </div>`;
  if(!splitSrc) setupDropZone('sp-dz','sp-inp',async files=>{
    await doLoadFile(files[0]);splitSrc=workspace[workspace.length-1];
    document.getElementById('sp-opts').style.display='';
  });
}
function spModeChange(){
  const m=document.getElementById('sp-mode')?.value;
  document.getElementById('sp-range-card')?.classList.toggle('hidden',m!=='range');
  document.getElementById('sp-every-card')?.classList.toggle('hidden',m!=='every');
}
function parseRange(s,max){
  const set=new Set();
  s.split(',').forEach(p=>{
    p=p.trim();
    if(p.includes('-')){const[a,b]=p.split('-').map(Number);for(let i=a;i<=b&&i<=max;i++)set.add(i-1);}
    else{const n=parseInt(p);if(n>=1&&n<=max)set.add(n-1);}
  });
  return Array.from(set).sort((a,b)=>a-b);
}
async function doSplit(){
  if(!splitSrc){toast('No file selected','warn');return;}
  setStatus('Splitting…','busy');
  try{
    const doc=await PDFLib.PDFDocument.load(splitSrc.bytes,{ignoreEncryption:true});
    const total=doc.getPageCount();
    const mode=document.getElementById('sp-mode').value;
    let parts=[];
    if(mode==='each'){for(let i=0;i<total;i++)parts.push({indices:[i],sfx:`split-p${i+1}`});}
    else if(mode==='every'){
      const n=parseInt(document.getElementById('sp-n').value)||1;
      for(let i=0;i<total;i+=n){
        const end=Math.min(i+n-1,total-1);
        const idx=[]; for(let j=i;j<=end;j++)idx.push(j);
        parts.push({indices:idx,sfx:`split-p${i+1}${end>i?'-'+(end+1):''}`});
      }
    }else{
      const idx=parseRange(document.getElementById('sp-range').value,total);
      if(!idx.length){toast('Invalid page range','err');return;}
      parts.push({indices:idx,sfx:'split-p'+document.getElementById('sp-range').value.replace(/\s/g,'')});
    }
    for(const p of parts){
      const nd=await PDFLib.PDFDocument.create();
      const pgs=await nd.copyPages(doc,p.indices); pgs.forEach(pg=>nd.addPage(pg));
      const out=await nd.save(); addResult(out,splitSrc.id,p.sfx);
      await new Promise(r=>setTimeout(r,40));
    }
    toast(`Split into ${parts.length} file(s) &#x2192; workspace`,'ok');
    setStatus('Done','ok');
  }catch(err){toast('Split failed: '+err.message,'err',8000);setStatus('Failed','err');}
}

/* ══ REORDER ══ */
let roSrc=null,roOrder=[];
function renderReorder(c){
  roSrc=selectedId?getFileById(selectedId):null;
  c.innerHTML=`
    <div class="tp-notice">&#x2713; Creates a new reordered file. Original untouched.</div>
    ${fileSourceHTML(roSrc,'ro-dz','ro-inp')}
    <div id="ro-list"></div>
    <div class="btn-row" id="ro-btns" style="${roSrc?'':'display:none'}">
      <button class="btn btn-primary" onclick="doReorder()">&#x1F4BE; Save &#x2192; Workspace</button></div>`;
  if(!roSrc) setupDropZone('ro-dz','ro-inp',async files=>{await doLoadFile(files[0]);roSrc=workspace[workspace.length-1];initRO();document.getElementById('ro-btns').style.display='';});
  else initRO();
}
async function initRO(){
  if(!roSrc) return;
  const doc=await PDFLib.PDFDocument.load(roSrc.bytes,{ignoreEncryption:true});
  roOrder=Array.from({length:doc.getPageCount()},(_,i)=>i);
  renderROList();
}
function renderROList(){
  const list=document.getElementById('ro-list'); if(!list) return; list.innerHTML='';
  roOrder.forEach((orig,pos)=>{
    const item=document.createElement('div'); item.className='fli';
    item.innerHTML=`<div class="fli-icon" style="cursor:grab">&#x28BF;</div>
      <div class="fli-inf"><div class="fli-nm" style="font-family:'DM Mono',monospace">Page ${orig+1} <span style="color:var(--t3);font-size:9px">(original)</span></div>
      <div class="fli-mt">Position ${pos+1}</div></div>
      <div class="fli-btns">
        ${pos>0?`<button class="icon-btn" onclick="roMv(${pos},-1)">&#x2191;</button>`:''}
        ${pos<roOrder.length-1?`<button class="icon-btn" onclick="roMv(${pos},1)">&#x2193;</button>`:''}
      </div>`;
    list.appendChild(item);
  });
}
function roMv(p,d){const n=p+d;if(n<0||n>=roOrder.length)return;[roOrder[p],roOrder[n]]=[roOrder[n],roOrder[p]];renderROList();}
async function doReorder(){
  if(!roSrc) return; setStatus('Reordering…','busy');
  try{
    const doc=await PDFLib.PDFDocument.load(roSrc.bytes,{ignoreEncryption:true});
    const nd=await PDFLib.PDFDocument.create();
    const pgs=await nd.copyPages(doc,roOrder); pgs.forEach(p=>nd.addPage(p));
    const out=await nd.save(); const r=addResult(out,roSrc.id,'reordered');
    toast('Reordered &#x2192; <strong>'+r.name+'</strong>','ok'); setStatus('Done','ok');
  }catch(err){toast('Failed: '+err.message,'err',8000); setStatus('Failed','err');}
}

/* ══ ROTATE ══ */
let rtSrc=null,rtAngles=[];
function renderRotate(c){
  rtSrc=selectedId?getFileById(selectedId):null;
  c.innerHTML=`
    <div class="tp-notice">&#x2713; Creates a new rotated file. Original untouched.</div>
    ${fileSourceHTML(rtSrc,'rt-dz','rt-inp')}
    <div id="rt-body" style="${rtSrc?'':'display:none'}">
      <div class="btn-row">
        <button class="btn btn-secondary" onclick="rtAll(90)">&#x21BB; All 90&#xB0;</button>
        <button class="btn btn-secondary" onclick="rtAll(180)">&#x2195; All 180&#xB0;</button>
        <button class="btn btn-secondary" onclick="rtAll(270)">&#x21BA; All 270&#xB0;</button>
        <button class="btn btn-secondary" onclick="rtAll(0)">Reset All</button>
      </div>
      <div id="rt-list"></div>
      <div class="btn-row"><button class="btn btn-primary" onclick="doRotate()">&#x1F4BE; Save &#x2192; Workspace</button></div>
    </div>`;
  if(!rtSrc) setupDropZone('rt-dz','rt-inp',async files=>{await doLoadFile(files[0]);rtSrc=workspace[workspace.length-1];initRT();document.getElementById('rt-body').style.display='';});
  else initRT();
}
async function initRT(){
  const doc=await PDFLib.PDFDocument.load(rtSrc.bytes,{ignoreEncryption:true});
  rtAngles=new Array(doc.getPageCount()).fill(0); renderRTList();
}
function renderRTList(){
  const list=document.getElementById('rt-list'); if(!list) return; list.innerHTML='';
  rtAngles.forEach((a,i)=>{
    const item=document.createElement('div'); item.className='fli';
    item.innerHTML=`<div class="fli-icon" style="transform:rotate(${a}deg);transition:.3s">&#x1F4C4;</div>
      <div class="fli-inf"><div class="fli-nm" style="font-family:'DM Mono',monospace">Page ${i+1}</div><div class="fli-mt">${a}&#xB0;</div></div>
      <div class="fli-btns">
        <button class="icon-btn" onclick="rtPg(${i},90)" title="90&#xB0; CW">&#x21BB;</button>
        <button class="icon-btn" onclick="rtPg(${i},180)" title="180&#xB0;">&#x2195;</button>
        <button class="icon-btn" onclick="rtPg(${i},270)" title="90&#xB0; CCW">&#x21BA;</button>
        <button class="icon-btn" onclick="rtPg(${i},0)" title="Reset">&#x25CB;</button>
      </div>`;
    list.appendChild(item);
  });
}
function rtPg(i,d){rtAngles[i]=d;renderRTList();}
function rtAll(d){rtAngles=rtAngles.map(()=>d);renderRTList();}
async function doRotate(){
  if(!rtSrc) return; setStatus('Rotating…','busy');
  try{
    const doc=await PDFLib.PDFDocument.load(rtSrc.bytes,{ignoreEncryption:true});
    doc.getPages().forEach((p,i)=>{if(rtAngles[i])p.setRotation(PDFLib.degrees(rtAngles[i]));});
    const out=await doc.save(); const r=addResult(out,rtSrc.id,'rotated');
    toast('Rotated &#x2192; <strong>'+r.name+'</strong>','ok'); setStatus('Done','ok');
  }catch(err){toast('Failed: '+err.message,'err',8000); setStatus('Failed','err');}
}

/* ══ PAGES ══ */
let pgSrc=null,pgSel=new Set(),pgCount=0;
function renderPages(c){
  pgSrc=selectedId?getFileById(selectedId):null;
  c.innerHTML=`
    <div class="tp-notice">&#x2713; Creates a new file. Original untouched.</div>
    ${fileSourceHTML(pgSrc,'pg-dz','pg-inp')}
    <div id="pg-body" style="${pgSrc?'':'display:none'}">
      <div class="opt-grid"><div class="opt-card"><div class="opt-label">Action</div>
        <select class="opt-input" id="pg-action">
          <option value="delete">Delete selected pages</option>
          <option value="blank">Insert blank after selected</option>
          <option value="dup">Duplicate selected pages</option>
        </select></div></div>
      <div class="btn-row">
        <button class="btn btn-secondary" onclick="pgSelAll()">All</button>
        <button class="btn btn-secondary" onclick="pgSel.clear();renderPGList()">None</button>
      </div>
      <div class="page-select-box" id="pg-list"></div>
      <div class="btn-row"><button class="btn btn-primary" onclick="doPages()" id="pg-go" disabled>Apply &#x2192; Workspace</button></div>
    </div>`;
  if(!pgSrc) setupDropZone('pg-dz','pg-inp',async files=>{await doLoadFile(files[0]);pgSrc=workspace[workspace.length-1];initPG();document.getElementById('pg-body').style.display='';});
  else initPG();
}
async function initPG(){
  const doc=await PDFLib.PDFDocument.load(pgSrc.bytes,{ignoreEncryption:true});
  pgCount=doc.getPageCount(); pgSel.clear(); renderPGList();
}
function renderPGList(){
  const list=document.getElementById('pg-list'); const btn=document.getElementById('pg-go');
  if(!list) return; list.innerHTML='';
  for(let i=0;i<pgCount;i++){
    const lbl=document.createElement('label'); lbl.className='page-check';
    lbl.innerHTML=`<input type="checkbox" ${pgSel.has(i)?'checked':''} onchange="pgTog(${i},this.checked)"><label>Page ${i+1}</label>`;
    list.appendChild(lbl);
  }
  if(btn) btn.disabled=pgSel.size===0;
}
function pgTog(i,v){if(v)pgSel.add(i);else pgSel.delete(i);const btn=document.getElementById('pg-go');if(btn)btn.disabled=pgSel.size===0;}
function pgSelAll(){for(let i=0;i<pgCount;i++)pgSel.add(i);renderPGList();}
async function doPages(){
  if(!pgSrc||!pgSel.size) return;
  const action=document.getElementById('pg-action').value;
  setStatus('Processing…','busy');
  try{
    const src=await PDFLib.PDFDocument.load(pgSrc.bytes,{ignoreEncryption:true});
    const nd=await PDFLib.PDFDocument.create();
    if(action==='delete'){
      const keep=[]; for(let i=0;i<pgCount;i++) if(!pgSel.has(i)) keep.push(i);
      if(!keep.length){toast('Cannot delete all pages','err');return;}
      const pgs=await nd.copyPages(src,keep); pgs.forEach(p=>nd.addPage(p));
    }else if(action==='blank'){
      const all=await nd.copyPages(src,Array.from({length:pgCount},(_,i)=>i));
      for(let i=0;i<pgCount;i++){nd.addPage(all[i]);if(pgSel.has(i)){const{width,height}=all[i].getSize();nd.addPage([width,height]);}}
    }else{
      const all=await nd.copyPages(src,Array.from({length:pgCount},(_,i)=>i));
      for(let i=0;i<pgCount;i++){nd.addPage(all[i]);if(pgSel.has(i)){const dup=await nd.copyPages(src,[i]);nd.addPage(dup[0]);}}
    }
    const out=await nd.save(); const r=addResult(out,pgSrc.id,action);
    toast(`${action} applied &#x2192; <strong>${r.name}</strong>`,'ok'); setStatus('Done','ok');
  }catch(err){toast('Failed: '+err.message,'err',8000); setStatus('Failed','err');}
}

/* ══ COMPRESS ══ */
let cmpSrc=null;
function renderCompress(c){
  cmpSrc=selectedId?getFileById(selectedId):null;
  c.innerHTML=`
    <div class="tp-notice">&#x2713; Creates a new compressed file. Original untouched.</div>
    <div class="tp-warn">&#x26A0; Structural optimization only — image recompression requires server-side processing.</div>
    ${fileSourceHTML(cmpSrc,'cmp-dz','cmp-inp')}
    <div id="cmp-body" style="${cmpSrc?'':'display:none'}">
      <div class="opt-grid">
        <div class="opt-card"><div class="opt-label">Remove Metadata</div>
          <select class="opt-input" id="cmp-meta"><option value="yes">Yes (recommended)</option><option value="no">No</option></select></div>
        <div class="opt-card"><div class="opt-label">Remove Bookmarks</div>
          <select class="opt-input" id="cmp-bm"><option value="no">No</option><option value="yes">Yes</option></select></div>
      </div>
      <div class="btn-row"><button class="btn btn-primary" onclick="doCompress()">&#x1F4E6; Compress &#x2192; Workspace</button></div>
    </div>`;
  if(!cmpSrc) setupDropZone('cmp-dz','cmp-inp',async files=>{await doLoadFile(files[0]);cmpSrc=workspace[workspace.length-1];document.getElementById('cmp-body').style.display='';});
}
async function doCompress(){
  if(!cmpSrc) return; setStatus('Compressing…','busy');
  try{
    const doc=await PDFLib.PDFDocument.load(cmpSrc.bytes,{ignoreEncryption:true});
    if(document.getElementById('cmp-meta').value==='yes'){doc.setTitle('');doc.setAuthor('');doc.setSubject('');doc.setKeywords([]);doc.setCreator('');doc.setProducer('');}
    if(document.getElementById('cmp-bm').value==='yes'){try{doc.catalog.delete(PDFLib.PDFName.of('Outlines'));}catch(e){}}
    const out=await doc.save({useObjectStreams:true});
    const delta=cmpSrc.size-out.length; const pct=(delta/cmpSrc.size*100).toFixed(1);
    const r=addResult(out,cmpSrc.id,'compressed');
    toast(`${formatBytes(cmpSrc.size)} &#x2192; ${formatBytes(out.length)} (${delta>=0?'-':'+'}${Math.abs(pct)}%) &#x2192; <strong>${r.name}</strong>`,'ok',6000);
    setStatus('Done','ok');
  }catch(err){toast('Failed: '+err.message,'err',8000); setStatus('Failed','err');}
}

/* ══ WATERMARK ══ */
let wmSrc=null;
function renderWatermark(c){
  wmSrc=selectedId?getFileById(selectedId):null;
  c.innerHTML=`
    <div class="tp-notice">&#x2713; Creates a new watermarked file. Original untouched.</div>
    ${fileSourceHTML(wmSrc,'wm-dz','wm-inp')}
    <div id="wm-body" style="${wmSrc?'':'display:none'}">
      <div class="opt-grid">
        <div class="opt-card"><div class="opt-label">Text</div>
          <input class="opt-input" type="text" id="wm-txt" value="CONFIDENTIAL" oninput="wmPrev()"></div>
        <div class="opt-card"><div class="opt-label">Opacity</div>
          <input class="opt-input" type="range" id="wm-op" min="5" max="80" value="20" oninput="wmPrev()">
          <div class="opt-val" id="wm-opv">20%</div></div>
        <div class="opt-card"><div class="opt-label">Color</div>
          <select class="opt-input" id="wm-col">
            <option value="gray">Gray</option><option value="red">Red</option>
            <option value="blue">Blue</option><option value="black">Black</option>
          </select></div>
      </div>
      <div class="wm-preview"><div class="wm-preview-text" id="wm-prev-text">CONFIDENTIAL</div></div>
      <div class="btn-row"><button class="btn btn-primary" onclick="doWatermark()">&#x1F510; Apply &#x2192; Workspace</button></div>
    </div>`;
  if(!wmSrc) setupDropZone('wm-dz','wm-inp',async files=>{await doLoadFile(files[0]);wmSrc=workspace[workspace.length-1];document.getElementById('wm-body').style.display='';});
}
function wmPrev(){
  const t=document.getElementById('wm-txt')?.value||'';
  const op=document.getElementById('wm-op')?.value||20;
  const el=document.getElementById('wm-prev-text');
  if(el){el.textContent=t;el.style.opacity=op/100;}
  const v=document.getElementById('wm-opv'); if(v) v.textContent=op+'%';
}
async function doWatermark(){
  if(!wmSrc) return; setStatus('Watermarking…','busy');
  const text=document.getElementById('wm-txt').value||'WATERMARK';
  const opacity=parseInt(document.getElementById('wm-op').value)/100;
  const cmap={gray:[0.5,0.5,0.5],red:[0.75,0.1,0.1],blue:[0.1,0.1,0.75],black:[0,0,0]};
  const color=cmap[document.getElementById('wm-col').value];
  try{
    const doc=await PDFLib.PDFDocument.load(wmSrc.bytes,{ignoreEncryption:true});
    const font=await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    doc.getPages().forEach(p=>{
      const{width,height}=p.getSize(); const sz=Math.min(width,height)*.11;
      const tw=font.widthOfTextAtSize(text,sz);
      p.drawText(text,{x:(width-tw)/2,y:(height-sz)/2,size:sz,font,color:PDFLib.rgb(...color),opacity,rotate:PDFLib.degrees(-35)});
    });
    const out=await doc.save(); const r=addResult(out,wmSrc.id,'watermarked');
    toast('Watermarked &#x2192; <strong>'+r.name+'</strong>','ok'); setStatus('Done','ok');
  }catch(err){toast('Failed: '+err.message,'err',8000); setStatus('Failed','err');}
}

/* ══ HEADER/FOOTER ══ */
let hfSrc=null;
function renderHeaderFooter(c){
  hfSrc=selectedId?getFileById(selectedId):null;
  c.innerHTML=`
    <div class="tp-notice">&#x2713; Creates a new file. Tokens: {page} {total} {date} {filename}</div>
    ${fileSourceHTML(hfSrc,'hf-dz','hf-inp')}
    <div id="hf-body" style="${hfSrc?'':'display:none'}">
      <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--t3);margin-bottom:6px">HEADER</div>
      <div class="opt-grid">
        <div class="opt-card"><div class="opt-label">Left</div><input class="opt-input" type="text" id="hf-hl" placeholder="{filename}"></div>
        <div class="opt-card"><div class="opt-label">Center</div><input class="opt-input" type="text" id="hf-hc" placeholder="My Document"></div>
        <div class="opt-card"><div class="opt-label">Right</div><input class="opt-input" type="text" id="hf-hr" placeholder="{date}"></div>
      </div>
      <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--t3);margin:10px 0 6px">FOOTER</div>
      <div class="opt-grid">
        <div class="opt-card"><div class="opt-label">Left</div><input class="opt-input" type="text" id="hf-fl" placeholder="{filename}"></div>
        <div class="opt-card"><div class="opt-label">Center</div><input class="opt-input" type="text" id="hf-fc" placeholder="Page {page} of {total}"></div>
        <div class="opt-card"><div class="opt-label">Right</div><input class="opt-input" type="text" id="hf-fr" placeholder="{date}"></div>
      </div>
      <div class="opt-grid" style="margin-top:8px">
        <div class="opt-card"><div class="opt-label">Font Size</div><input class="opt-input" type="number" id="hf-sz" value="10" min="6" max="20"></div>
        <div class="opt-card"><div class="opt-label">Color</div>
          <select class="opt-input" id="hf-color"><option value="gray">Gray</option><option value="black">Black</option></select></div>
      </div>
      <div class="btn-row"><button class="btn btn-primary" onclick="doHeaderFooter()">&#x2795; Apply &#x2192; Workspace</button></div>
    </div>`;
  if(!hfSrc) setupDropZone('hf-dz','hf-inp',async files=>{await doLoadFile(files[0]);hfSrc=workspace[workspace.length-1];document.getElementById('hf-body').style.display='';});
}
async function doHeaderFooter(){
  if(!hfSrc) return; setStatus('Adding header/footer…','busy');
  const sz=parseInt(document.getElementById('hf-sz').value)||10;
  const rgb=document.getElementById('hf-color').value==='black'?[0,0,0]:[0.4,0.4,0.4];
  const today=new Date().toLocaleDateString(); const fname=hfSrc.baseName;
  const res=(tmpl,pg,tot)=>tmpl.replace('{page}',pg).replace('{total}',tot).replace('{date}',today).replace('{filename}',fname);
  try{
    const doc=await PDFLib.PDFDocument.load(hfSrc.bytes,{ignoreEncryption:true});
    const font=await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const pages=doc.getPages(); const tot=pages.length; const m=16;
    pages.forEach((page,i)=>{
      const{width,height}=page.getSize(); const pg=i+1;
      const zones=[
        {id:'hf-hl',x:m,y:height-m-sz,a:'l'},{id:'hf-hc',x:width/2,y:height-m-sz,a:'c'},{id:'hf-hr',x:width-m,y:height-m-sz,a:'r'},
        {id:'hf-fl',x:m,y:m,a:'l'},{id:'hf-fc',x:width/2,y:m,a:'c'},{id:'hf-fr',x:width-m,y:m,a:'r'},
      ];
      zones.forEach(z=>{
        const raw=document.getElementById(z.id)?.value||''; if(!raw) return;
        const text=res(raw,pg,tot); const tw=font.widthOfTextAtSize(text,sz);
        let x=z.x; if(z.a==='c')x-=tw/2; else if(z.a==='r')x-=tw;
        page.drawText(text,{x,y:z.y,size:sz,font,color:PDFLib.rgb(...rgb)});
      });
    });
    const out=await doc.save(); const r=addResult(out,hfSrc.id,'header-footer');
    toast('Header/footer added &#x2192; <strong>'+r.name+'</strong>','ok'); setStatus('Done','ok');
  }catch(err){toast('Failed: '+err.message,'err',8000); setStatus('Failed','err');}
}

/* ══ PAGE NUMBERS ══ */
let pnSrc=null;
function renderPageNums(c){
  pnSrc=selectedId?getFileById(selectedId):null;
  c.innerHTML=`
    <div class="tp-notice">&#x2713; Creates a new file. Original untouched.</div>
    ${fileSourceHTML(pnSrc,'pn-dz','pn-inp')}
    <div id="pn-body" style="${pnSrc?'':'display:none'}">
      <div class="opt-grid">
        <div class="opt-card"><div class="opt-label">Position</div>
          <select class="opt-input" id="pn-pos">
            <option value="bc">Bottom Center</option><option value="br">Bottom Right</option>
            <option value="bl">Bottom Left</option><option value="tc">Top Center</option>
            <option value="tr">Top Right</option></select></div>
        <div class="opt-card"><div class="opt-label">Format</div>
          <select class="opt-input" id="pn-fmt">
            <option value="n">1, 2, 3</option><option value="nof">1 of 10</option><option value="pn">Page 1</option></select></div>
        <div class="opt-card"><div class="opt-label">Start Number</div>
          <input class="opt-input" type="number" id="pn-start" value="1" min="1"></div>
        <div class="opt-card"><div class="opt-label">Font Size</div>
          <input class="opt-input" type="number" id="pn-sz" value="11" min="7" max="24"></div>
      </div>
      <div class="btn-row"><button class="btn btn-primary" onclick="doPageNums()">&#x2795; Add Numbers &#x2192; Workspace</button></div>
    </div>`;
  if(!pnSrc) setupDropZone('pn-dz','pn-inp',async files=>{await doLoadFile(files[0]);pnSrc=workspace[workspace.length-1];document.getElementById('pn-body').style.display='';});
}
async function doPageNums(){
  if(!pnSrc) return; setStatus('Adding page numbers…','busy');
  const pos=document.getElementById('pn-pos').value;
  const fmt=document.getElementById('pn-fmt').value;
  const start=parseInt(document.getElementById('pn-start').value)||1;
  const sz=parseInt(document.getElementById('pn-sz').value)||11;
  try{
    const doc=await PDFLib.PDFDocument.load(pnSrc.bytes,{ignoreEncryption:true});
    const font=await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const pages=doc.getPages(); const total=pages.length; const m=20;
    pages.forEach((page,i)=>{
      const n=i+start;
      let lbl; if(fmt==='n')lbl=String(n); else if(fmt==='nof')lbl=`${n} of ${total+start-1}`; else lbl=`Page ${n}`;
      const{width,height}=page.getSize(); const tw=font.widthOfTextAtSize(lbl,sz);
      let x=(width-tw)/2,y=m;
      if(pos==='br'){x=width-tw-m;} else if(pos==='bl'){x=m;}
      else if(pos==='tc'){y=height-m-sz;} else if(pos==='tr'){x=width-tw-m;y=height-m-sz;}
      page.drawText(lbl,{x,y,size:sz,font,color:PDFLib.rgb(0.3,0.3,0.3)});
    });
    const out=await doc.save(); const r=addResult(out,pnSrc.id,'page-nums');
    toast('Page numbers added &#x2192; <strong>'+r.name+'</strong>','ok'); setStatus('Done','ok');
  }catch(err){toast('Failed: '+err.message,'err',8000); setStatus('Failed','err');}
}

/* ══ GRAYSCALE ══ */
let gsSrc=null;
function renderGrayscale(c){
  gsSrc=selectedId?getFileById(selectedId):null;
  c.innerHTML=`
    <div class="tp-notice">&#x2713; Creates a new grayscale file. Original untouched.</div>
    <div class="tp-warn">&#x26A0; Rasterizes pages — may increase file size at higher DPI.</div>
    ${fileSourceHTML(gsSrc,'gs-dz','gs-inp')}
    <div id="gs-body" style="${gsSrc?'':'display:none'}">
      <div class="opt-grid"><div class="opt-card"><div class="opt-label">DPI</div>
        <select class="opt-input" id="gs-dpi">
          <option value="72">72 — Screen</option><option value="150" selected>150 — Standard</option><option value="300">300 — Print</option>
        </select></div></div>
      <div id="gs-prog" style="display:none" class="progress-wrap">
        <div class="progress-bar"><div class="progress-fill" id="gs-bar" style="width:0%"></div></div>
        <div class="progress-text" id="gs-pt">Processing…</div></div>
      <div class="btn-row"><button class="btn btn-primary" onclick="doGrayscale()">&#x1F5A4; Convert &#x2192; Workspace</button></div>
    </div>`;
  if(!gsSrc) setupDropZone('gs-dz','gs-inp',async files=>{await doLoadFile(files[0]);gsSrc=workspace[workspace.length-1];document.getElementById('gs-body').style.display='';});
}
async function doGrayscale(){
  if(!gsSrc) return; setStatus('Converting to grayscale…','busy');
  const scale=parseInt(document.getElementById('gs-dpi').value)/72;
  document.getElementById('gs-prog').style.display='flex';
  try{
    const pd=await pdfjsLib.getDocument({data:gsSrc.bytes}).promise;
    const nd=await PDFLib.PDFDocument.create();
    const cv=document.createElement('canvas'); const ctx=cv.getContext('2d');
    for(let i=1;i<=pd.numPages;i++){
      document.getElementById('gs-pt').textContent=`Page ${i} / ${pd.numPages}`;
      document.getElementById('gs-bar').style.width=((i/pd.numPages)*100)+'%';
      const page=await pd.getPage(i); const vp=page.getViewport({scale});
      cv.width=vp.width; cv.height=vp.height;
      await page.render({canvasContext:ctx,viewport:vp}).promise;
      const id=ctx.getImageData(0,0,cv.width,cv.height);
      for(let j=0;j<id.data.length;j+=4){const g=0.299*id.data[j]+0.587*id.data[j+1]+0.114*id.data[j+2];id.data[j]=id.data[j+1]=id.data[j+2]=g;}
      ctx.putImageData(id,0,0);
      const d=cv.toDataURL('image/jpeg',.88);
      const b=Uint8Array.from(atob(d.split(',')[1]),c=>c.charCodeAt(0));
      const emb=await nd.embedJpg(b); const{width,height}=emb.scale(1);
      const pg=nd.addPage([width,height]); pg.drawImage(emb,{x:0,y:0,width,height});
    }
    const out=await nd.save(); const r=addResult(out,gsSrc.id,'grayscale');
    document.getElementById('gs-prog').style.display='none';
    toast('Grayscale &#x2192; <strong>'+r.name+'</strong>','ok'); setStatus('Done','ok');
  }catch(err){
    toast('Failed: '+err.message,'err',8000); setStatus('Failed','err');
    document.getElementById('gs-prog').style.display='none';
  }
}

/* ══ IMAGE → PDF ══ */
let i2pQ=[];
function renderImg2Pdf(c){
  i2pQ=[];
  c.innerHTML=`
    <div class="tp-notice">&#x2713; Creates a new PDF from images. Originals untouched.</div>
    <div class="drop-zone" id="i2p-dz"><input type="file" id="i2p-inp" accept="image/jpeg,image/png,image/webp" multiple>
      <div class="dz-icon">&#x1F5BC;&#xFE0F;</div><div class="dz-text">Add images</div>
      <div class="dz-sub">JPG, PNG, WEBP — each image = one page</div></div>
    <div class="opt-grid"><div class="opt-card"><div class="opt-label">Page Size</div>
      <select class="opt-input" id="i2p-sz">
        <option value="fit">Fit to image</option><option value="letter">Letter (8.5x11)</option><option value="a4">A4</option>
      </select></div></div>
    <div id="i2p-list"></div>
    <div class="btn-row"><button class="btn btn-primary" id="i2p-go" onclick="doImg2Pdf()" disabled>&#x1F5BC;&#xFE0F; Convert &#x2192; Workspace</button></div>`;
  setupDropZone('i2p-dz','i2p-inp',async files=>{
    for(const f of files){const b=await readFileAsBytes(f);i2pQ.push({name:f.name,bytes:b,type:f.type});}
    renderI2PList();
  });
}
function renderI2PList(){
  const list=document.getElementById('i2p-list'); const btn=document.getElementById('i2p-go');
  if(!list) return; list.innerHTML='';
  i2pQ.forEach((f,i)=>{
    const item=document.createElement('div'); item.className='fli';
    item.innerHTML=`<div class="fli-icon">&#x1F5BC;&#xFE0F;</div>
      <div class="fli-inf"><div class="fli-nm">${escHtml(f.name)}</div><div class="fli-mt">${formatBytes(f.bytes.length)}</div></div>
      <div class="fli-btns">${i>0?`<button class="icon-btn" onclick="i2pMv(${i},-1)">&#x2191;</button>`:''}
      <button class="icon-btn danger" onclick="i2pQ.splice(${i},1);renderI2PList()">&#x2715;</button></div>`;
    list.appendChild(item);
  });
  if(btn) btn.disabled=i2pQ.length===0;
}
function i2pMv(i,d){const n=i+d;if(n<0||n>=i2pQ.length)return;[i2pQ[i],i2pQ[n]]=[i2pQ[n],i2pQ[i]];renderI2PList();}
async function doImg2Pdf(){
  if(!i2pQ.length) return; setStatus('Building PDF from images…','busy');
  const pgsz=document.getElementById('i2p-sz').value;
  try{
    const nd=await PDFLib.PDFDocument.create();
    for(const img of i2pQ){
      let emb;
      if(img.type==='image/jpeg'||img.name.match(/\.jpe?g$/i)){emb=await nd.embedJpg(img.bytes);}
      else{
        const blob=new Blob([img.bytes],{type:img.type});
        const url=URL.createObjectURL(blob);
        const bm=await createImageBitmap(await fetch(url).then(r=>r.blob()));
        URL.revokeObjectURL(url);
        const cv=document.createElement('canvas'); cv.width=bm.width; cv.height=bm.height;
        cv.getContext('2d').drawImage(bm,0,0);
        const jd=Uint8Array.from(atob(cv.toDataURL('image/jpeg',.92).split(',')[1]),c=>c.charCodeAt(0));
        emb=await nd.embedJpg(jd);
      }
      const{width:iw,height:ih}=emb.scale(1);
      let pw=iw,ph=ih;
      if(pgsz==='letter'){pw=612;ph=792;} else if(pgsz==='a4'){pw=595;ph=842;}
      const pg=nd.addPage([pw,ph]); const sc=Math.min(pw/iw,ph/ih); const sw=iw*sc,sh=ih*sc;
      pg.drawImage(emb,{x:(pw-sw)/2,y:(ph-sh)/2,width:sw,height:sh});
    }
    const out=await nd.save();
    const base=stripExt(i2pQ[0].name); const id=genId(); const name=base+'_images-to-pdf.pdf';
    workspace.push({id,name,baseName:base,size:out.length,bytes:out,isOriginal:false,parentId:null,operations:['images-to-pdf'],_renamedTo:null,type:'pdf'});
    renderAllWorkspaces(); updateMemBars();
    toast(`PDF from ${i2pQ.length} image(s) &#x2192; <strong>${name}</strong>`,'ok');
    setStatus('Done','ok'); i2pQ=[]; renderI2PList();
  }catch(err){toast('Failed: '+err.message,'err',8000); setStatus('Failed','err');}
}

/* ══ EXTRACT TEXT ══ */
let etSrc=null;
function renderExtractText(c){
  etSrc=selectedId?getFileById(selectedId):null;
  c.innerHTML=`
    <div class="tp-notice">&#x2713; Extracts selectable text only. Does not OCR scanned PDFs.</div>
    ${fileSourceHTML(etSrc,'et-dz','et-inp')}
    <div id="et-body" style="${etSrc?'':'display:none'}">
      <div id="et-prog" style="display:none" class="progress-wrap">
        <div class="progress-bar"><div class="progress-fill" id="et-bar" style="width:0%"></div></div>
        <div class="progress-text" id="et-pt">Extracting…</div></div>
      <textarea id="et-area" style="width:100%;height:200px;background:var(--s2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;color:var(--text);font-family:'DM Mono',monospace;font-size:11px;resize:vertical;outline:none;line-height:1.6;-webkit-appearance:none" readonly placeholder="Extracted text appears here…"></textarea>
      <div class="btn-row">
        <button class="btn btn-primary" onclick="doExtractText()">&#x1F4DD; Extract</button>
        <button class="btn btn-secondary" onclick="copyET()">&#x1F4CB; Copy</button>
        <button class="btn btn-secondary" onclick="dlET()">&#x2B07; Save .txt</button>
      </div>
    </div>`;
  if(!etSrc) setupDropZone('et-dz','et-inp',async files=>{await doLoadFile(files[0]);etSrc=workspace[workspace.length-1];document.getElementById('et-body').style.display='';doExtractText();});
  else doExtractText();
}
async function doExtractText(){
  if(!etSrc) return; setStatus('Extracting text…','busy');
  document.getElementById('et-prog').style.display='flex';
  try{
    const pd=await pdfjsLib.getDocument({data:etSrc.bytes}).promise; let text='';
    for(let i=1;i<=pd.numPages;i++){
      document.getElementById('et-pt').textContent=`Page ${i} / ${pd.numPages}`;
      document.getElementById('et-bar').style.width=((i/pd.numPages)*100)+'%';
      const page=await pd.getPage(i); const tc=await page.getTextContent();
      text+=`\n=== Page ${i} ===\n${tc.items.map(it=>it.str).join(' ')}\n`;
    }
    document.getElementById('et-area').value=text.trim();
    document.getElementById('et-prog').style.display='none';
    setStatus(`Text extracted from ${pd.numPages} pages`,'ok');
  }catch(err){toast('Extraction failed: '+err.message,'err',8000); setStatus('Failed','err');}
}
function copyET(){const t=document.getElementById('et-area')?.value;if(!t)return;navigator.clipboard.writeText(t).then(()=>toast('Copied to clipboard','ok'));}
function dlET(){const t=document.getElementById('et-area')?.value;if(!t||!etSrc)return;downloadText(t,etSrc.baseName+'_text.txt');toast('Text file downloaded','ok');}

/* ══ PDF → IMAGES ══ */
let p2iSrc=null;
function renderPdf2Img(c){
  p2iSrc=selectedId?getFileById(selectedId):null;
  c.innerHTML=`
    <div class="tp-notice">&#x2713; Exports each page as an image file.</div>
    ${fileSourceHTML(p2iSrc,'p2i-dz','p2i-inp')}
    <div id="p2i-body" style="${p2iSrc?'':'display:none'}">
      <div class="opt-grid">
        <div class="opt-card"><div class="opt-label">Format</div>
          <select class="opt-input" id="p2i-fmt"><option value="png">PNG (lossless)</option><option value="jpeg">JPEG (smaller)</option></select></div>
        <div class="opt-card"><div class="opt-label">DPI</div>
          <select class="opt-input" id="p2i-dpi"><option value="72">72 — Screen</option><option value="150" selected>150 — Standard</option><option value="300">300 — Print</option></select></div>
      </div>
      <div id="p2i-prog" style="display:none" class="progress-wrap">
        <div class="progress-bar"><div class="progress-fill" id="p2i-bar" style="width:0%"></div></div>
        <div class="progress-text" id="p2i-pt">Rendering…</div></div>
      <div id="p2i-thumbs" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px"></div>
      <div class="btn-row"><button class="btn btn-primary" onclick="doPdf2Img()">&#x1F305; Export Images</button></div>
    </div>`;
  if(!p2iSrc) setupDropZone('p2i-dz','p2i-inp',async files=>{await doLoadFile(files[0]);p2iSrc=workspace[workspace.length-1];document.getElementById('p2i-body').style.display='';});
}
async function doPdf2Img(){
  if(!p2iSrc) return; setStatus('Exporting images…','busy');
  const fmt=document.getElementById('p2i-fmt').value;
  const scale=parseInt(document.getElementById('p2i-dpi').value)/72;
  document.getElementById('p2i-prog').style.display='flex';
  document.getElementById('p2i-thumbs').innerHTML='';
  try{
    const pd=await pdfjsLib.getDocument({data:p2iSrc.bytes}).promise;
    const cv=document.createElement('canvas'); const ctx=cv.getContext('2d');
    for(let i=1;i<=pd.numPages;i++){
      document.getElementById('p2i-pt').textContent=`Page ${i} / ${pd.numPages}`;
      document.getElementById('p2i-bar').style.width=((i/pd.numPages)*100)+'%';
      const page=await pd.getPage(i); const vp=page.getViewport({scale});
      cv.width=vp.width; cv.height=vp.height;
      await page.render({canvasContext:ctx,viewport:vp}).promise;
      const mime=fmt==='png'?'image/png':'image/jpeg';
      const d=cv.toDataURL(mime,.92);
      const fname=p2iSrc.baseName+`_page${i}.${fmt}`;
      const th=document.createElement('img');
      th.src=d; th.style.cssText='height:80px;border-radius:4px;border:1px solid var(--border);cursor:pointer';
      th.title=`Page ${i} — tap to re-download`; th.onclick=()=>downloadDataURL(d,fname);
      document.getElementById('p2i-thumbs').appendChild(th);
      downloadDataURL(d,fname);
      await new Promise(r=>setTimeout(r,100));
    }
    document.getElementById('p2i-prog').style.display='none';
    toast(`Exported ${pd.numPages} image(s). Tap thumbnails to re-download.`,'ok');
    setStatus('Done','ok');
  }catch(err){toast('Failed: '+err.message,'err',8000); setStatus('Failed','err'); document.getElementById('p2i-prog').style.display='none';}
}

/* ══ REDACT ══ */
let rdSrc=null,rdRects=[],rdPage=1,rdPdf=null;
function renderRedact(c){
  rdSrc=selectedId?getFileById(selectedId):null; rdRects=[]; rdPage=1; rdPdf=null;
  c.innerHTML=`
    <div class="tp-danger">&#x26A0; Redaction is PERMANENT in the output file. Always verify before sharing. Your original is untouched.</div>
    ${fileSourceHTML(rdSrc,'rd-dz','rd-inp')}
    <div id="rd-body" style="${rdSrc?'':'display:none'}">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <button class="viewer-btn" onclick="rdPrev()">&#x25C0;</button>
        <span id="rd-info" style="font-family:'DM Mono',monospace;font-size:10px;color:var(--t2)">&#x2014;</span>
        <button class="viewer-btn" onclick="rdNext()">&#x25BA;</button>
        <button class="viewer-btn" onclick="rdUndo()">Undo</button>
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--t3)">Draw rectangles to redact</span>
      </div>
      <div style="overflow:auto;background:#0a0a0e;padding:10px;border-radius:var(--radius);-webkit-overflow-scrolling:touch">
        <div style="position:relative;display:inline-block">
          <canvas id="rd-base" style="display:block;max-width:100%"></canvas>
          <canvas id="rd-cv"   style="position:absolute;top:0;left:0;cursor:crosshair;touch-action:none;max-width:100%"></canvas>
        </div>
      </div>
      <div class="btn-row"><button class="btn btn-danger" onclick="doRedact()">&#x25A0; Apply Redactions &#x2192; Workspace</button></div>
    </div>`;
  if(!rdSrc) setupDropZone('rd-dz','rd-inp',async files=>{await doLoadFile(files[0]);rdSrc=workspace[workspace.length-1];initRD();document.getElementById('rd-body').style.display='';});
  else initRD();
}
async function initRD(){
  rdPdf=await pdfjsLib.getDocument({data:rdSrc.bytes}).promise;
  renderRDPage(); setupRDDraw();
}
async function renderRDPage(){
  const base=document.getElementById('rd-base'); const cv=document.getElementById('rd-cv');
  if(!base||!rdPdf) return;
  const page=await rdPdf.getPage(rdPage); const vp=page.getViewport({scale:1.3});
  base.width=vp.width; base.height=vp.height; cv.width=vp.width; cv.height=vp.height;
  await page.render({canvasContext:base.getContext('2d'),viewport:vp}).promise;
  redrawRD();
  const info=document.getElementById('rd-info');
  if(info) info.textContent=`${rdPage} / ${rdPdf.numPages}`;
}
function redrawRD(){
  const cv=document.getElementById('rd-cv'); if(!cv) return;
  const ctx=cv.getContext('2d'); ctx.clearRect(0,0,cv.width,cv.height);
  rdRects.filter(r=>r.page===rdPage).forEach(r=>{
    ctx.fillStyle='rgba(0,0,0,.85)'; ctx.fillRect(r.x,r.y,r.w,r.h);
    ctx.strokeStyle='#f06060'; ctx.lineWidth=1; ctx.strokeRect(r.x,r.y,r.w,r.h);
  });
}
function setupRDDraw(){
  const cv=document.getElementById('rd-cv'); if(!cv) return;
  const gp=e=>{
    const r=cv.getBoundingClientRect(); const src=e.touches?e.touches[0]:e;
    const sx=cv.width/r.width;
    return{x:(src.clientX-r.left)*sx,y:(src.clientY-r.top)*sx};
  };
  const start=e=>{const p=gp(e);rdDragging=true;rdSx=p.x;rdSy=p.y;};
  const move=e=>{
    if(!rdDragging) return; const p=gp(e); redrawRD();
    const ctx=cv.getContext('2d');
    ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillRect(Math.min(rdSx,p.x),Math.min(rdSy,p.y),Math.abs(p.x-rdSx),Math.abs(p.y-rdSy));
    ctx.strokeStyle='#f06060'; ctx.lineWidth=1; ctx.strokeRect(Math.min(rdSx,p.x),Math.min(rdSy,p.y),Math.abs(p.x-rdSx),Math.abs(p.y-rdSy));
  };
  const end=e=>{
    if(!rdDragging) return; rdDragging=false; const p=gp(e);
    if(Math.abs(p.x-rdSx)>5&&Math.abs(p.y-rdSy)>5){
      rdRects.push({page:rdPage,x:Math.min(rdSx,p.x),y:Math.min(rdSy,p.y),w:Math.abs(p.x-rdSx),h:Math.abs(p.y-rdSy)});
      redrawRD();
    }
  };
  cv.addEventListener('mousedown',start); cv.addEventListener('mousemove',move); cv.addEventListener('mouseup',end);
  cv.addEventListener('touchstart',start,{passive:true}); cv.addEventListener('touchmove',move,{passive:true}); cv.addEventListener('touchend',end,{passive:true});
}
function rdPrev(){if(rdPdf&&rdPage>1){rdPage--;renderRDPage();}}
function rdNext(){if(rdPdf&&rdPage<rdPdf.numPages){rdPage++;renderRDPage();}}
function rdUndo(){const idx=rdRects.map((r,i)=>r.page===rdPage?i:-1).filter(i=>i>=0);if(idx.length)rdRects.splice(idx[idx.length-1],1);redrawRD();}
async function doRedact(){
  if(!rdSrc){toast('No file selected','warn');return;}
  if(!rdRects.length){toast('No redaction areas drawn','warn');return;}
  setStatus('Applying redactions…','busy');
  try{
    const cv=document.createElement('canvas'); const ctx=cv.getContext('2d');
    const nd=await PDFLib.PDFDocument.create();
    for(let i=1;i<=rdPdf.numPages;i++){
      const page=await rdPdf.getPage(i); const vp=page.getViewport({scale:2});
      cv.width=vp.width; cv.height=vp.height;
      await page.render({canvasContext:ctx,viewport:vp}).promise;
      const sc=2/1.3;
      rdRects.filter(r=>r.page===i).forEach(r=>{ctx.fillStyle='#000';ctx.fillRect(r.x*sc,r.y*sc,r.w*sc,r.h*sc);});
      const d=cv.toDataURL('image/jpeg',.92);
      const b=Uint8Array.from(atob(d.split(',')[1]),c=>c.charCodeAt(0));
      const emb=await nd.embedJpg(b); const{width,height}=emb.scale(1);
      const pg=nd.addPage([width,height]); pg.drawImage(emb,{x:0,y:0,width,height});
    }
    const out=await nd.save(); const r=addResult(out,rdSrc.id,'redacted');
    toast(`Redacted ${rdRects.length} area(s) &#x2192; <strong>${r.name}</strong>. Verify before sharing.`,'ok',8000);
    setStatus('Redaction applied','ok');
  }catch(err){toast('Failed: '+err.message,'err',8000); setStatus('Failed','err');}
}

/* ══ PROTECT ══ */
let ptSrc=null;
function renderProtect(c){
  ptSrc=selectedId?getFileById(selectedId):null;
  c.innerHTML=`
    <div class="tp-notice">&#x2713; Creates a new encrypted file. Original untouched.</div>
    <div class="tp-warn">&#x26A0; Encryption applies to the <strong>downloaded file only</strong>. Workspace files and browser backup are NOT encrypted by this app.</div>
    ${fileSourceHTML(ptSrc,'pt-dz','pt-inp')}
    <div id="pt-body" style="${ptSrc?'':'display:none'}">
      <div class="opt-grid">
        <div class="opt-card"><div class="opt-label">User Password (to open)</div>
          <input class="opt-input" type="password" id="pt-user" placeholder="Required"></div>
        <div class="opt-card"><div class="opt-label">Owner Password (to edit)</div>
          <input class="opt-input" type="password" id="pt-owner" placeholder="Optional"></div>
        <div class="opt-card"><div class="opt-label">Allow Printing</div>
          <select class="opt-input" id="pt-print"><option value="yes">Yes</option><option value="no">No</option></select></div>
        <div class="opt-card"><div class="opt-label">Allow Copying</div>
          <select class="opt-input" id="pt-copy"><option value="yes">Yes</option><option value="no">No</option></select></div>
      </div>
      <div class="btn-row"><button class="btn btn-primary" onclick="doProtect()">&#x1F512; Encrypt &#x2192; Workspace</button></div>
    </div>`;
  if(!ptSrc) setupDropZone('pt-dz','pt-inp',async files=>{await doLoadFile(files[0]);ptSrc=workspace[workspace.length-1];document.getElementById('pt-body').style.display='';});
}
async function doProtect(){
  if(!ptSrc) return;
  const pwd=document.getElementById('pt-user').value;
  if(!pwd){toast('Enter a user password','err');return;}
  const ownerPwd=document.getElementById('pt-owner').value||pwd+'_owner';
  setStatus('Encrypting…','busy');
  try{
    const doc=await PDFLib.PDFDocument.load(ptSrc.bytes,{ignoreEncryption:true});
    const cp=document.getElementById('pt-print').value==='yes';
    const cc=document.getElementById('pt-copy').value==='yes';
    const out=await doc.save({
      userPassword:pwd,ownerPassword:ownerPwd,
      permissions:{printing:cp?'lowResolution':'none',copying:cc,modifying:false,
        annotating:false,fillingForms:false,contentAccessibility:cc,documentAssembly:false}
    });
    const r=addResult(out,ptSrc.id,'protected');
    toast('Encrypted &#x2192; <strong>'+r.name+'</strong>. Download to get the protected file.','ok');
    setStatus('Done','ok');
  }catch(err){toast('Encryption failed: '+err.message,'err',8000); setStatus('Failed','err');}
}

/* ══ UNLOCK ══ */
let ulSrc=null;
function renderUnlock(c){
  ulSrc=selectedId?getFileById(selectedId):null;
  c.innerHTML=`
    <div class="tp-notice">&#x2713; Creates a new unlocked file. Original untouched.</div>
    ${fileSourceHTML(ulSrc,'ul-dz','ul-inp')}
    <div id="ul-body" style="${ulSrc?'':'display:none'}">
      <div class="opt-grid"><div class="opt-card"><div class="opt-label">Current Password</div>
        <input class="opt-input" type="password" id="ul-pwd" placeholder="Enter current password"></div></div>
      <div class="btn-row"><button class="btn btn-primary" onclick="doUnlock()">&#x1F513; Decrypt &#x2192; Workspace</button></div>
    </div>`;
  if(!ulSrc) setupDropZone('ul-dz','ul-inp',async files=>{await doLoadFile(files[0]);ulSrc=workspace[workspace.length-1];document.getElementById('ul-body').style.display='';});
}
async function doUnlock(){
  if(!ulSrc) return;
  const pwd=document.getElementById('ul-pwd').value;
  if(!pwd){toast('Enter the current password','err');return;}
  setStatus('Decrypting…','busy');
  try{
    const doc=await PDFLib.PDFDocument.load(ulSrc.bytes,{password:pwd});
    const out=await doc.save(); const r=addResult(out,ulSrc.id,'unlocked');
    toast('Decrypted &#x2192; <strong>'+r.name+'</strong>','ok'); setStatus('Done','ok');
  }catch(err){
    toast('Wrong password or file is not encrypted. Error: '+err.message,'err',8000);
    setStatus('Failed','err');
  }
}
