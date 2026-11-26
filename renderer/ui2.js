'use strict';
/* =====================================================================
   ORBWEAVE ui (part 2): index view, settings, search bar, keys, welcome
   ===================================================================== */

/* ---------------- Index view ---------------- */
const ix={tab:'entries',q:'',type:null,filter:'all',sort:'name',asc:true,rel:''};
const IX_FILTERS=[['all','All'],['starred','★ Starred'],['unsure','Not sure yet'],['orphan','No connections'],['nodesc','No description'],['recent','Edited this week']];
function setView(v){
  viewMode=v;
  $$('#seg button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  $('#index').hidden=v!=='index';
  if(v==='index')renderIndex();else need=true;
}
$('#seg').addEventListener('click',ev=>{const b=ev.target.closest('button');if(b)setView(b.dataset.v);});
function openIndexWith(q){ix.q=q;ix.tab='entries';setView('index');}
function ixPass(e){
  if(ix.type&&e.type!==ix.type)return false;
  switch(ix.filter){
    case 'starred':return e.starred;
    case 'unsure':return e.conf==='unsure';
    case 'orphan':return derived.adj.get(e.id).size===0;
    case 'nodesc':return !e.summary.trim()&&!e.desc.trim();
    case 'recent':return Date.now()-e.updated<7*864e5;
  }
  return true;
}
function renderIndex(){
  const el=$('#index');
  const tabs=`<div class="tabs"><button class="tab ${ix.tab==='entries'?'on':''}" data-tab="entries">Entries (${entries.length})</button><button class="tab ${ix.tab==='links'?'on':''}" data-tab="links">Connections (${entries.reduce((n,e)=>n+e.links.length,0)})</button></div>`;
  let bar='';
  if(ix.tab==='entries'){
    bar=`<div class="bar"><input id="ix-q" placeholder="Filter the list… (also #tag, type:person)" value="${esc(ix.q)}" autocomplete="off">
      ${types.map(t=>`<button class="pillf ${ix.type===t.id?'on':''}" data-ixtype="${esc(t.id)}" style="${ix.type===t.id?`border-color:${t.color}`:''}">${esc(t.name)}</button>`).join('')}</div>
      <div class="bar" style="padding-top:0">${IX_FILTERS.map(([k,n])=>`<button class="pillf ${ix.filter===k?'on':''}" data-ixf="${k}">${n}</button>`).join('')}
      <span style="margin-left:auto"><button class="btn sm" data-ixexp="entries">Export CSV</button></span></div>`;
  }else{
    bar=`<div class="bar"><select id="ix-rel" class="f" style="max-width:260px"><option value="">All connection types</option>${relations.map(r=>`<option value="${esc(r.id)}" ${ix.rel===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select>
      <span style="margin-left:auto"><button class="btn sm" data-ixexp="links">Export CSV</button></span></div>`;
  }
  el.innerHTML=`<div class="bar" style="padding-bottom:0"><b style="font-size:16px;margin-right:8px">Index</b>${tabs}</div>${bar}<div class="scroll" id="ix-body"></div>`;
  renderIndexBody();
}
function renderIndexBody(){
  const body=$('#ix-body');if(!body)return;
  if(ix.tab==='links'){
    const rows=[];
    for(const e of entries)for(const l of e.links){if(ix.rel&&l.rel!==ix.rel)continue;rows.push({e,l,o:byId.get(l.to),r:R(l.rel)});}
    rows.sort((a,b)=>label(a.e).localeCompare(label(b.e)));
    body.innerHTML=rows.length?`<table class="ix"><thead><tr><th>From</th><th>Connection</th><th>To</th><th>What moves</th><th>How</th><th>How often</th><th>Note</th></tr></thead><tbody>${rows.map(({e,l,o,r})=>`<tr class="r" data-id="${e.id}"><td class="nmc"><i class="dot" style="--c:${nodeColor(e)}"></i> ${esc(label(e))}</td><td style="color:${r.color}">${esc(r.name)}</td><td class="nmc"><a class="ref" data-go="${o.id}" style="--c:${nodeColor(o)}"><i class="dot" style="--c:${nodeColor(o)}"></i> ${esc(label(o))}</a></td><td>${esc(l.data)}</td><td>${esc(l.method)}</td><td>${esc(l.freq)}</td><td class="muted">${esc(l.note)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No connections yet. Open an entry, press edit, and add one under Connections.</div>';
    return;
  }
  let list=ix.q.trim()?searchEntries(ix.q,{limit:1e9}):entries.slice();
  list=list.filter(ixPass);
  if(!ix.q.trim()){
    const dir=ix.asc?1:-1;
    const key={name:e=>label(e).toLowerCase(),type:e=>T(e).name.toLowerCase()+label(e).toLowerCase(),conn:e=>e.deg,edited:e=>e.updated,full:e=>e.full.toLowerCase()}[ix.sort]||(e=>label(e).toLowerCase());
    list.sort((a,b)=>{const x=key(a),y=key(b);return (x<y?-1:x>y?1:0)*dir;});
  }
  const th=(k,n)=>`<th data-sort="${k}">${n}${ix.sort===k?(ix.asc?' ▴':' ▾'):''}</th>`;
  body.innerHTML=list.length?`<table class="ix"><thead><tr>${th('name','Name')}${th('full','Full name')}${th('type','Category')}<th>Summary</th>${th('conn','Connections')}${th('edited','Edited')}</tr></thead><tbody>${list.map(e=>{
    const u=imgURL(e.image),sm=(e.summary||e.desc).replace(/\s+/g,' ').trim();
    return `<tr class="r" data-id="${e.id}"><td class="nmc">${u?`<img class="thumb" src="${esc(u)}" alt="">`:`<i class="dot" style="--c:${nodeColor(e)}"></i> `}${esc(label(e))}${e.starred?' <span style="color:#ffd166">★</span>':''}</td><td>${esc(e.full)}</td><td style="color:${nodeColor(e)}">${esc(T(e).name)}</td><td class="muted">${esc(sm.length>120?sm.slice(0,119)+'…':sm)}</td><td>${e.deg}</td><td class="muted">${esc(ago(e.updated))}</td></tr>`;}).join('')}</tbody></table>`:(entries.length?'<div class="empty">Nothing matches.</div>':'<div class="empty">Nothing here yet. Add your first entry with the bar at the bottom.</div>');
}
$('#index').addEventListener('input',ev=>{
  if(ev.target.id==='ix-q'){ix.q=ev.target.value;renderIndexBody();}
  else if(ev.target.id==='ix-rel'){ix.rel=ev.target.value;renderIndexBody();}
});
$('#index').addEventListener('click',ev=>{
  const g=ev.target.closest('[data-go]');if(g){ev.stopPropagation();focus(g.dataset.go);return;}
  const t=ev.target.closest('[data-tab]');if(t){ix.tab=t.dataset.tab;renderIndex();return;}
  const ty=ev.target.closest('[data-ixtype]');if(ty){ix.type=ix.type===ty.dataset.ixtype?null:ty.dataset.ixtype;renderIndex();return;}
  const f=ev.target.closest('[data-ixf]');if(f){ix.filter=f.dataset.ixf;renderIndex();return;}
  const ex=ev.target.closest('[data-ixexp]');if(ex){ex.dataset.ixexp==='links'?exportLinksCSV():exportEntriesCSV();return;}
  const s=ev.target.closest('[data-sort]');if(s){const k=s.dataset.sort;if(ix.sort===k)ix.asc=!ix.asc;else{ix.sort=k;ix.asc=true;}renderIndexBody();return;}
  const r=ev.target.closest('tr.r');if(r)focus(r.dataset.id);
});

/* ---------------- Settings ---------------- */
const SET={tab:'types',selType:null,selRel:null,selView:null};
function pointsFor(shape,r){
  const P=[],poly=(n,off,rr)=>{for(let i=0;i<n;i++){const a=i*Math.PI*2/n+off;P.push([Math.cos(a)*rr,Math.sin(a)*rr]);}};
  if(shape==='diamond')poly(4,-Math.PI/2,r*1.25);
  else if(shape==='hexagon')poly(6,Math.PI/6,r*1.1);
  else if(shape==='octagon')poly(8,Math.PI/8,r*1.1);
  else if(shape==='triangle'){poly(3,-Math.PI/2,r*1.3);}
  else if(shape==='star'){for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.58:r*1.32;P.push([Math.cos(a)*rr,Math.sin(a)*rr]);}}
  return P;
}
function shapeSVG(shape,color,s=26){
  const c=s/2,r=s*.32;let inner;
  if(shape==='circle')inner=`<circle cx="${c}" cy="${c}" r="${r}"/>`;
  else if(shape==='square')inner=`<rect x="${c-r}" y="${c-r}" width="${2*r}" height="${2*r}" rx="${r*.34}"/>`;
  else inner=`<polygon points="${pointsFor(shape,r).map(p=>(c+p[0]).toFixed(1)+','+(c+p[1]).toFixed(1)).join(' ')}"/>`;
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="rgba(255,255,255,.04)" stroke="${color}" stroke-width="2" stroke-linejoin="round">${inner}</svg>`;
}
function openSettings(tab='types',opts={}){
  SET.tab=tab;
  if(opts.select)SET.selType=opts.select;
  if(opts.selectView)SET.selView=opts.selectView;
  if(!SET.selType||!typeById.has(SET.selType))SET.selType=types[0]?types[0].id:null;
  if(!SET.selRel||!relById.has(SET.selRel))SET.selRel=relations[0]?relations[0].id:null;
  if(!SET.selView||!lenses.some(l=>l.id===SET.selView))SET.selView=lenses[0]?lenses[0].id:null;
  $('#modal').hidden=false;renderSettings();
  if(opts.focusName)setTimeout(()=>{const f=$('#v-name');if(f){f.focus();f.select();}},40);
}
function closeModal(){$('#modal').hidden=true;$('#mbox').innerHTML='';}
function swatchesHTML(cur,attr){
  return `<div class="swatches">${PALETTE.map(c=>`<button class="sw ${c.toLowerCase()===cur.toLowerCase()?'on':''}" ${attr}="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}<input type="color" value="${cur}" data-pick="${attr}" title="Any colour"></div>`;
}
function refreshAfterSchema(){renderHud();if(focusId)renderPanel();if(viewMode==='index')renderIndex();need=true;commit();}
const SETTINGS_TABS=[['types','Categories'],['rels','Connections'],['views','Views'],['data','File & backup'],['help','Tutorial & help']];
function relPreview(r){
  const a='<b>Maya</b>',b='<b>Calculus</b>';
  return r.sym?`${a} ${esc(r.name)} ${b}, and the same read from either side.`:`${a} ${esc(r.name)} ${b}. Seen from ${b}: “${b} ${esc(invName(r))} ${a}”.`;
}
function renderSettings(){
  if($('#modal').hidden)return;
  const mb=$('#mbox');
  const head=`<div class="mh"><h3>Settings</h3>${SETTINGS_TABS.map(([k,n])=>`<button class="tab ${SET.tab===k?'on':''}" data-stab="${k}">${n}</button>`).join('')}<button class="x" style="margin-left:auto" data-mclose="1" aria-label="Close">✕</button></div>`;
  let body='';
  if(SET.tab==='types'){
    const t=typeById.get(SET.selType),cnt=new Map();for(const e of entries)cnt.set(e.type,(cnt.get(e.type)||0)+1);
    const have=new Set(types.map(x=>x.name.toLowerCase())),sugg=STARTER_CATEGORIES.filter(c=>!have.has(c.name.toLowerCase()));
    const side=`<div class="side" id="set-side">${types.map(x=>`<button class="fchip ${t&&x.id===t.id?'on':''}" data-seltype="${esc(x.id)}" style="--c:${x.color}">${shapeSVG(x.shape,x.color,22)}<span>${esc(x.name)}</span><span class="n">${cnt.get(x.id)||0}</span></button>`).join('')}
      <button class="btn sm" style="margin:10px 8px" data-newtype="1">＋ New category</button>
      ${sugg.length?`<div class="muted small" style="margin:12px 8px 4px">Suggestions (one click)</div><div class="starters side">${sugg.map(c=>`<button class="tdot" data-addstarter="${esc(c.name)}">＋ ${esc(c.name)}</button>`).join('')}</div>`:''}</div>`;
    if(!t){
      body=`<div class="mb">${side}<div class="scroll"><div class="empty">No categories yet.<br><br>A category says what kind of thing an entry is, like Person, Course or Idea. Pick a suggestion on the left, or make your own with “New category”. Every category can have its own colour, shape and extra fields.</div></div></div>`;
    }else{
      body=`<div class="mb">${side}
      <div class="scroll"><label class="l" style="margin-top:6px">Name</label><input class="f" id="t-name" value="${esc(t.name)}" autocomplete="off">
      <label class="l">Colour</label>${swatchesHTML(t.color,'data-tcolor')}
      <label class="l">Shape on the map</label><div class="shapes">${SHAPES.map(s=>`<button class="shp ${t.shape===s?'on':''}" data-tshape="${s}" title="${s}">${shapeSVG(s,t.color)}</button>`).join('')}</div>
      <label class="l">Symbol inside the shape <span class="muted" style="text-transform:none;letter-spacing:0">(optional: 1–2 characters or an emoji)</span></label><input class="f" id="t-glyph" maxlength="2" style="width:90px" value="${esc(t.glyph)}" autocomplete="off">
      <label class="l">Extra fields for every ${esc(t.name)}</label>
      ${t.fields.map((f,i)=>`<div class="frow" data-i="${i}"><input class="fl" value="${esc(f.label)}" placeholder="Field name"><select class="fk">${FIELD_KINDS.map(([k,n])=>`<option value="${k}" ${f.kind===k?'selected':''}>${n}</option>`).join('')}</select>${f.kind==='choice'?`<input class="fo" value="${esc(f.options)}" placeholder="Choices, comma separated">`:'<span></span>'}<button class="x" data-fdel="${i}">✕</button></div>`).join('')}
      <div class="starters" style="margin-top:8px"><button class="btn sm" data-fadd="1">＋ Add a field</button><span class="muted small">or quickly:</span>${FIELD_PRESETS.map((f,i)=>`<button class="tdot" data-fpreset="${i}">＋ ${esc(f.label)}</button>`).join('')}</div>
      <div class="pfoot"><button class="btn ghost" data-deltype="1">Delete this category…</button></div></div></div>`;
    }
  }else if(SET.tab==='rels'){
    const r=relById.get(SET.selRel),cnt=new Map();for(const x of derived.edges)cnt.set(x.rel,(cnt.get(x.rel)||0)+1);
    const have=new Set(relations.map(x=>x.name.toLowerCase())),sugg=STARTER_CONNECTIONS.map((c,i)=>[c,i]).filter(([c])=>!have.has(c.name));
    const side=`<div class="side" id="set-side">${relations.map(x=>`<button class="rchip ${r&&x.id===r.id?'on':''}" data-selrel="${esc(x.id)}" style="--c:${x.color};${r&&x.id===r.id?'background:rgba(122,162,255,.16)':''}"><i></i>${esc(x.name)}${x.flow?'<span class="tagmini">moves</span>':''}<span class="n">${cnt.get(x.id)||0}</span></button>`).join('')}
      <button class="btn sm" style="margin:10px 8px" data-newrel="1">＋ New connection type</button>
      ${sugg.length?`<div class="muted small" style="margin:12px 8px 4px">Suggestions (one click)</div><div class="starters side">${sugg.map(([c,i])=>`<button class="tdot" data-addrel="${i}">＋ ${esc(c.name)}</button>`).join('')}</div>`:''}</div>`;
    body=`<div class="mb">${side}<div class="scroll"><div class="muted small" style="margin-top:6px">A connection type is a few plain words that join two entries, read as a sentence: <b style="color:var(--ink)">A</b> … <b style="color:var(--ink)">B</b>.</div>
      <label class="l">The words (A … B)</label><input class="f" id="r-name" value="${esc(r.name)}" placeholder="e.g. teaches" autocomplete="off">
      <label class="l">Direction</label><div class="seg2"><button class="${r.sym?'':'on'}" data-rdir="one">One direction</button><button class="${r.sym?'on':''}" data-rdir="both">Same both ways</button></div>
      ${r.sym?'':`<label class="l">Seen from the other side (B … A)</label><input class="f" id="r-inv" value="${esc(r.inverse)}" placeholder="e.g. is taught by" autocomplete="off">`}
      <div class="preview">${relPreview(r)}</div>
      <div class="opts"><label class="chk"><input type="checkbox" id="r-flow" ${r.flow?'checked':''}> Something moves along it (information, money, work, items…). Adds “what moves, how, how often” fields, little moving dots on the map, and the “Where it leads / Where it comes from” buttons.</label></div>
      <label class="l">Colour</label>${swatchesHTML(r.color,'data-rcolor')}
      <div class="pfoot"><button class="btn ghost" data-delrel="1" ${r.id==='related'?'disabled style="opacity:.4" title="This one is always kept"':''}>Delete this connection type…</button></div></div></div>`;
  }else if(SET.tab==='views'){
    const v=lenses.find(x=>x.id===SET.selView);
    const side=`<div class="side" id="set-side">${lenses.map(x=>`<button class="lchip ${v&&x.id===v.id?'on':''}" data-selview="${esc(x.id)}">${esc(x.name)}${activeLens===x.id?'<span class="tagmini">showing</span>':''}</button>`).join('')}
      <button class="btn sm" style="margin:10px 8px" data-newview="1">＋ New view</button>
      <div class="muted small" style="margin:10px 8px">“Everything” and “Starred only” are built in. A view remembers which categories, connection types and entries to show. Switch views from the list on the left of the map.</div></div>`;
    if(!v){
      body=`<div class="mb">${side}<div class="scroll"><div class="empty">No views of your own yet.<br><br>A view is a saved way of looking at your map, such as “Only people” or “Only high priority”. Make one with “New view”, or set the filters on the map first and press ＋ next to Views.</div></div></div>`;
    }else{
      const ck=(id,attr,checked,text,color)=>`<label class="chk"><input type="checkbox" id="${id}" ${attr} ${checked?'checked':''}> ${color?`<i class="dot" style="--c:${color}"></i>`:''}${text}</label>`;
      body=`<div class="mb">${side}<div class="scroll"><label class="l" style="margin-top:6px">View name</label><input class="f" id="v-name" value="${esc(v.name)}" autocomplete="off">
      <label class="l">Categories to show</label>
      <div class="opts vlist">${types.length?types.map(t=>ck('vt-'+t.id,`data-vtype="${esc(t.id)}"`,!v.hiddenTypes.includes(t.id),esc(t.name),t.color)).join(''):'<span class="muted small">No categories yet.</span>'}</div>
      <label class="l">Connections to show</label>
      <div class="opts vlist">${relations.map(r=>ck('vr-'+r.id,`data-vrel="${esc(r.id)}"`,!v.hiddenRels.includes(r.id),esc(r.name),r.color)).join('')}${ck('v-mentions','data-vmentions="1"',v.mentions,'connections found in the text (mentions)','#afbeeb')}</div>
      <label class="l">Filters</label>
      <div class="opts">${ck('v-star','data-vstar="1"',v.starred,'Only starred entries')}</div>
      <div class="two"><div><label class="l" for="v-imp">Importance at least</label><select class="f" id="v-imp">${IMPORTANCE.map((n,i)=>`<option value="${i}" ${v.minImp===i?'selected':''}>${n}</option>`).join('')}</select></div>
      <div><label class="l" for="v-tags">Only entries tagged <span class="muted" style="text-transform:none;letter-spacing:0">(comma separated)</span></label><input class="f" id="v-tags" value="${esc(v.tags.join(', '))}" placeholder="any tag" autocomplete="off"></div></div>
      <div class="pfoot"><button class="btn primary" data-vshow="1">Show this view now</button><button class="btn ghost" data-vdel="1">Delete this view…</button></div></div></div>`;
    }
  }else if(SET.tab==='data'){
    body=`<div class="mb"><div class="scroll dtab">
      <div class="card"><h4>Your file</h4>
        <p><b>${esc(store.name||'')}.orbweave</b><br><code>${esc(store.file||'')}</code></p>
        <p class="muted" style="font-size:13px">Everything, including pictures, is in this one file and saves automatically. Orbweave keeps dated backups (at most one every 10 minutes, newest 40) in a folder named <code>${esc(store.name||'')}.backups</code> next to it. To use the same file on a PC and a Mac, keep it in OneDrive, iCloud Drive, Dropbox or on a USB drive and open it from either computer, one at a time. If the file changes while Orbweave is open, it reloads it, or asks which version to keep if you have unsaved edits.</p>
        <div class="btnrow"><button class="btn" data-d="saveas">Save as…</button><button class="btn" data-d="open">Open another file…</button><button class="btn" data-d="newfile">New file…</button><button class="btn" data-d="reveal">Show in folder</button></div></div>
      <div class="card"><h4>Password</h4>
        <p class="muted" style="font-size:13px;margin-top:0">${store.encrypted?'This file is encrypted (AES-256-GCM). The password is asked every time it is opened.':'This file is not encrypted. Anyone who can open the file with Orbweave can read it. A password encrypts the whole file, including pictures.'}</p>
        <div class="btnrow"><button class="btn" data-d="password">${store.encrypted?'Change or remove password…':'Set a password…'}</button></div></div>
      <div class="card"><h4>Export</h4><div class="btnrow">
        <button class="btn" data-d="csv1">Entries (.csv)</button><button class="btn" data-d="csv2">Connections (.csv)</button><button class="btn" data-d="png">Map as picture (.png)</button></div>
        <p class="muted" style="font-size:12.5px;margin-bottom:0">Exports are plain, unencrypted files with whatever you typed. Store them with the same care as the original.</p></div>
      <div class="card"><h4>Sample map</h4><div class="btnrow"><button class="btn" data-d="sample">Add the sample map</button><button class="btn" data-d="rmsample">Remove sample entries</button></div>
        <p class="muted" style="font-size:12.5px;margin-bottom:0">A small made-up map (a study group and a project) to explore with. It is tagged “sample” so it can be removed cleanly.</p></div>
      <div class="card"><h4>Danger zone</h4><div class="btnrow"><button class="btn" data-d="clear">Delete all entries…</button></div></div></div></div>`;
  }else{
    body=`<div class="mb"><div class="scroll dtab">
      <div class="card"><h4>Tutorial</h4>
        <p class="muted" style="font-size:13px;margin-top:0">A short guided tour on a practice map. It works the same in a new empty file and in a file full of entries. Nothing you do in the tutorial is saved: when it ends, your own map is back exactly as you left it.</p>
        <div class="btnrow"><button class="btn primary" data-d="tour">Start the tutorial</button></div></div>
      <div class="card"><h4>Quick guide</h4><div class="btnrow"><button class="btn" data-d="guide">Open the quick guide</button></div></div>
      <div class="card"><h4>Keyboard shortcuts</h4>
        <p class="muted" style="font-size:13px;margin:0;line-height:1.9"><b style="color:var(--ink)">/</b> or <b style="color:var(--ink)">Ctrl/⌘+K</b> search or add · <b style="color:var(--ink)">E</b> edit the open entry · <b style="color:var(--ink)">S</b> star · <b style="color:var(--ink)">F</b> fit everything · <b style="color:var(--ink)">I</b> switch Map / Index · <b style="color:var(--ink)">Esc</b> close · <b style="color:var(--ink)">Alt+Left / Right</b> back / forward · <b style="color:var(--ink)">Ctrl/⌘+Z</b> undo · <b style="color:var(--ink)">Ctrl/⌘+,</b> settings · <b style="color:var(--ink)">?</b> quick guide</p></div></div></div>`;
  }
  mb.innerHTML=head+body;
}
$('#b-set').onclick=()=>openSettings(SET.tab);
$('#modal').addEventListener('mousedown',ev=>{if(ev.target.id==='modal')closeModal();});
function lensChanged(v){commit();renderHud();if(activeLens===v.id)applyLens(v,{fit:false});}
function rerenderKeepingFocus(){
  const side=$('#set-side'),sc=$('#mbox .scroll');
  const keepSide=side?side.scrollTop:0,cur=sc?sc.scrollTop:0,sel=document.activeElement,selId=sel&&sel.id,pos=sel&&sel.selectionStart;
  renderSettings();
  const sc2=$('#mbox .scroll'),sd2=$('#set-side');if(sc2)sc2.scrollTop=cur;if(sd2)sd2.scrollTop=keepSide;
  if(selId){const n=document.getElementById(selId);if(n){n.focus();try{n.setSelectionRange(pos,pos);}catch(_){}}}
}
$('#modal').addEventListener('input',ev=>{
  const t=ev.target,ty=typeById.get(SET.selType),rl=relById.get(SET.selRel),vw=lenses.find(x=>x.id===SET.selView);
  if(SET.tab==='views'){
    if(!vw)return;
    if(t.id==='v-name')vw.name=t.value||'View';
    else if(t.dataset.vtype){const h=new Set(vw.hiddenTypes);t.checked?h.delete(t.dataset.vtype):h.add(t.dataset.vtype);vw.hiddenTypes=[...h];}
    else if(t.dataset.vrel){const h=new Set(vw.hiddenRels);t.checked?h.delete(t.dataset.vrel):h.add(t.dataset.vrel);vw.hiddenRels=[...h];}
    else if(t.dataset.vmentions)vw.mentions=t.checked;
    else if(t.dataset.vstar)vw.starred=t.checked;
    else if(t.id==='v-imp')vw.minImp=+t.value||0;
    else if(t.id==='v-tags')vw.tags=arr(t.value.split(',')).map(x=>x.toLowerCase());
    else return;
    lensChanged(vw);rerenderKeepingFocus();return;
  }
  if(SET.tab==='types'&&ty){
    if(t.id==='t-name')ty.name=t.value||'Category';
    else if(t.id==='t-glyph')ty.glyph=t.value;
    else if(t.classList.contains('fl'))ty.fields[+t.closest('.frow').dataset.i].label=t.value;
    else if(t.classList.contains('fo'))ty.fields[+t.closest('.frow').dataset.i].options=t.value;
    else if(t.classList.contains('fk')){ty.fields[+t.closest('.frow').dataset.i].kind=t.value;refreshAfterSchema();renderSettings();return;}
    else if(t.dataset.pick==='data-tcolor')ty.color=t.value;
    else return;
    refreshAfterSchema();rerenderKeepingFocus();return;
  }
  if(SET.tab==='rels'&&rl){
    if(t.id==='r-name'){rl.name=t.value||'is related to';if(rl.sym)rl.inverse=rl.name;}
    else if(t.id==='r-inv')rl.inverse=t.value;
    else if(t.id==='r-flow')rl.flow=t.checked;
    else if(t.dataset.pick==='data-rcolor')rl.color=t.value;
    else return;
    derive();refreshAfterSchema();
    if(t.id==='r-inv'||t.id==='r-name'){const pv=$('#mbox .preview');if(pv)pv.innerHTML=relPreview(rl);const side=$('#set-side');if(side&&t.id==='r-name')rerenderKeepingFocus();}
    else rerenderKeepingFocus();
  }
});
$('#modal').addEventListener('click',ev=>{
  const q=s=>ev.target.closest(s);
  if(q('[data-mclose]')){closeModal();return;}
  let b;
  if((b=q('[data-stab]'))){SET.tab=b.dataset.stab;renderSettings();return;}
  if((b=q('[data-seltype]'))){SET.selType=b.dataset.seltype;renderSettings();return;}
  if((b=q('[data-selrel]'))){SET.selRel=b.dataset.selrel;renderSettings();return;}
  if((b=q('[data-selview]'))){SET.selView=b.dataset.selview;renderSettings();return;}
  const ty=typeById.get(SET.selType),rl=relById.get(SET.selRel),vw=lenses.find(x=>x.id===SET.selView);
  /* categories */
  if((b=q('[data-tcolor]'))&&ty){ty.color=b.dataset.tcolor;renderSettings();refreshAfterSchema();return;}
  if((b=q('[data-tshape]'))&&ty){ty.shape=b.dataset.tshape;renderSettings();refreshAfterSchema();return;}
  if(q('[data-newtype]')){askCategory().then(t=>{if(t){SET.selType=t.id;refreshAfterSchema();renderSettings();}});return;}
  if((b=q('[data-addstarter]'))){const t=addCategory(b.dataset.addstarter);SET.selType=t.id;refreshAfterSchema();renderSettings();return;}
  if(q('[data-fadd]')&&ty){ty.fields.push(normField({label:'New field'}));renderSettings();refreshAfterSchema();setTimeout(()=>{const f=$$('#mbox .fl').pop();if(f){f.focus();f.select();}},40);return;}
  if((b=q('[data-fpreset]'))&&ty){ty.fields.push(normField(FIELD_PRESETS[+b.dataset.fpreset]));renderSettings();refreshAfterSchema();return;}
  if((b=q('[data-fdel]'))&&ty){ty.fields.splice(+b.dataset.fdel,1);renderSettings();refreshAfterSchema();return;}
  if(q('[data-deltype]')&&ty){
    const n=entries.filter(e=>e.type===ty.id).length,dest=types.find(x=>x.id!==ty.id);
    if(n&&!dest){toast('This is your only category and it has entries. Make another category first, or delete the entries.',{warn:true,ms:6000});return;}
    if(!confirm(n?`Delete “${ty.name}”? Its ${n} entr${n===1?'y':'ies'} will move to “${dest.name}”.`:`Delete the category “${ty.name}”?`))return;
    for(const e of entries)if(e.type===ty.id)e.type=dest.id;
    types=types.filter(x=>x.id!==ty.id);typeById=new Map(types.map(x=>[x.id,x]));hidden.delete(ty.id);
    if(ix.type===ty.id)ix.type=null;if(lastType===ty.id)lastType='';
    SET.selType=types[0]?types[0].id:null;derive();renderSettings();refreshAfterSchema();return;
  }
  /* connection types */
  if(q('[data-newrel]')){askConnectionType().then(r=>{if(r){SET.selRel=r.id;renderSettings();}});return;}
  if((b=q('[data-addrel]'))){const c=STARTER_CONNECTIONS[+b.dataset.addrel],r=addConnectionType(c.name,c.inverse,{sym:!!c.sym,flow:!!c.flow});SET.selRel=r.id;refreshAfterSchema();renderSettings();return;}
  if((b=q('[data-rdir]'))&&rl){
    if(b.dataset.rdir==='both'){rl.sym=true;rl.inverse=rl.name;}else{rl.sym=false;if(rl.inverse===rl.name)rl.inverse='';}
    derive();renderSettings();refreshAfterSchema();return;
  }
  if((b=q('[data-rcolor]'))&&rl){rl.color=b.dataset.rcolor;derive();renderSettings();refreshAfterSchema();return;}
  if(q('[data-delrel]')&&rl){
    if(rl.id==='related')return;
    const n=derived.edges.filter(x=>x.rel===rl.id).length;
    if(!confirm(n?`Delete “${rl.name}”? Its ${n} connection${n===1?'':'s'} will become “is related to”.`:`Delete “${rl.name}”?`))return;
    for(const e of entries)for(const l of e.links)if(l.rel===rl.id)l.rel='related';
    relations=relations.filter(x=>x.id!==rl.id);relById=new Map(relations.map(x=>[x.id,x]));relOff.delete(rl.id);
    SET.selRel=relations[0].id;derive();renderSettings();refreshAfterSchema();return;
  }
  /* views */
  if(q('[data-newview]')){const v=normLens({name:'New view'});lenses.push(v);SET.selView=v.id;commit();renderHud();renderSettings();setTimeout(()=>{const f=$('#v-name');if(f){f.focus();f.select();}},40);return;}
  if(q('[data-vshow]')&&vw){applyLens(vw);closeModal();return;}
  if(q('[data-vdel]')&&vw){
    if(!confirm(`Delete the view “${vw.name}”? Your entries are not affected.`))return;
    lenses=lenses.filter(x=>x.id!==vw.id);if(activeLens===vw.id)applyLens(BUILTIN_LENSES[0],{fit:false});
    SET.selView=lenses[0]?lenses[0].id:null;commit();renderHud();renderSettings();return;
  }
  if((b=q('[data-d]')))dataAction(b.dataset.d);
});
async function dataAction(a){
  if(a==='guide'){openHelp();return;}
  if(a==='tour'){closeModal();startTutorial();return;}
  if(practice){toast('Not available in the practice map.',{warn:true});return;}
  switch(a){
    case 'saveas':await saveAsCopy();break;
    case 'open':closeModal();menuAction('open');break;
    case 'newfile':closeModal();menuAction('new');break;
    case 'reveal':store.host.reveal();break;
    case 'password':await passwordFlow();break;
    case 'csv1':exportEntriesCSV();break;
    case 'csv2':exportLinksCSV();break;
    case 'png':{closeModal();setView('map');draw(performance.now());cv.toBlob(b=>downloadBlob(b,'orbweave-map-'+stamp()+'.png'));break;}
    case 'sample':loadSample();break;
    case 'rmsample':removeSample();break;
    case 'clear':
      if(confirm('Delete ALL entries in this file? You can undo with Ctrl/⌘+Z right after, or restore from the .backups folder.')){entries=[];reindex();derive();hist=[];hi=-1;clearOverlay();unfocus();commit();updateNav();closeModal();}
      break;
  }
}

/* ---------------- Help ---------------- */
function openHelp(){
  $('#modal').hidden=false;
  $('#mbox').innerHTML=`<div class="mh"><h3>How Orbweave works</h3><button class="x" style="margin-left:auto" data-mclose="1">✕</button></div><div class="scroll"><div class="muted">Everything stays in your .orbweave file on this computer. Orbweave has no network access and no AI.</div><ul>
  <li><b>Add:</b> type a name in the bar at the bottom and choose its category. Or double-click empty space on the map. The first time, it asks you to create a category (Person, Task, Idea… your choice).</li>
  <li><b>Auto-connect:</b> when a description or summary contains another entry’s name, nickname or full name, they link on their own. New entries also pick up older text that already mentions them.</li>
  <li><b>Connect on purpose:</b> open an entry, press edit, and read it as a sentence: <i>Maya</i> [teaches] <i>Calculus</i>. Choose the words, then the other entry. Make your own words from the list or in Settings, no symbols needed.</li>
  <li><b>Categories:</b> Settings → Categories. Each one gets its own colour, shape and extra fields.</li>
  <li><b>Connection types:</b> Settings → Connections. One direction or the same both ways. Tick “something moves along it” to track what moves, how and how often, and to follow it with the “Where it leads / Where it comes from” buttons.</li>
  <li><b>Views:</b> a view saves which categories, connection types and entries to show. Pick one on the left of the map, or build your own in Settings → Views. The ＋ next to Views saves whatever you have filtered right now.</li>
  <li><b>Path to…</b> finds the shortest chain between any two entries.</li>
  <li><b>Index:</b> the Map / Index switch at the top shows an A–Z table of everything, filterable, with CSV export.</li>
  <li><b>Pictures:</b> in Edit → Picture, or drop an image file straight onto a node.</li>
  <li><b>Search:</b> <b>/</b> or <b>Ctrl/⌘+K</b>. Try <b>#tag</b>, <b>type:person</b>, <b>status:done</b>.</li>
  <li><b>Short all-caps names</b> (up to 5 letters, like UX or CPU) only match in capitals, so “ux” in a sentence won’t link. For very common words, tick “Only link when written as @name” on that entry.</li>
  <li><b>Tutorial:</b> Settings → Tutorial & help starts the guided tour again, any time, on a practice map that never touches your file.</li></ul></div>`;
}
$('#b-help').onclick=openHelp;

/* ---------------- command bar ---------------- */
const cmd=$('#cmd'),cmdList=$('#cmdlist');
let cmdRes=[],cmdSel=0;
function cmdUpdate(){
  const q=cmd.value;
  if(!q.trim()){cmdList.hidden=true;cmdList.innerHTML='';searchHL=null;need=true;return;}
  const all=searchEntries(q,{limit:1e9});
  searchHL=new Set(all.map(e=>e.id));cmdRes=all.slice(0,7);
  if(cmdSel>=cmdRes.length)cmdSel=0;
  const f=parseQuery(q),exact=entries.some(o=>o.name.trim().toLowerCase()===q.trim().toLowerCase());
  const canCreate=!exact&&f.text&&!f.tags.length&&!f.type&&!f.status;
  cmdList.innerHTML=cmdRes.map((o,i)=>`<button class="row ${i===cmdSel?'sel':''}" data-i="${i}" style="--c:${nodeColor(o)}"><i class="dot"></i><span>${esc(label(o))}</span><span class="s">${esc(o.full||o.summary||'')}</span><span class="k">${esc(T(o).name)}</span></button>`).join('')+(canCreate?createRow(q.trim(),'mkentry'):'')||'<div class="mk">No match.</div>';
  cmdList.hidden=false;need=true;
}
cmd.addEventListener('input',()=>{cmdSel=0;cmdUpdate();});
cmd.addEventListener('keydown',ev=>{
  if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){
    ev.preventDefault();if(!cmdRes.length)return;
    cmdSel=(cmdSel+(ev.key==='ArrowDown'?1:-1)+cmdRes.length)%cmdRes.length;cmdUpdate();
  }else if(ev.key==='Enter'){
    ev.preventDefault();const q=cmd.value.trim();if(!q)return;
    if(ev.shiftKey||!cmdRes.length){cmdCreate(q,lastType);}
    else{const o=cmdRes[cmdSel];cmdClear();setView('map');focus(o.id);}
  }
});
function cmdClear(){cmd.value='';cmd.blur();cmdUpdate();}
async function cmdCreate(name,type){
  cmdClear();setView('map');
  const e=await newEntry({name,type},{edit:true});
  if(e)setTimeout(()=>{const d=$('#f-sum');if(d)d.focus();},80);
}
cmdList.addEventListener('mousedown',ev=>{
  const m=ev.target.closest('[data-act="mkentry"]'),r=ev.target.closest('.row');
  if(m){ev.preventDefault();cmdCreate(m.dataset.name,m.dataset.type);}
  else if(r){ev.preventDefault();const o=cmdRes[+r.dataset.i];cmdClear();setView('map');focus(o.id);}
});
cmd.addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement!==cmd)cmdList.hidden=true;},120));
cmd.addEventListener('focus',()=>{if(cmd.value.trim())cmdUpdate();});

