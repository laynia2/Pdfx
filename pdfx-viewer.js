/* ════════════════════════════════════════════════════════
   pdfx-viewer.js
   PDF viewer · reader mode · annotation mode
   ════════════════════════════════════════════════════════ */

let vPdfDoc=null, vPage=1, vScale=1.3;
let rPdfDoc=null, rPage=1, rScale=1.3, rCrop=null, rBarVisible=false;
let annPdfDoc=null, annPage=1, annStrokes=[], annTool='highlight', annColor='#ffec60';
let annDragging=false, annSx=0, annSy=0;
let rCropDragging=false, rCropSx=0, rCropSy=0;
let rdDragging=false, rdSx=0, rdSy=0;

/* ══════════════════════════════════════
   VIEWER
══════════════════════════════════════ */
async function loadViewer(id){
  const f=getFileById(id);
  if(!f||f.type!=='pdf'){
    document.getElementById('viewer-pages').innerHTML=
      '<div class="viewer-placeholder">Select a PDF file to view it</div>';
    return;
  }
  setStatus('Rendering '+f.name+'…','busy');
  try{
    vPdfDoc=await pdfjsLib.getDocument({data:f.bytes}).promise;
    vPage=1;
    await buildThumbs();
    await renderVPage();
    setStatus('Viewing: '+f.name,'ok');
  }catch(err){
    toast('Render failed: '+err.message,'err',8000);
    setStatus('Render error','err');
  }
}

async function buildThumbs(){
  const col=document.getElementById('thumb-col');
  if(!col||!vPdfDoc) return;
  col.innerHTML='';
  for(let i=1;i<=vPdfDoc.numPages;i++){
    const wrap=document.createElement('div');
    wrap.className='thumb-item'+(i===vPage?' active':'');
    wrap.id='vth-'+i;
    const cv=document.createElement('canvas'); cv.className='thumb-canvas';
    const lbl=document.createElement('div');   lbl.className='thumb-page-num'; lbl.textContent=i;
    wrap.appendChild(cv); wrap.appendChild(lbl);
    wrap.onclick=()=>{vPage=i;renderVPage();};
    col.appendChild(wrap);
    const page=await vPdfDoc.getPage(i);
    const vp=page.getViewport({scale:0.11});
    cv.width=vp.width; cv.height=vp.height;
    page.render({canvasContext:cv.getContext('2d'),viewport:vp});
  }
}

async function renderVPage(){
  const main=document.getElementById('viewer-pages');
  if(!main||!vPdfDoc) return;
  main.innerHTML='';
  const page=await vPdfDoc.getPage(vPage);
  const vp=page.getViewport({scale:vScale});
  const cv=document.createElement('canvas'); cv.className='page-canvas';
  cv.width=vp.width; cv.height=vp.height;
  main.appendChild(cv);
  const lbl=document.createElement('div'); lbl.className='page-label';
  lbl.textContent=`Page ${vPage} of ${vPdfDoc.numPages}`;
  main.appendChild(lbl);
  await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
  const info=document.getElementById('v-page-info');
  const zoom=document.getElementById('v-zoom-info');
  if(info) info.textContent=`${vPage} / ${vPdfDoc.numPages}`;
  if(zoom) zoom.textContent=Math.round(vScale*100)+'%';
  document.querySelectorAll('.thumb-item').forEach(t=>t.classList.remove('active'));
  const at=document.getElementById('vth-'+vPage);
  if(at){at.classList.add('active');at.scrollIntoView({block:'nearest'});}
}

function vPrev(){if(vPdfDoc&&vPage>1){vPage--;renderVPage();}}
function vNext(){if(vPdfDoc&&vPage<vPdfDoc.numPages){vPage++;renderVPage();}}
function vZoom(d){vScale=Math.max(0.4,Math.min(3,vScale+d));if(vPdfDoc)renderVPage();}

function dlViewingFile(){
  const f=viewingId?getFileById(viewingId):null;
  if(!f){toast('No file currently viewed','warn');return;}
  downloadBlob(f.bytes,buildOutputName(f));
  toast('Downloaded: '+buildOutputName(f),'ok');
}

