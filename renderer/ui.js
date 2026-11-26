'use strict';
/* =====================================================================
   ORBWEAVE ui (part 1): toast, status, HUD, focus, traces, side panel
   ===================================================================== */

/* ---------------- toast / status ---------------- */
let toastT=0;
function toast(msg,{warn=false,ms=3600,actions=[]}={}){
  const el=$('#toast');el.className='glass'+(warn?' warn':'');
  el.innerHTML=`<span>${esc(msg)}</span>`+actions.map((a,i)=>`<button class="btn sm" data-i="${i}">${esc(a.label)}</button>`).join('')+`<button class="x" data-x="1">✕</button>`;
  el.hidden=false;clearTimeout(toastT);if(ms)toastT=setTimeout(()=>{el.hidden=true;},ms);
  el.onclick=ev=>{const b=ev.target.closest('button');if(!b)return;el.hidden=true;if(b.dataset.i!==undefined){const a=actions[+b.dataset.i];if(a)a.fn();}};
}
function setStatus(t,warn){const s=$('#status');s.textContent=t;s.title=t;s.classList.toggle('warn',!!warn);}
$('#status').onclick=()=>{if(store.conflict)showConflict();else persist();};
function showConflict(){
  toast('The data file changed somewhere else while you had unsaved edits.',{warn:true,ms:0,actions:[
    {label:'Load file version',fn:()=>reloadFromDisk(false)},
    {label:'Keep mine and overwrite',fn:()=>{store.conflict=false;persist(true);}}]});
}
function hideConflict(){$('#toast').hidden=true;}
function touch(e){e.updated=Date.now();}
function afterRestore(){
  if(focusId&&!byId.has(focusId))unfocus();else if(focusId)renderPanel();
  renderHud();if(viewMode==='index')renderIndex();reheat(.1);
}

/* ---------------- HUD: categories, views, connection types ---------------- */
const BUILTIN_LENSES=[
  {id:'all',name:'Everything'},
  {id:'star',name:'Starred only',starred:true}
];
const allViews=()=>[...BUILTIN_LENSES,...lenses];
function applyLens(l,{fit=true}={}){
  hidden.clear();relOff.clear();
  (l.hiddenTypes||[]).forEach(t=>hidden.add(t));
  (l.hiddenRels||[]).forEach(r=>relOff.add(r));
  if(l.mentions===false)relOff.add('_mention');
  onlyStarred=!!l.starred;viewMinImp=l.minImp||0;viewTags=(l.tags||[]).slice();
  activeLens=l.id;clearOverlay();recomputeVis();renderHud();reheat(.3);if(fit)fitAll();
}
const isFiltered=()=>hidden.size>0||relOff.size>0||onlyStarred||viewMinImp>0||viewTags.length>0;
function lensFromCurrent(name){
  return normLens({id:uid('v'),name,hiddenTypes:[...hidden],hiddenRels:[...relOff].filter(r=>r!=='_mention'),mentions:!relOff.has('_mention'),starred:onlyStarred,minImp:viewMinImp,tags:viewTags});
}
function renderHud(){
  const cnt=new Map();for(const e of entries)cnt.set(e.type,(cnt.get(e.type)||0)+1);
  $('#counts').innerHTML=`${entries.length} entr${entries.length===1?'y':'ies'} · ${derived.edges.length} connection${derived.edges.length===1?'':'s'}`+(isFiltered()?` · <button class="lnk" data-hud="unfilter">show all</button>`:'');
  $('#h-types').innerHTML=`<div class="hh"><span>Categories</span><button class="x" data-hud="cats" title="Add or edit categories" style="min-width:22px;height:22px;font-size:12px">✎</button></div>`+
    (types.length?types.map(t=>`<button class="fchip ${hidden.has(t.id)?'off':''}" data-k="${esc(t.id)}" style="--c:${t.color}"><i class="dot"></i>${esc(t.name)}<span class="n">${cnt.get(t.id)||0}</span></button>`).join(''):
    `<div class="muted" style="padding:2px 8px 6px;font-size:12px">None yet. Add one when you add your first entry, or <button class="lnk" data-hud="cats">create one now</button>.</div>`);
  $('#h-lens').innerHTML=`<div class="hh"><span>Views</span><button class="x" data-hud="newview" title="Save the current filters as a new view" style="min-width:22px;height:22px;font-size:14px">＋</button></div>`+
    allViews().map(l=>`<button class="lchip ${activeLens===l.id?'on':''}" data-lens="${esc(l.id)}">${esc(l.name)}${lenses.includes(l)?`<span class="x2" data-lensedit="${esc(l.id)}" title="Edit this view">✎</span>`:''}</button>`).join('');
  const rc=new Map();for(const x of derived.edges)rc.set(x.rel,(rc.get(x.rel)||0)+1);
  const rows=relations.filter(r=>rc.get(r.id)).map(r=>`<button class="rchip ${relOff.has(r.id)?'off':''}" data-r="${esc(r.id)}" style="--c:${r.color}"><i></i>${esc(r.name)}<span class="n">${rc.get(r.id)}</span></button>`);
  if(rc.get('_mention'))rows.push(`<button class="rchip ${relOff.has('_mention')?'off':''}" data-r="_mention" style="--c:#afbeeb"><i></i>mentioned in text<span class="n">${rc.get('_mention')}</span></button>`);
  $('#h-rellist').innerHTML=rows.join('')||'<div class="muted" style="padding:4px 8px;font-size:12px">No connections yet.</div>';
  updateWelcome();
}
$('#counts').addEventListener('click',ev=>{if(ev.target.closest('[data-hud="unfilter"]'))applyLens(BUILTIN_LENSES[0]);});
$('#h-types').addEventListener('click',ev=>{
  const h=ev.target.closest('[data-hud]');if(h){openSettings('types');return;}
  const b=ev.target.closest('.fchip');if(!b)return;
  const k=b.dataset.k;hidden.has(k)?hidden.delete(k):hidden.add(k);activeLens=null;recomputeVis();renderHud();reheat(.3);
});
$('#h-lens').addEventListener('click',ev=>{
  if(ev.target.closest('[data-hud="newview"]')){
    const l=lensFromCurrent('New view');lenses.push(l);activeLens=l.id;commit();renderHud();
    openSettings('views',{selectView:l.id,focusName:true});return;
  }
  const ed=ev.target.closest('[data-lensedit]');
  if(ed){ev.stopPropagation();openSettings('views',{selectView:ed.dataset.lensedit});return;}
  const b=ev.target.closest('[data-lens]');if(!b)return;
  const l=allViews().find(x=>x.id===b.dataset.lens);if(l)applyLens(l);
});
$('#h-rellist').addEventListener('click',ev=>{
  const b=ev.target.closest('.rchip');if(!b)return;
  const r=b.dataset.r;relOff.has(r)?relOff.delete(r):relOff.add(r);activeLens=null;recomputeVis();renderHud();reheat(.3);
});