/* ---------------- keyboard ---------------- */
addEventListener('keydown',ev=>{
  const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
  const mod=ev.ctrlKey||ev.metaKey,k=ev.key;
  if(mod&&k.toLowerCase()==='k'){ev.preventDefault();cmd.focus();cmd.select();return;}
  if(mod&&k===','){ev.preventDefault();openSettings(SET.tab);return;}
  if(k==='Escape'){
    if(tourOn){endTutorial();return;}
    if(!$('#dlg').hidden)return;
    if(!$('#modal').hidden){closeModal();return;}
    if(ev.target===cmd){cmd.value='';cmdUpdate();cmd.blur();return;}
    if(typing){ev.target.blur();return;}
    if(overlay){clearOverlay();return;}
    if(editing){editing=false;derive();renderPanel();return;}
    if(focusId)unfocus();
    return;
  }
  if(typing||!$('#modal').hidden)return;
  if(k==='/'){ev.preventDefault();cmd.focus();return;}
  if(k==='?'){openHelp();return;}
  if(mod&&k.toLowerCase()==='z'){ev.preventDefault();ev.shiftKey?redo():undo();return;}
  if(mod&&k.toLowerCase()==='y'){ev.preventDefault();redo();return;}
  if(ev.altKey&&k==='ArrowLeft'){$('#b-back').click();return;}
  if(ev.altKey&&k==='ArrowRight'){$('#b-fwd').click();return;}
  if(mod||ev.altKey)return;
  const kl=k.toLowerCase();
  if(kl==='f'){clearOverlay();fitAll();}
  else if(kl==='i')setView(viewMode==='map'?'index':'map');
  else if(kl==='e'&&focusId&&!editing){ev.preventDefault();editing=true;renderPanel();}
  else if(kl==='s'&&focusId&&!editing){const e=byId.get(focusId);e.starred=!e.starred;touch(e);recomputeVis();renderPanel();need=true;commit();}
});
addEventListener('visibilitychange',()=>{if(document.hidden)flushNow();});
addEventListener('pagehide',flushNow);