/* ══════════════════════════════════════
   READER MODE
══════════════════════════════════════ */
async function openReader(){
  const f=viewingId?getFileById(viewingId):(selectedId?getFileById(selectedId):null);
  if(!f||f.type!=='pdf'){toast('Select a PDF to read','warn');return;}
  viewingId=f.id;
  setStatus('Loading reader…','busy');
  try{
    rPdfDoc=await pdfjsLib.getDocument({data:f.bytes}).promise;
    rPage=vPage||1; rScale=vScale||1.3; rCrop=null;
    document.getElementById('reader-overlay').classList.remove('hidden');
    await renderReaderPage();
    setupReaderCropDrag();
    setStatus('Reader mode','ok');
  }catch(err){toast('Reader failed: '+err.message,'err',8000);}
}

function closeReader(){
  document.getElementById('reader-overlay').classList.add('hidden');
  rCrop=null;
  cleanupReaderCropDrag();
}

async function renderReaderPage(){
  const base=document.getElementById('reader-base-canvas');
  const crop=document.getElementById('reader-crop-canvas');
  if(!base||!rPdfDoc) return;
  const page=await rPdfDoc.getPage(rPage);
  const vp=page.getViewport({scale:rScale});
  base.width=vp.width; base.height=vp.height;
  crop.width=vp.width; crop.height=vp.height;
  base.style.maxWidth='100%'; crop.style.maxWidth='100%';
  await page.render({canvasContext:base.getContext('2d'),viewport:vp}).promise;
  const pgi=document.getElementById('reader-page-info');
  if(pgi) pgi.textContent=`${rPage} / ${rPdfDoc.numPages}`;
  if(rCrop) drawReaderCrop();
}

function rPrev(){if(rPdfDoc&&rPage>1){rPage--;renderReaderPage();}}
function rNext(){if(rPdfDoc&&rPage<rPdfDoc.numPages){rPage++;renderReaderPage();}}
function rZoom(d){rScale=Math.max(0.4,Math.min(3,rScale+d));if(rPdfDoc)renderReaderPage();}

function toggleReaderBar(){
  rBarVisible=!rBarVisible;
  const bar=document.getElementById('reader-mini-bar');
  if(bar) bar.classList.toggle('hidden',!rBarVisible);
}

function clearReaderCrop(){
  rCrop=null;
  const cv=document.getElementById('reader-crop-canvas');
  if(cv){const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);}
}

function drawReaderCrop(){
  const cv=document.getElementById('reader-crop-canvas');
  if(!cv||!rCrop) return;
  const ctx=cv.getContext('2d');
  ctx.clearRect(0,0,cv.width,cv.height);
  ctx.fillStyle='rgba(0,0,0,0.5)';
  ctx.fillRect(0,0,cv.width,cv.height);
  ctx.clearRect(rCrop.x,rCrop.y,rCrop.w,rCrop.h);
  ctx.strokeStyle='rgba(124,106,247,.9)';
  ctx.lineWidth=2;
  ctx.strokeRect(rCrop.x,rCrop.y,rCrop.w,rCrop.h);
}

function getCanvasPos(cv,e){
  const r=cv.getBoundingClientRect();
  const src=e.touches?e.touches[0]:e;
  const sx=cv.width/r.width;
  return{x:(src.clientX-r.left)*sx,y:(src.clientY-r.top)*sx};
}

function setupReaderCropDrag(){
  const cv=document.getElementById('reader-crop-canvas');
  if(!cv) return;
  const start=e=>{const p=getCanvasPos(cv,e);rCropDragging=true;rCropSx=p.x;rCropSy=p.y;};
  const move=e=>{
    if(!rCropDragging) return;
    const p=getCanvasPos(cv,e);
    rCrop={x:Math.min(rCropSx,p.x),y:Math.min(rCropSy,p.y),
           w:Math.abs(p.x-rCropSx),h:Math.abs(p.y-rCropSy)};
    drawReaderCrop();
  };
  const end=e=>{
    if(!rCropDragging) return;
    rCropDragging=false;
    if(rCrop&&rCrop.w>20&&rCrop.h>20){
      const scroll=document.getElementById('reader-scroll');
      const scaleX=cv.getBoundingClientRect().width/cv.width;
      if(scroll){scroll.scrollLeft=rCrop.x*scaleX-20;scroll.scrollTop=rCrop.y*scaleX-20;}
    }
  };
  cv._rcStart=start; cv._rcMove=move; cv._rcEnd=end;
  cv.addEventListener('mousedown',start); cv.addEventListener('mousemove',move); cv.addEventListener('mouseup',end);
  cv.addEventListener('touchstart',start,{passive:true}); cv.addEventListener('touchmove',move,{passive:true}); cv.addEventListener('touchend',end,{passive:true});
}