/* ---------------- focus / history / overlay ---------------- */
let hist=[],hi=-1,pathMode=false;
function focus(id,{push=true,edit=false,fly=true}={}){
  if(!byId.has(id))return;
  focusId=id;editing=edit;pathMode=false;
  if(overlay&&!overlay.nodes.has(id))clearOverlay();
  if(push){hist=hist.slice(0,hi+1);if(hist[hist.length-1]!==id)hist.push(id);hi=hist.length-1;}
  $('#panel').classList.add('open');document.body.classList.add('panel');
  recomputeVis();renderPanel();if(fly)flyToFocus();updateNav();need=true;
}
function unfocus(){
  focusId=null;editing=false;pathMode=false;
  $('#panel').classList.remove('open');document.body.classList.remove('panel');recomputeVis();need=true;
}
function updateNav(){$('#b-back').disabled=hi<=0;$('#b-fwd').disabled=hi>=hist.length-1;}
$('#b-back').onclick=()=>{if(hi>0){hi--;focus(hist[hi],{push:false});}};
$('#b-fwd').onclick=()=>{if(hi<hist.length-1){hi++;focus(hist[hi],{push:false});}};
$('#b-fit').onclick=()=>{clearOverlay();fitAll();};

function setOverlay(o){overlay=o;renderOvl();flyToSet(o.nodes);need=true;}
function clearOverlay(){if(!overlay)return;overlay=null;renderOvl();need=true;}
function renderOvl(){
  const el=$('#ovl');if(!overlay){el.hidden=true;return;}
  el.hidden=false;
  el.innerHTML=`<span>${overlay.title}</span>${overlay.steps?`<span class="steps">${overlay.steps}</span>`:''}<button class="x" data-ovx="1" title="Clear (Esc)">✕</button>`;
}
$('#ovl').addEventListener('click',ev=>{if(ev.target.closest('[data-ovx]'))clearOverlay();});
function runTrace(kind,id,otherId){
  const e=byId.get(id);if(!e)return;
  if(kind==='out'||kind==='in'){
    const r=traceFlow(id,kind);
    if(r.count===0){toast(kind==='out'?`Nothing moves onward from ${label(e)} yet. Use a connection type with “something moves along it” ticked.`:`Nothing moves into ${label(e)} yet.`);return;}
    setOverlay({nodes:r.nodes,edges:r.edges,title:`${kind==='out'?'Where':'What leads to'} <b>${esc(label(e))}</b> ${kind==='out'?'leads':''} · ${r.count} ${r.count===1?'entry':'entries'}`});
  }else{
    const o=byId.get(otherId),p=o&&tracePath(id,otherId);
    if(!p){toast(`No visible path between ${label(e)} and ${o?label(o):'that entry'}.`,{warn:true});return;}
    setOverlay({nodes:p.nodes,edges:p.edges,title:`Path · ${p.order.length-1} step${p.order.length===2?'':'s'}`,steps:p.order.map(i=>esc(label(byId.get(i)))).join(' → ')});
  }
}