/* ---------------- welcome (empty map) ---------------- */
function updateWelcome(){
  const w=$('#welcome');
  if(entries.length||viewMode!=='map'||tourOn){w.hidden=true;return;}
  w.hidden=false;
  if(!types.length){
    w.innerHTML=`<h2>Your map is empty</h2><p>Orbweave maps anything: people, ideas, projects, courses, tools, and how they connect. First, choose the kinds of things you want to map. You can change this at any time.</p>
      <div class="starters center">${STARTER_CATEGORIES.slice(0,8).map(c=>`<button class="tdot" data-w="cat" data-name="${esc(c.name)}">＋ ${esc(c.name)}</button>`).join('')}<button class="tdot plus" data-w="mycat">＋ My own…</button></div>
      <div class="btns"><button class="btn primary" data-w="tour">Take the tutorial</button><button class="btn" data-w="sample">Add a sample map</button></div>
      <p class="muted small" style="margin:14px 0 0">Or skip this: type a name in the bar below and it will ask for a category.</p>`;
  }else{
    w.innerHTML=`<h2>Add your first entry</h2><p>Type a name in the bar below. Anything you mention by name in a description connects on its own.</p>
      <div class="btns"><button class="btn primary" data-w="tour">Take the tutorial</button><button class="btn" data-w="sample">Add a sample map</button></div>`;
  }
}
$('#welcome').addEventListener('click',ev=>{
  const b=ev.target.closest('[data-w]');if(!b)return;
  const k=b.dataset.w;
  if(k==='tour')startTutorial();
  else if(k==='sample')loadSample();
  else if(k==='cat'){addCategory(b.dataset.name);refreshAfterSchema();updateWelcome();}
  else if(k==='mycat')createCategoryFlow();
});