function cleanupReaderCropDrag(){
  const cv=document.getElementById('reader-crop-canvas');
  if(!cv||!cv._rcStart) return;
  cv.removeEventListener('mousedown',cv._rcStart); cv.removeEventListener('mousemove',cv._rcMove); cv.removeEventListener('mouseup',cv._rcEnd);
  cv.removeEventListener('touchstart',cv._rcStart); cv.removeEventListener('touchmove',cv._rcMove); cv.removeEventListener('touchend',cv._rcEnd);
}

/* ══════════════════════════════════════
   ANNOTATE MODE
══════════════════════════════════════ */
async function openAnnotate(){
  const f=viewingId?getFileById(viewingId):(selectedId?getFileById(selectedId):null);
  if(!f||f.type!=='pdf'){toast('Select a PDF to annotate','warn');return;}
  viewingId=f.id; annStrokes=[]; annPage=vPage||1;
  setStatus('Loading annotation mode…','busy');
  try{
    annPdfDoc=await pdfjsLib.getDocument({data:f.bytes}).promise;
    document.getElementById('ann-overlay').classList.remove('hidden');
    await renderAnnPage();
    setupAnnDraw();
    setStatus('Annotation mode — save or discard when done','ok');
  }catch(err){toast('Annotate failed: '+err.message,'err',8000);}
}

async function renderAnnPage(){
  const base=document.getElementById('ann-base-canvas');
  const draw=document.getElementById('ann-draw-canvas');
  if(!base||!annPdfDoc) return;
  const page=await annPdfDoc.getPage(annPage);
  const vp=page.getViewport({scale:vScale});
  base.width=vp.width; base.height=vp.height;
  draw.width=vp.width; draw.height=vp.height;
  base.style.maxWidth='100%'; draw.style.maxWidth='100%';
  await page.render({canvasContext:base.getContext('2d'),viewport:vp}).promise;
  redrawAnnotations();
  const pgi=document.getElementById('ann-page-info');
  if(pgi) pgi.textContent=`${annPage} / ${annPdfDoc.numPages}`;
}

function redrawAnnotations(){
  const draw=document.getElementById('ann-draw-canvas');
  if(!draw) return;
  const ctx=draw.getContext('2d');
  ctx.clearRect(0,0,draw.width,draw.height);
  annStrokes.filter(s=>s.page===annPage).forEach(s=>{
    if(s.type==='highlight'){ctx.fillStyle=s.color+'88';ctx.fillRect(s.x,s.y,s.w,s.h);}
    else if(s.type==='note'){
      ctx.fillStyle='#ffec60'; ctx.fillRect(s.x,s.y,24,24);
      ctx.fillStyle='#333'; ctx.font='14px sans-serif'; ctx.fillText('✎',s.x+4,s.y+17);
    }
  });
}