/* ---------------- entries: create / delete / link / image ---------------- */
function addEntry(o,{focus:doFocus=true,edit=false}={}){
  const e=mk(o);
  entries.push(e);byId.set(e.id,e);
  if(e.type&&!typeById.has(e.type))e.type=types[0]?types[0].id:'';
  derive();
  if(!Number.isFinite(e.x)){
    const nb=[...derived.adj.get(e.id)].map(i=>byId.get(i));
    if(nb.length){e.x=nb.reduce((s,n)=>s+n.x,0)/nb.length+(Math.random()-.5)*90;e.y=nb.reduce((s,n)=>s+n.y,0)/nb.length+(Math.random()-.5)*90;}
    else{e.x=cam.x+(Math.random()-.5)*160;e.y=cam.y+(Math.random()-.5)*160;}
  }
  lastType=e.type;reheat(.8);commit();
  if(doFocus)focus(e.id,{edit});
  return e;
}
/* a category is needed before an entry can exist: ask for one the first time */
async function askCategory(title='New category',msg='What kind of thing is it? Pick a suggestion or type your own name.'){
  const have=new Set(types.map(t=>t.name.toLowerCase()));
  const chips=STARTER_CATEGORIES.filter(c=>!have.has(c.name.toLowerCase())).map((c,i)=>`<button class="tdot" data-fill='${esc(JSON.stringify({t:c.name}))}' data-press="ok" style="--c:${PALETTE[(i*5+3)%PALETTE.length]}"><i></i>${esc(c.name)}</button>`).join('');
  const r=await showDlg({title,msg:esc(msg),fields:[{id:'t',label:'Category name',placeholder:'e.g. Person, Course, Recipe'}],extra:chips?`<div class="starters">${chips}</div>`:'',
    buttons:[{id:'cancel',label:'Cancel'},{id:'ok',label:'Create',primary:true,check:v=>v.t.trim()?'':'Type a name, or pick one above.'}]});
  if(!r)return null;
  const nm=r.values.t.trim(),ex=types.find(t=>t.name.toLowerCase()===nm.toLowerCase());
  return ex||addCategory(nm);
}
async function createCategoryFlow(title,msg){
  const t=await askCategory(title,msg);
  if(t){lastType=t.id;refreshAfterSchema();}
  return t;
}
async function ensureType(id){
  if(id&&typeById.has(id))return id;
  if(lastType&&typeById.has(lastType))return lastType;
  if(types.length)return types[0].id;
  const t=await createCategoryFlow('Create your first category','Categories say what kind of thing an entry is (a person, a task, an idea…). Pick one to begin. You can add more at any time.');
  return t?t.id:null;
}
async function newEntry(o,opts){
  if(o.type==='__new'){const t=await createCategoryFlow();if(!t)return null;o.type=t.id;}
  else{const id=await ensureType(o.type);if(id===null)return null;o.type=id;}
  return addEntry(o,opts);
}
async function askConnectionType(){
  const have=new Set(relations.map(r=>r.name.toLowerCase()));
  const chips=STARTER_CONNECTIONS.filter(c=>!have.has(c.name)).map((c,i)=>`<button class="tdot" data-fill='${esc(JSON.stringify({a:c.name,b:c.sym?'':c.inverse}))}' data-press="${c.sym?'both':'one'}" style="--c:${PALETTE[(i*3+1)%PALETTE.length]}">${esc(c.name)}${c.sym?'':' / '+esc(c.inverse)}</button>`).join('');
  const need=v=>v.a.trim()?'':'Type the words that join the two entries.';
  const r=await showDlg({title:'New connection type',msg:'Say it in plain words, as a sentence: <b>A</b> … <b>B</b>. Example: “Maya <b>teaches</b> Calculus”.',
    fields:[{id:'a',label:'A … B',placeholder:'e.g. teaches'},{id:'b',label:'From B’s side: B … A (leave empty if it reads the same)',placeholder:'e.g. is taught by'}],
    extra:chips?`<div class="starters">${chips}</div>`:'',
    buttons:[{id:'cancel',label:'Cancel'},{id:'both',label:'Same both ways',check:need},{id:'one',label:'Create',primary:true,check:need}]});
  if(!r)return null;
  const a=r.values.a.trim(),b=r.values.b.trim(),pre=STARTER_CONNECTIONS.find(c=>c.name===a);
  const sym=r.button==='both'||(!b&&!!(pre&&pre.sym));
  const rel=addConnectionType(a,b,{sym,flow:!!(pre&&pre.flow)});
  refreshAfterSchema();
  return rel;
}
function deleteEntry(id){
  entries=entries.filter(x=>x.id!==id);
  for(const o of entries)o.links=o.links.filter(l=>l.to!==id);
  byId=new Map(entries.map(e=>[e.id,e]));
  hist=hist.filter(h=>h!==id);hi=Math.min(hi,hist.length-1);
  derive();clearOverlay();unfocus();updateNav();commit();
}
function addLink(fromId,toId,relId){
  const o=byId.get(fromId);if(!o||fromId===toId)return false;
  if(o.links.some(l=>l.to===toId&&l.rel===relId))return false;
  o.links.push({id:uid('l'),to:toId,rel:relId,note:'',data:'',method:'',freq:''});touch(o);
  derive();reheat(.5);commit();return true;
}
async function setNodeImage(e,file){
  try{
    toast('Adding picture…',{ms:1500});
    e.image=await storeImage(file);touch(e);derive();need=true;
    if(focusId===e.id)renderPanel();commit();toast('Picture added.');
  }catch(err){toast(err.message||'Could not add that picture.',{warn:true});}
}
$('#file-img').addEventListener('change',ev=>{const f=ev.target.files[0];ev.target.value='';const e=byId.get(focusId);if(f&&e)setNodeImage(e,f);});
addEventListener('paste',ev=>{
  if(!focusId||!editing)return;
  const it=[...(ev.clipboardData&&ev.clipboardData.items||[])].find(i=>i.type.startsWith('image/'));
  if(it){ev.preventDefault();setNodeImage(byId.get(focusId),it.getAsFile());}
});

/* ---------------- side panel: read view ---------------- */
function mentionHTML(text,selfId){
  let out='',i=0;
  for(const m of findMatches(text,selfId)){
    const t=byId.get(m.id);
    out+=esc(text.slice(i,m.s))+`<a class="ref" data-act="goto" data-id="${m.id}" style="--c:${nodeColor(t)}">${esc(text.slice(m.s,m.e))}</a>`;i=m.e;
  }
  return out+esc(text.slice(i));
}
const chipHTML=(o,extra='')=>`<button class="chip" data-act="goto" data-id="${o.id}" style="--c:${nodeColor(o)}"><i class="dot"></i>${esc(label(o))}${extra}</button>`;
function connGroups(e){
  const groups=new Map();
  for(const x of derived.edges){
    if(x.kind!=='link')continue;
    let other,phrase,dir;const r=R(x.rel);
    if(x.a===e.id){other=byId.get(x.b);phrase=r.name;dir='f';}
    else if(x.b===e.id){other=byId.get(x.a);phrase=invName(r);dir=r.sym?'f':'r';}
    else continue;
    const key=r.id+'|'+dir;
    if(!groups.has(key))groups.set(key,{r,phrase,items:[]});
    groups.get(key).items.push({o:other,x});
  }
  const ord=new Map(relations.map((r,i)=>[r.id,i]));
  return [...groups.entries()].sort((a,b)=>ord.get(a[1].r.id)-ord.get(b[1].r.id)||a[0].localeCompare(b[0])).map(g=>g[1]);
}
const linkDetail=x=>[x.data,x.method,x.freq].filter(Boolean).join(' · ')+(x.note?(x.data||x.method||x.freq?' — ':'')+x.note:'');
function factsHTML(e){
  const rows=[],t=T(e);
  const add=(k,v)=>{if(v!==''&&v!=null)rows.push(`<div class="fk">${esc(k)}</div><div class="fv">${v}</div>`);};
  add('Importance',e.importance?IMPORTANCE[e.importance]:'');
  add('Privacy',esc(e.classification));
  add('Where',esc(e.where));
  add('Contact',esc(e.contact).replace(/\n/g,'<br>'));
  for(const f of t.fields){const v=e.custom[f.key];if(v)add(f.label,esc(v).replace(/\n/g,'<br>'));}
  add('Source',esc(e.source));
  add('Last reviewed',esc(e.reviewed));
  return rows.length?`<h4>Details</h4><div class="facts">${rows.join('')}</div>`:'';
}
function readHTML(e){
  const t=T(e),u=imgURL(e.image);
  const groups=connGroups(e);
  const hasFlowOut=derived.ed.get(e.id).some(x=>x.flow&&x.vis&&(x.a===e.id||x.sym)),hasFlowIn=derived.ed.get(e.id).some(x=>x.flow&&x.vis&&(x.b===e.id||x.sym));
  const ments=[...e.mentionIds].map(i=>byId.get(i)).filter(Boolean);
  const by=entries.filter(o=>o.id!==e.id&&o.mentionIds.has(e.id));
  const pr=possiblyRelated(e);
  const badges=[];
  if(e.status){const sc=statusClass(e);badges.push(`<span class="badge ${sc}">${esc(e.status)}</span>`);}
  if(e.conf==='verified')badges.push('<span class="badge ok">✓ Verified</span>');
  if(e.conf==='unsure')badges.push('<span class="badge warn">? Not sure yet</span>');
  if(e.classification)badges.push(`<span class="badge">${esc(e.classification)}</span>`);
  const conns=groups.map(g=>`<h5 style="--c:${g.r.color}"><i></i>${esc(g.phrase)}</h5>`+g.items.map(({o,x})=>`<button class="cl" data-act="goto" data-id="${o.id}" style="--c:${nodeColor(o)}"><i class="dot"></i><span>${esc(label(o))}</span><span class="lab">${esc(linkDetail(x))}</span></button>`).join('')).join('');
  return `${u?`<div class="cover" style="background-image:url('${esc(u).replace(/'/g,'%27')}')"></div>`:''}
  <div class="ptop"><span class="pill" style="--c:${t.color}"><i></i>${esc(t.name)}</span>
    <span class="pact"><button class="x ${e.starred?'on':''}" data-act="star" title="${e.starred?'Remove from my collection':'Add to my collection'} (S)">${e.starred?'★':'☆'}</button><button class="x" data-act="edit" title="Edit (E)">✎</button><button class="x" data-act="close" aria-label="Close">✕</button></span></div>
  <h2 class="nm">${esc(label(e))}</h2>
  ${e.full?`<div class="full">${esc(e.full)}</div>`:''}
  ${e.aliases.length?`<div class="alias">Also called: ${esc(e.aliases.join(', '))}</div>`:''}
  ${badges.length?`<div class="badges">${badges.join('')}</div>`:''}
  ${e.summary?`<div class="summary">${mentionHTML(e.summary,e.id)}</div>`:''}
  <div class="desc">${e.desc.trim()?mentionHTML(e.desc,e.id):(e.summary?'':'<span class="muted">No description yet. Press the pencil (or E) to add one.</span>')}</div>
  <div class="tracebar">
    ${hasFlowOut?'<button class="btn sm" data-act="trace-out" title="Follow everything that moves onward from here">Where it leads</button>':''}
    ${hasFlowIn?'<button class="btn sm" data-act="trace-in" title="Follow everything that moves into here">Where it comes from</button>':''}
    <button class="btn sm" data-act="trace-path" title="Find the shortest chain between two entries">Path to…</button></div>
  ${pathMode?'<div class="relpick"><input class="f" id="f-path" placeholder="Find the path to… (type a name)" autocomplete="off"><div id="pathlist" class="ac" hidden></div></div>':''}
  ${factsHTML(e)}
  ${conns?`<h4>Connections</h4>${conns}`:''}
  ${e.urls.length?`<h4>Links</h4>${e.urls.map(l=>isUrl(l.url)?`<div><a class="ext" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label||l.url)}</a></div>`:`<div>${esc(l.label?l.label+': ':'')}${esc(l.url)}</div>`).join('')}`:''}
  ${ments.length?`<h4>Mentions</h4><div class="chips">${ments.map(o=>chipHTML(o)).join('')}</div>`:''}
  ${by.length?`<h4>Mentioned in</h4><div class="chips">${by.map(o=>chipHTML(o)).join('')}</div>`:''}
  ${pr.length?`<h4>You may also want to look at</h4><div class="chips">${pr.map(([c,o])=>chipHTML(o,`<span class="cnt">${c} shared</span>`)).join('')}</div>`:''}
  ${e.tags.length?`<h4>Tags</h4><div class="chips">${e.tags.map(x=>`<button class="tag" data-act="tag" data-tag="${esc(x)}">#${esc(x)}</button>`).join('')}</div>`:''}
  <div class="metaline">Added ${esc(ago(e.created))} · edited ${esc(ago(e.updated))}</div>
  <div class="pfoot"><button class="btn primary" data-act="edit">Edit</button></div>`;
}