function setupAnnDraw(){
  const draw=document.getElementById('ann-draw-canvas');
  if(!draw) return;
  const gp=e=>{
    const r=draw.getBoundingClientRect();
    const src=e.touches?e.touches[0]:e;
    const sx=draw.width/r.width;
    return{x:(src.clientX-r.left)*sx,y:(src.clientY-r.top)*sx};
  };
  const start=e=>{const p=gp(e);annDragging=true;annSx=p.x;annSy=p.y;};
  const move=e=>{
    if(!annDragging) return;
    const p=gp(e);
    if(annTool==='highlight'){
      redrawAnnotations();
      const ctx=document.getElementById('ann-draw-canvas')?.getContext('2d');
      if(ctx){ctx.fillStyle=annColor+'88';ctx.fillRect(Math.min(annSx,p.x),Math.min(annSy,p.y),Math.abs(p.x-annSx),Math.abs(p.y-annSy));}
    }
  };
  const end=e=>{
    if(!annDragging) return; annDragging=false;
    const p=gp(e);
    if(annTool==='highlight'&&Math.abs(p.x-annSx)>5&&Math.abs(p.y-annSy)>5){
      annStrokes.push({type:'highlight',page:annPage,x:Math.min(annSx,p.x),y:Math.min(annSy,p.y),w:Math.abs(p.x-annSx),h:Math.abs(p.y-annSy),color:annColor});
      redrawAnnotations();
    }else if(annTool==='note'){
      annStrokes.push({type:'note',page:annPage,x:annSx-12,y:annSy-12,color:annColor});
      redrawAnnotations();
    }
  };
  draw.addEventListener('mousedown',start); draw.addEventListener('mousemove',move); draw.addEventListener('mouseup',end);
  draw.addEventListener('touchstart',start,{passive:true}); draw.addEventListener('touchmove',move,{passive:true}); draw.addEventListener('touchend',end,{passive:true});
}

function setAnnTool(t){
  annTool=t;
  document.getElementById('ann-hl-btn')?.classList.toggle('active',t==='highlight');
  document.getElementById('ann-note-btn')?.classList.toggle('active',t==='note');
}

function setAnnColor(c,el){
  annColor=c;
  document.querySelectorAll('.ann-color').forEach(e=>e.classList.remove('active'));
  el.classList.add('active');
}

function undoLastAnnotation(){
  const idx=annStrokes.map((s,i)=>s.page===annPage?i:-1).filter(i=>i>=0);
  if(idx.length) annStrokes.splice(idx[idx.length-1],1);
  redrawAnnotations();
}

function annPrev(){if(annPdfDoc&&annPage>1){annPage--;renderAnnPage();}}
function annNext(){if(annPdfDoc&&annPage<annPdfDoc.numPages){annPage++;renderAnnPage();}}

function discardAnnotations(){
  showWarn('Discard Annotations','All annotations will be lost. Your original file is untouched.','Discard',()=>{
    annStrokes=[];
    document.getElementById('ann-overlay').classList.add('hidden');
  });
}

async function saveAnnotations(){
  const f=viewingId?getFileById(viewingId):null;
  if(!f){toast('No file to annotate','warn');return;}
  setStatus('Burning annotations into new file…','busy');
  try{
    const newDoc=await PDFLib.PDFDocument.create();
    const cv=document.createElement('canvas');
    const ctx=cv.getContext('2d');
    for(let i=1;i<=annPdfDoc.numPages;i++){
      const page=await annPdfDoc.getPage(i);
      const vp=page.getViewport({scale:2});
      cv.width=vp.width; cv.height=vp.height;
      await page.render({canvasContext:ctx,viewport:vp}).promise;
      const sc=2/vScale;
      annStrokes.filter(s=>s.page===i).forEach(s=>{
        if(s.type==='highlight'){ctx.fillStyle=s.color+'88';ctx.fillRect(s.x*sc,s.y*sc,s.w*sc,s.h*sc);}
        else if(s.type==='note'){
          ctx.fillStyle='#ffec60';ctx.fillRect(s.x*sc,s.y*sc,48,48);
          ctx.fillStyle='#333';ctx.font='28px sans-serif';ctx.fillText('✎',s.x*sc+8,s.y*sc+34);
        }
      });
      const d=cv.toDataURL('image/jpeg',.92);
      const b=Uint8Array.from(atob(d.split(',')[1]),c=>c.charCodeAt(0));
      const emb=await newDoc.embedJpg(b);
      const{width,height}=emb.scale(1);
      const pg=newDoc.addPage([width,height]);
      pg.drawImage(emb,{x:0,y:0,width,height});
    }
    const out=await newDoc.save();
    const result=addResult(out,f.id,'annotated');
    document.getElementById('ann-overlay').classList.add('hidden');
    toast('Annotated copy saved: <strong>'+result.name+'</strong>. Original untouched.','ok');
    setStatus('Annotation saved','ok');
  }catch(err){toast('Save failed: '+err.message,'err',8000);setStatus('Failed','err');}
}