/* ---------------- side panel: edit view ---------------- */
const secOpen=new Set(['basics','desc','conn']);
const sec=(id,title,hint,body)=>`<details class="sec" data-sec="${id}" ${secOpen.has(id)?'open':''}><summary>${title}${hint?`<span class="hint">${hint}</span>`:''}</summary>${body}</details>`;
function relOptions(sel){
  const o=relations.map(r=>`<option value="${esc(r.id)}|f" ${sel===r.id+'|f'?'selected':''}>${esc(r.name)}</option>`+(r.sym?'':`<option value="${esc(r.id)}|r" ${sel===r.id+'|r'?'selected':''}>${esc(invName(r))}</option>`)).join('');
  return o+'<option value="__new|">＋ Make a new connection type…</option>';
}
function lrowsHTML(e){
  const rows=[];
  for(const x of derived.edges){
    if(x.kind!=='link'||(x.a!==e.id&&x.b!==e.id))continue;
    const out=x.a===e.id,other=byId.get(out?x.b:x.a),r=R(x.rel);
    const opts=relations.map(rr=>{const nm=out?rr.name:invName(rr);return `<option value="${esc(rr.id)}" ${rr.id===x.rel?'selected':''}>${esc(nm)}</option>`;}).join('');
    const det=r.flow;
    rows.push(`<div class="lrow"><div class="top"><select class="lrel" data-lid="${x.id}" title="Relationship">${opts}</select>
      <button class="cn" data-act="goto" data-id="${other.id}" style="--c:${nodeColor(other)}"><i class="dot"></i>${esc(label(other))}</button>
      <button class="x" data-act="lunlink" data-lid="${x.id}" title="Remove this connection">✕</button></div>
      <div class="ldet">
        ${det?`<input class="lf wide" data-lid="${x.id}" data-f="data" placeholder="What moves along it? (information, money, work…)" value="${esc(x.data)}">
        <input class="lf" data-lid="${x.id}" data-f="method" list="dl-method" placeholder="How? (email, by hand…)" value="${esc(x.method)}">
        <input class="lf" data-lid="${x.id}" data-f="freq" list="dl-freq" placeholder="How often?" value="${esc(x.freq)}">`:''}
        <input class="lf wide" data-lid="${x.id}" data-f="note" placeholder="Note about this connection (optional)" value="${esc(x.note)}"></div></div>`);
  }
  return rows.join('')||'<div class="muted" style="font-size:13px">None yet. Anything mentioned in the description connects on its own; use the boxes below for the rest.</div>';
}
function cfHTML(f,v,t){
  const val=esc(v||'');
  if(f.kind==='longtext')return `<textarea class="f cf sm" data-key="${esc(f.key)}">${val}</textarea>`;
  if(f.kind==='date')return `<input class="f cf" type="date" data-key="${esc(f.key)}" value="${val}">`;
  if(f.kind==='number')return `<input class="f cf" type="number" data-key="${esc(f.key)}" value="${val}">`;
  if(f.kind==='choice'){
    const id='dl-'+t.id+'-'+f.key;
    return `<input class="f cf" data-key="${esc(f.key)}" list="${esc(id)}" value="${val}" autocomplete="off"><datalist id="${esc(id)}">${f.options.split(',').map(s=>s.trim()).filter(Boolean).map(o=>`<option value="${esc(o)}">`).join('')}</datalist>`;
  }
  return `<input class="f cf" data-key="${esc(f.key)}" value="${val}" autocomplete="off">`;
}
function editHTML(e){
  const t=T(e),u=imgURL(e.image);
  const basics=`<label class="l">What is it?</label>
    <div class="typerow">${types.length?'':'<span class="muted" style="font-size:13px">No categories yet.</span>'}${types.map(k=>`<button class="tchip ${e.type===k.id?'on':''}" data-act="settype" data-type="${esc(k.id)}" style="--c:${k.color}"><i></i>${esc(k.name)}</button>`).join('')}<button class="tchip plus" data-act="newtype">＋ New category</button></div>
    <label class="l" for="f-name">Name or abbreviation</label><input class="f" id="f-name" value="${esc(e.name)}" placeholder="e.g. Calculus, Maya, Q3 report" autocomplete="off">
    <label class="l" for="f-full">Full name / what it stands for</label><input class="f" id="f-full" value="${esc(e.full)}" placeholder="e.g. a longer or formal name (optional)" autocomplete="off">
    <label class="l" for="f-alias">Other names <span class="muted" style="text-transform:none;letter-spacing:0">(comma separated)</span></label><input class="f" id="f-alias" value="${esc(e.aliases.join(', '))}" autocomplete="off">
    <label class="l" for="f-sum">One-line summary</label><input class="f" id="f-sum" maxlength="200" value="${esc(e.summary)}" placeholder="What it is, in one sentence" autocomplete="off">`;
  const desc=`<div class="rel" style="margin-top:6px"><textarea class="f" id="f-desc" rows="7" spellcheck="false" placeholder="Anything else. Mention other entries by name and they connect automatically.">${esc(e.desc)}</textarea><div id="ac" class="ac" hidden></div></div><div id="autolinks" style="margin-top:8px"></div>`;
  const conn=`<div id="conns">${lrowsHTML(e)}</div>
    <label class="l">Add a connection: read it as a sentence</label>
    <div class="sentence"><span class="subj" style="--c:${t.color}"><i class="dot"></i>${esc(label(e))}</span>
      <select class="f" id="f-rel" aria-label="How they connect">${relOptions(lastRelSel)}</select>
      <div class="rel"><input class="f" id="f-conn" placeholder="…what or who? Search, or type a new name" autocomplete="off"><div id="connlist" class="ac" hidden></div></div></div>`;
  const details=`<div class="two"><div><label class="l" for="f-status">Status</label><input class="f" id="f-status" list="dl-status" value="${esc(e.status)}" autocomplete="off"></div>
    <div><label class="l" for="f-conf">How sure are you?</label><select class="f" id="f-conf"><option value="">—</option><option value="verified" ${e.conf==='verified'?'selected':''}>Verified</option><option value="unsure" ${e.conf==='unsure'?'selected':''}>Not sure yet</option></select></div>
    <div><label class="l" for="f-imp">Importance</label><select class="f" id="f-imp">${IMPORTANCE.map((n,i)=>`<option value="${i}" ${e.importance===i?'selected':''}>${n}</option>`).join('')}</select></div>
    <div><label class="l" for="f-class">Privacy label</label><input class="f" id="f-class" list="dl-class" value="${esc(e.classification)}" autocomplete="off"></div></div>
    <label class="l" for="f-where">Where (place, folder, shelf, address)</label><input class="f" id="f-where" value="${esc(e.where)}" autocomplete="off">
    <label class="l" for="f-contact">Contact</label><textarea class="f sm" id="f-contact" placeholder="Email, phone, handle…">${esc(e.contact)}</textarea>
    <div class="two"><div><label class="l" for="f-source">Where did you learn this?</label><input class="f" id="f-source" value="${esc(e.source)}" autocomplete="off"></div>
    <div><label class="l" for="f-rev">Last reviewed</label><input class="f" id="f-rev" type="date" value="${esc(e.reviewed)}"></div></div>
    <label class="l">Links (web page, file, folder…)</label>
    ${e.urls.map((l,i)=>`<div class="urlrow"><input class="u-label" data-i="${i}" placeholder="Label" value="${esc(l.label)}"><input class="u-url" data-i="${i}" placeholder="https://…" value="${esc(l.url)}"><button class="x" data-act="urldel" data-i="${i}">✕</button></div>`).join('')}
    <button class="btn sm" data-act="urladd">＋ Add a link</button>`;
  const custom=t.fields.length?t.fields.map(f=>`<label class="l">${esc(f.label)}</label>${cfHTML(f,e.custom[f.key],t)}`).join(''):'<div class="muted" style="font-size:13px">This category has no extra fields. Add some in Settings, under Categories.</div>';
  const image=`<div class="imgbox" id="imgbox">${u?`<img src="${esc(u)}" alt="">`:'Drop a picture here, paste one (Ctrl/⌘+V), or choose a file'}</div>
    <div class="pfoot" style="margin-top:8px"><button class="btn sm" data-act="imgpick">Choose picture…</button>${u?'<button class="btn sm ghost" data-act="imgdel">Remove picture</button>':''}</div>`;
  const misc=`<label class="l" for="f-tags">Tags <span class="muted" style="text-transform:none;letter-spacing:0">(comma separated)</span></label><input class="f" id="f-tags" value="${esc(e.tags.join(', '))}" autocomplete="off">
    <div class="opts"><label class="chk"><input type="checkbox" id="f-noauto" ${e.noauto?'checked':''}> Only link when written as @name (for common words)</label>
    <label class="chk"><input type="checkbox" id="f-pin" ${e.pinned?'checked':''}> Pin position on the map</label></div>`;
  return `<div class="ptop"><span class="pill" style="--c:${t.color}"><i></i>Editing</span><button class="btn primary" data-act="done">Done</button></div>
  ${sec('basics','Basics','',basics)}${sec('desc','Description','type @ to insert an entry',desc)}${sec('conn','Connections','',conn)}
  ${sec('details','Details','status, contact, sources',details)}${sec('custom',esc(t.name)+' fields','',custom)}${sec('image','Picture','optional',image)}${sec('misc','Tags & options','',misc)}
  <div class="pfoot"><button class="btn ghost" data-act="del">Delete entry</button></div>`;
}
function renderPanel(){
  const e=byId.get(focusId);if(!e){unfocus();return;}
  const body=$('#pbody'),st=body.scrollTop;
  body.innerHTML=editing?editHTML(e):readHTML(e);
  body.scrollTop=st;
  if(editing){updateAutolinks(e);setupImgDrop();}
  else if(pathMode){const f=$('#f-path');if(f)f.focus();}
}
function updateAutolinks(e){
  const box=$('#autolinks');if(!box)return;
  const m=[...e.mentionIds].map(i=>byId.get(i)).filter(Boolean);
  box.innerHTML=m.length?`<div class="muted" style="font-size:11.5px;margin-bottom:5px">Auto-linked from the text:</div><div class="chips">${m.map(o=>chipHTML(o)).join('')}</div>`:'';
}
function setupImgDrop(){
  const b=$('#imgbox');if(!b)return;
  b.addEventListener('dragover',ev=>{ev.preventDefault();b.classList.add('drag');});
  b.addEventListener('dragleave',()=>b.classList.remove('drag'));
  b.addEventListener('drop',ev=>{ev.preventDefault();b.classList.remove('drag');const f=ev.dataTransfer.files[0];if(f)setNodeImage(byId.get(focusId),f);});
}
let dT=0;
function changedSoon(e){
  clearTimeout(dT);
  dT=setTimeout(()=>{derive();if(editing&&e&&byId.has(e.id))updateAutolinks(e);reheat(.5);commit();},240);need=true;
}
const panelEl=$('#pbody');
panelEl.addEventListener('toggle',ev=>{const d=ev.target;if(d.dataset&&d.dataset.sec){d.open?secOpen.add(d.dataset.sec):secOpen.delete(d.dataset.sec);}},true);
function findLink(lid){for(const o of entries){const l=o.links.find(x=>x.id===lid);if(l)return {owner:o,link:l};}return null;}
panelEl.addEventListener('input',ev=>{
  const e=byId.get(focusId),t=ev.target;
  if(t.id==='f-path'){pathUpdate(t.value);return;}
  if(!e||!editing)return;
  const id=t.id;
  if(id==='f-name')e.name=t.value;
  else if(id==='f-full')e.full=t.value;
  else if(id==='f-alias')e.aliases=arr(t.value.split(','));
  else if(id==='f-sum')e.summary=t.value;
  else if(id==='f-desc'){e.desc=t.value;acUpdate(t,e);}
  else if(id==='f-tags')e.tags=arr(t.value.split(','));
  else if(id==='f-noauto')e.noauto=t.checked;
  else if(id==='f-pin')e.pinned=t.checked;
  else if(id==='f-status')e.status=t.value;
  else if(id==='f-conf')e.conf=t.value;
  else if(id==='f-imp'){e.importance=+t.value;}
  else if(id==='f-class')e.classification=t.value;
  else if(id==='f-where')e.where=t.value;
  else if(id==='f-contact')e.contact=t.value;
  else if(id==='f-source')e.source=t.value;
  else if(id==='f-rev')e.reviewed=t.value;
  else if(id==='f-rel'){
    if(t.value==='__new|'){askConnectionType().then(r=>{if(r)lastRelSel=r.id+'|f';renderPanel();});return;}
    lastRelSel=t.value;return;}
  else if(id==='f-conn'){connUpdate(t.value);return;}
  else if(t.classList.contains('cf'))e.custom[t.dataset.key]=t.value;
  else if(t.classList.contains('u-label')){e.urls[+t.dataset.i].label=t.value;}
  else if(t.classList.contains('u-url')){e.urls[+t.dataset.i].url=t.value;}
  else if(t.classList.contains('lrel')){const f=findLink(t.dataset.lid);if(f){f.link.rel=t.value;touch(f.owner);derive();renderPanel();commit();}return;}
  else if(t.classList.contains('lf')){const f=findLink(t.dataset.lid);if(f){f.link[t.dataset.f]=t.value;touch(f.owner);}}
  else return;
  touch(e);changedSoon(e);
});
panelEl.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-act]');if(!b)return;
  const e=byId.get(focusId),act=b.dataset.act;
  switch(act){
    case 'goto':focus(b.dataset.id);break;
    case 'close':clearOverlay();unfocus();break;
    case 'edit':editing=true;renderPanel();break;
    case 'done':editing=false;derive();renderPanel();break;
    case 'star':e.starred=!e.starred;touch(e);recomputeVis();renderPanel();need=true;commit();break;
    case 'tag':openIndexWith('#'+b.dataset.tag);break;
    case 'trace-out':runTrace('out',e.id);break;
    case 'trace-in':runTrace('in',e.id);break;
    case 'trace-path':pathMode=!pathMode;renderPanel();break;
    case 'settype':e.type=b.dataset.type;lastType=e.type;touch(e);derive();renderPanel();commit();break;
    case 'newtype':
      createCategoryFlow().then(nt=>{if(nt&&byId.has(e.id)){e.type=nt.id;touch(e);derive();renderPanel();commit();}});break;
    case 'urladd':e.urls.push({label:'',url:''});renderPanel();break;
    case 'urldel':e.urls.splice(+b.dataset.i,1);touch(e);renderPanel();commit();break;
    case 'imgpick':$('#file-img').click();break;
    case 'imgdel':e.image=null;touch(e);derive();renderPanel();commit();break;
    case 'lunlink':{const f=findLink(b.dataset.lid);if(f){f.owner.links=f.owner.links.filter(l=>l.id!==b.dataset.lid);touch(f.owner);derive();renderPanel();reheat(.4);commit();}break;}
    case 'pickconn':makeConn(e,b.dataset.id);break;
    case 'mkconn':
      newEntry({name:b.dataset.name,type:b.dataset.type,x:e.x+(Math.random()-.5)*120,y:e.y+(Math.random()-.5)*120},{focus:false}).then(n=>{if(n&&byId.has(e.id))makeConn(e,n.id);});break;
    case 'pickpath':runTrace('path',e.id,b.dataset.id);break;
    case 'del':
      if(b.dataset.armed)deleteEntry(e.id);
      else{b.dataset.armed='1';b.textContent='Click again to delete';b.classList.add('armed');setTimeout(()=>{if(b.isConnected){delete b.dataset.armed;b.textContent='Delete entry';b.classList.remove('armed');}},3000);}
      break;
  }
});
function makeConn(e,otherId){
  const [rid,dir]=($('#f-rel')&&$('#f-rel').value!=='__new|'?$('#f-rel').value:lastRelSel).split('|');
  if(!relById.has(rid)){toast('Pick how they connect first.',{warn:true});return;}
  const ok=dir==='r'?addLink(otherId,e.id,rid):addLink(e.id,otherId,rid);
  if(ok){renderPanel();const f=$('#f-conn');if(f)f.focus();}else toast('Those two are already connected that way.');
}
function createRow(q,act){
  return `<div class="mk"><span>Create <b>${esc(q)}</b> as</span>${types.map(k=>`<button class="tdot" data-act="${act}" data-type="${esc(k.id)}" data-name="${esc(q)}" style="--c:${k.color}"><i></i>${esc(k.name)}</button>`).join('')}<button class="tdot plus" data-act="${act}" data-type="__new" data-name="${esc(q)}">＋ New category</button></div>`;
}
function connUpdate(q){
  const e=byId.get(focusId),box=$('#connlist');
  if(!q.trim()){box.hidden=true;box.innerHTML='';return;}
  const res=searchEntries(q,{exclude:new Set([e.id]),limit:6});
  const exact=entries.some(o=>o.name.trim().toLowerCase()===q.trim().toLowerCase());
  box.innerHTML=res.map(o=>`<button class="row" data-act="pickconn" data-id="${o.id}" style="--c:${nodeColor(o)}"><i class="dot"></i><span>${esc(label(o))}</span><span class="s">${esc(o.full||T(o).name)}</span></button>`).join('')+(exact?'':createRow(q.trim(),'mkconn'));
  box.hidden=false;
}
function pathUpdate(q){
  const e=byId.get(focusId),box=$('#pathlist');
  if(!q.trim()){box.hidden=true;return;}
  const res=searchEntries(q,{exclude:new Set([e.id]),limit:6});
  box.innerHTML=res.map(o=>`<button class="row" data-act="pickpath" data-id="${o.id}" style="--c:${nodeColor(o)}"><i class="dot"></i><span>${esc(label(o))}</span><span class="s">${esc(o.full||T(o).name)}</span></button>`).join('')||'<div class="muted" style="padding:8px">No match</div>';
  box.hidden=false;
}
panelEl.addEventListener('keydown',ev=>{
  const t=ev.target;
  if(t.id==='f-conn'&&ev.key==='Enter'){
    ev.preventDefault();const e=byId.get(focusId),q=t.value.trim();if(!q)return;
    const res=searchEntries(q,{exclude:new Set([e.id]),limit:1});
    const exact=res[0]&&res[0].name.trim().toLowerCase()===q.toLowerCase();
    if(res[0]&&(exact||!ev.shiftKey))makeConn(e,res[0].id);
    else newEntry({name:q,type:lastType,x:e.x+(Math.random()-.5)*120,y:e.y+(Math.random()-.5)*120},{focus:false}).then(n=>{if(n&&byId.has(e.id))makeConn(e,n.id);});
  }
  if(t.id==='f-path'&&ev.key==='Enter'){
    ev.preventDefault();const e=byId.get(focusId),res=searchEntries(t.value,{exclude:new Set([e.id]),limit:1});if(res[0])runTrace('path',e.id,res[0].id);
  }
  if(t.id==='f-desc'&&!$('#ac').hidden){
    const k=ev.key;
    if(k==='ArrowDown'||k==='ArrowUp'){ev.preventDefault();acSel=(acSel+(k==='ArrowDown'?1:-1)+acRes.length)%acRes.length;acRender();}
    else if(k==='Enter'||k==='Tab'){ev.preventDefault();acPick(acRes[acSel],t);}
    else if(k==='Escape'){ev.stopPropagation();$('#ac').hidden=true;}
  }
});
let acRes=[],acSel=0,acRange=null;
function acUpdate(ta,e){
  const before=ta.value.slice(0,ta.selectionStart),m=/@([^\s@]{0,30})$/.exec(before),box=$('#ac');
  if(!m){box.hidden=true;return;}
  acRes=searchEntries(m[1],{exclude:new Set([e.id]),limit:6});
  if(!acRes.length){box.hidden=true;return;}
  acRange={s:m.index,e:ta.selectionStart};acSel=0;acRender();box.hidden=false;
}
function acRender(){
  $('#ac').innerHTML=acRes.map((o,i)=>`<button class="row ${i===acSel?'sel':''}" data-ac="${i}" style="--c:${nodeColor(o)}"><i class="dot"></i><span>${esc(label(o))}</span><span class="s">${esc(o.full||T(o).name)}</span></button>`).join('');
}
function acPick(o,ta){
  const txt=(o.noauto?'@':'')+o.name+' ';
  ta.value=ta.value.slice(0,acRange.s)+txt+ta.value.slice(acRange.e);
  const p=acRange.s+txt.length;ta.setSelectionRange(p,p);$('#ac').hidden=true;
  ta.dispatchEvent(new Event('input',{bubbles:true}));ta.focus();
}
panelEl.addEventListener('mousedown',ev=>{
  const r=ev.target.closest('[data-ac]');
  if(r){ev.preventDefault();acPick(acRes[+r.dataset.ac],$('#f-desc'));}
});
