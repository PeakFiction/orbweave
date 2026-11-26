'use strict';
/* =====================================================================
   ORBWEAVE core: data model, mention matching, search, traces, storage
   ===================================================================== */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=(p='e')=>p+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);
const arr=a=>Array.isArray(a)?a.map(String).map(s=>s.trim()).filter(Boolean):[];
const TAU=Math.PI*2;
const SHAPES=['circle','square','diamond','hexagon','triangle','star','octagon'];
const PALETTE=['#4cc9f0','#6ea8ff','#b79cff','#f4a6e0','#ff7eb6','#ff6b6b','#ff8a5c','#ffd166','#9ad06b','#5eeb9b','#7be0c3','#a8b3cf'];
const IMPORTANCE=['Normal','Medium','High','Top priority'];
const FIELD_KINDS=[['text','Short text'],['longtext','Long text'],['date','Date'],['number','Number'],['choice','Choice']];
const hexRgb=h=>{const n=parseInt(h.slice(1),16);return [n>>16,(n>>8)&255,n&255];};
const rgbaOf=(h,a)=>{const c=hexRgb(h);return `rgba(${c[0]},${c[1]},${c[2]},${a})`;};
const pairKey=(a,b)=>a<b?a+'|'+b:b+'|'+a;
const isUrl=u=>/^(https?:\/\/|mailto:)/i.test(String(u).trim());
function ago(ts){
  const s=(Date.now()-ts)/1000;
  if(s<60)return 'just now';if(s<3600)return Math.floor(s/60)+' min ago';
  if(s<86400)return Math.floor(s/3600)+' h ago';if(s<86400*30)return Math.floor(s/86400)+' d ago';
  return new Date(ts).toISOString().slice(0,10);
}

/* ---------------- state ---------------- */
let types=[],relations=[],lenses=[],entries=[];
let byId=new Map(),typeById=new Map(),relById=new Map();
let focusId=null,hoverId=null,editing=false,searchHL=null,overlay=null,viewMode='map';
const hidden=new Set(),relOff=new Set();
let onlyStarred=false,activeLens='all',viewMinImp=0,viewTags=[];
let lastType='',lastRelSel='related|f';
let practice=false,tourOn=false;   // true while the practice map (tutorial) is showing: nothing is saved
let alpha=0,need=true;
let derived={edges:[],adj:new Map(),ed:new Map(),matchers:[]};
const store={host:window.orbHost||null,file:'',name:'',encrypted:false,rev:null,pending:false,conflict:false,info:null};

/* ---------------- starting points (nothing is created until the user asks) ---------------- */
const F=(label,kind='text',options='')=>({label,kind,options});
const STARTER_CATEGORIES=[
 {name:'Person',shape:'circle',fields:[F('Role'),F('Email'),F('Phone')]},
 {name:'Group',shape:'hexagon',fields:[F('Leader'),F('Size','number')]},
 {name:'Project',shape:'triangle',fields:[F('Goal'),F('Deadline','date')]},
 {name:'Task',shape:'square',fields:[F('Owner'),F('Deadline','date')]},
 {name:'Idea',shape:'star',fields:[]},
 {name:'Document',shape:'diamond',fields:[F('Version'),F('Date','date'),F('Where it is kept')]},
 {name:'Term',shape:'circle',fields:[F('Meaning in context','longtext'),F('Example','longtext')]},
 {name:'Place',shape:'octagon',fields:[F('Address')]},
 {name:'Event',shape:'star',fields:[F('Date','date'),F('Place')]},
 {name:'Tool',shape:'square',fields:[F('Version'),F('Link')]},
 {name:'Organisation',shape:'octagon',fields:[F('Contact')]},
 {name:'Course',shape:'diamond',fields:[F('Teacher'),F('Term / semester'),F('Grade')]}
];
const FIELD_PRESETS=[F('Email'),F('Phone'),F('Date','date'),F('Deadline','date'),F('Location'),F('Owner'),F('Amount','number'),F('Notes','longtext')];
/* connection types the user can add with one click; plain words, no symbols */
const STARTER_CONNECTIONS=[
 {name:'is part of',inverse:'contains'},
 {name:'depends on',inverse:'is needed by'},
 {name:'leads to',inverse:'comes from',flow:true},
 {name:'belongs to',inverse:'has'},
 {name:'made',inverse:'was made by'},
 {name:'is responsible for',inverse:'is looked after by'},
 {name:'explains',inverse:'is explained by'},
 {name:'works with',sym:true},
 {name:'is similar to',sym:true}
];
const BASE_REL={id:'related',name:'is related to',inverse:'is related to',sym:true,color:'#a8b3cf'};
const FALLBACK_TYPE={id:'',name:'Uncategorised',color:'#a8b3cf',shape:'circle',glyph:'',fields:[]};
function nextColor(list){
  const used=new Set(list.map(x=>(x.color||'').toLowerCase()));
  return PALETTE.find(c=>!used.has(c.toLowerCase()))||PALETTE[list.length%PALETTE.length];
}

/* ---------------- normalisers ---------------- */
const normField=f=>({key:String(f.key||uid('f')),label:String(f.label||'Field'),kind:FIELD_KINDS.some(k=>k[0]===f.kind)?f.kind:'text',options:String(f.options||'')});
const normType=t=>({id:String(t.id||uid('t')),name:String(t.name||'Category'),color:/^#[0-9a-f]{6}$/i.test(t.color||'')?t.color:PALETTE[0],
  shape:SHAPES.includes(t.shape)?t.shape:'circle',glyph:String(t.glyph||'').slice(0,2),fields:Array.isArray(t.fields)?t.fields.map(normField):[]});
const normLens=l=>({id:String(l.id||uid('v')),name:String(l.name||'View').slice(0,60),hiddenTypes:arr(l.hiddenTypes),hiddenRels:arr(l.hiddenRels),
  mentions:l.mentions!==false,starred:!!l.starred,minImp:Math.max(0,Math.min(3,Math.round(+l.minImp||0))),tags:arr(l.tags).map(x=>x.toLowerCase())});
function normRel(r){
  const sym=!!r.sym,name=String(r.name||'is related to');
  return {id:String(r.id||uid('r')),name,inverse:sym?name:String(r.inverse||''),color:/^#[0-9a-f]{6}$/i.test(r.color||'')?r.color:'#a8b3cf',flow:!!r.flow,sym};
}
function mk(o){
  const x=Number(o.x),y=Number(o.y);
  return {
    id:String(o.id||uid()),type:String(o.type||lastType||(types[0]&&types[0].id)||''),
    name:String(o.name??''),full:String(o.full??''),aliases:arr(o.aliases),summary:String(o.summary??''),desc:String(o.desc??''),
    status:String(o.status??''),conf:o.conf==='verified'||o.conf==='unsure'?o.conf:'',
    importance:Math.max(0,Math.min(3,Math.round(+o.importance||0))),
    classification:String(o.classification??''),source:String(o.source??''),reviewed:String(o.reviewed??''),
    where:String(o.where??''),contact:String(o.contact??''),
    urls:Array.isArray(o.urls)?o.urls.filter(u=>u&&u.url).map(u=>({label:String(u.label||''),url:String(u.url)})):[],
    tags:arr(o.tags),custom:o.custom&&typeof o.custom==='object'?Object.assign({},o.custom):{},
    links:Array.isArray(o.links)?o.links.filter(l=>l&&l.to).map(l=>({id:String(l.id||uid('l')),to:String(l.to),rel:String(l.rel||'related'),
      note:String(l.note??l.label??''),data:String(l.data||''),method:String(l.method||''),freq:String(l.freq||'')})):[],
    image:o.image&&o.image.file?{file:String(o.image.file)}:null,
    noauto:!!o.noauto,pinned:!!o.pinned,starred:!!o.starred,
    x:Number.isFinite(x)?x:undefined,y:Number.isFinite(y)?y:undefined,vx:0,vy:0,r:9,deg:0,vis:true,visDeg:0,
    created:+o.created||Date.now(),updated:+o.updated||Date.now(),mentionIds:new Set()
  };
}
function reindex(){
  byId=new Map(entries.map(e=>[e.id,e]));
  typeById=new Map(types.map(t=>[t.id,t]));
  relById=new Map(relations.map(r=>[r.id,r]));
  for(const e of entries){
    if(e.type&&!typeById.has(e.type)){const t=normType({id:e.type,name:e.type,color:PALETTE[types.length%PALETTE.length]});types.push(t);typeById.set(t.id,t);}
  }
  const seen=new Set();
  for(const e of entries){
    e.links=e.links.filter(l=>byId.has(l.to)&&l.to!==e.id);
    for(const l of e.links){if(!relById.has(l.rel))l.rel='related';if(seen.has(l.id))l.id=uid('l');seen.add(l.id);}
  }
}
function loadData(d){
  if(!d||typeof d!=='object')d={};
  types=(Array.isArray(d.types)?d.types:[]).filter(t=>t&&typeof t==='object').map(normType);
  relations=(Array.isArray(d.relations)?d.relations:[]).filter(r=>r&&typeof r==='object').map(normRel);
  if(!relations.some(r=>r.id==='related'))relations.unshift(normRel(BASE_REL));
  lenses=Array.isArray(d.lenses)?d.lenses.filter(l=>l&&l.name).map(normLens):[];
  const raw=Array.isArray(d.entries)?d.entries:[];
  entries=raw.map(mk);
  reindex();
}
const ser=e=>({id:e.id,type:e.type,name:e.name,full:e.full,aliases:e.aliases,summary:e.summary,desc:e.desc,status:e.status,conf:e.conf,
  importance:e.importance,classification:e.classification,source:e.source,reviewed:e.reviewed,where:e.where,contact:e.contact,urls:e.urls,
  tags:e.tags,custom:e.custom,links:e.links,image:e.image,noauto:e.noauto,pinned:e.pinned,starred:e.starred,
  x:Math.round(e.x)||0,y:Math.round(e.y)||0,created:e.created,updated:e.updated});
function serialize(){return {app:'orbweave',v:1,savedAt:new Date().toISOString(),types,relations,lenses,entries:entries.map(ser)};}


/* ---------------- adding categories and connection types ---------------- */
function addCategory(name,preset){
  const nm=String(name||'').trim()||'Category';
  const base=preset||STARTER_CATEGORIES.find(c=>c.name.toLowerCase()===nm.toLowerCase())||{};
  const t=normType({name:nm,color:nextColor(types),shape:base.shape||SHAPES[types.length%SHAPES.length],fields:(base.fields||[]).map(f=>normField(f))});
  types.push(t);typeById.set(t.id,t);return t;
}
function addConnectionType(name,inverse,{sym=false,flow=false}={}){
  const nm=String(name||'').trim()||'is related to';
  const r=normRel({name:nm,inverse:sym?nm:String(inverse||'').trim(),sym,flow,color:nextColor(relations)});
  relations.push(r);relById.set(r.id,r);return r;
}

const T=e=>typeById.get(e.type)||types[0]||FALLBACK_TYPE;
const invName=r=>r.sym?r.name:(r.inverse||('the other end of “'+r.name+'”'));
const label=e=>e.name.trim()||'(untitled)';
const R=id=>relById.get(id)||relById.get('related');
const nodeColor=e=>T(e).color;

/* ---------------- mention matching ---------------- */
const termsOf=e=>[e.name,e.full,...e.aliases].map(s=>s.trim()).filter(s=>s.length>=2);
function termRegex(term,noauto){
  const t=term.replace(/[.*+?^${}()|[\]\\\/]/g,'\\$&').replace(/\s+/g,'\\s+');
  const cs=!/[a-z]/.test(term)&&term.length<=5;           // short ALL-CAPS names match only in capitals
  const pre=noauto?'@':'(?<![\\p{L}\\p{N}_])';
  return new RegExp(pre+t+'(?![\\p{L}\\p{N}_])','gu'+(cs?'':'i'));
}
function buildMatchers(){
  const ms=[];
  for(const e of entries){
    const seen=new Set();
    for(const t of termsOf(e)){
      const k=t.toLowerCase();if(seen.has(k))continue;seen.add(k);
      try{ms.push({id:e.id,re:termRegex(t,e.noauto),len:t.length});}catch(_){}
    }
  }
  ms.sort((a,b)=>b.len-a.len);
  derived.matchers=ms;
}
function findMatches(text,selfId){
  const out=[];
  for(const m of derived.matchers){
    if(m.id===selfId)continue;
    m.re.lastIndex=0;let r;
    while((r=m.re.exec(text))){out.push({s:r.index,e:r.index+r[0].length,id:m.id});if(r[0].length===0)m.re.lastIndex++;}
  }
  out.sort((a,b)=>a.s-b.s||(b.e-b.s)-(a.e-a.s));
  const res=[];let end=-1;
  for(const x of out){if(x.s>=end){res.push(x);end=x.e;}}
  return res;
}
function nodeRadius(e){
  let r=7+Math.sqrt(e.deg)*3.2+[0,1.5,3.5,6][e.importance];
  r=Math.max(8,Math.min(24,r));
  return e.image?Math.max(r+3,18):r;
}
function derive(){
  buildMatchers();
  const edges=[],manual=new Set(),adj=new Map(),ed=new Map();
  for(const e of entries){adj.set(e.id,new Set());ed.set(e.id,[]);}
  const add=x=>{edges.push(x);ed.get(x.a).push(x);ed.get(x.b).push(x);adj.get(x.a).add(x.b);adj.get(x.b).add(x.a);};
  for(const e of entries)for(const l of e.links){
    const r=R(l.rel);
    add({id:l.id,a:e.id,b:l.to,kind:'link',rel:r.id,color:r.color,flow:r.flow,sym:r.sym,note:l.note,data:l.data,method:l.method,freq:l.freq,vis:true});
    manual.add(pairKey(e.id,l.to));
  }
  const seen=new Set();
  for(const e of entries){
    e.mentionIds=new Set();
    const text=e.summary+'\n'+e.desc;if(!text.trim())continue;
    for(const m of findMatches(text,e.id)){
      e.mentionIds.add(m.id);
      const k=pairKey(e.id,m.id);if(manual.has(k)||seen.has(k))continue;seen.add(k);
      add({id:'m:'+k,a:e.id,b:m.id,kind:'mention',rel:'_mention',color:'#afbeeb',flow:false,sym:true,note:'',data:'',method:'',freq:'',vis:true});
    }
  }
  const groups=new Map();
  for(const x of edges){const k=pairKey(x.a,x.b);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);}
  for(const g of groups.values())g.forEach((x,i)=>{x.pi=i;x.pn=g.length;});
  derived.edges=edges;derived.adj=adj;derived.ed=ed;
  for(const e of entries){e.deg=adj.get(e.id).size;e.r=nodeRadius(e);}
  recomputeVis();
  if(typeof renderHud==='function')renderHud();
  need=true;
}
const relVisible=x=>x.kind==='mention'?!relOff.has('_mention'):!relOff.has(x.rel);
function recomputeVis(){
  for(const e of entries){e.vis=!hidden.has(e.type)&&(e.id===focusId||((!onlyStarred||e.starred)&&e.importance>=viewMinImp&&(!viewTags.length||e.tags.some(t=>viewTags.includes(t.toLowerCase())))));e.visDeg=0;}
  for(const x of derived.edges){
    const A=byId.get(x.a),B=byId.get(x.b);
    x.vis=A.vis&&B.vis&&relVisible(x);
    if(x.vis){A.visDeg++;B.visDeg++;}
  }
  if(relOff.size>0)for(const e of entries)if(e.vis&&e.visDeg===0&&e.id!==focusId)e.vis=false;
  for(const x of derived.edges)x.vis=x.vis&&byId.get(x.a).vis&&byId.get(x.b).vis;
  need=true;
}

/* ---------------- search ---------------- */
function parseQuery(q){
  const f={text:'',tags:[],type:null,status:null};const words=[];
  for(const tok of q.trim().split(/\s+/)){
    if(!tok)continue;
    if(tok[0]==='#'&&tok.length>1)f.tags.push(tok.slice(1).toLowerCase());
    else if(/^type:/i.test(tok)&&tok.length>5)f.type=tok.slice(5).toLowerCase();
    else if(/^status:/i.test(tok)&&tok.length>7)f.status=tok.slice(7).toLowerCase();
    else words.push(tok);
  }
  f.text=words.join(' ').toLowerCase();return f;
}
function searchEntries(q,{exclude=null,limit=8}={}){
  const f=parseQuery(q),qq=f.text,out=[];
  const hasFilter=f.tags.length||f.type||f.status;
  for(const e of entries){
    if(exclude&&exclude.has(e.id))continue;
    if(f.type){const t=T(e);if(!(t.id.toLowerCase()===f.type||t.name.toLowerCase().startsWith(f.type)))continue;}
    if(f.status&&!e.status.toLowerCase().includes(f.status))continue;
    if(f.tags.length&&!f.tags.every(t=>e.tags.some(x=>x.toLowerCase()===t)))continue;
    const n=e.name.toLowerCase();let s=0;
    if(!qq)s=hasFilter?5:1;
    else if(n===qq)s=100;else if(n.startsWith(qq))s=80;
    else if(e.aliases.some(a=>a.toLowerCase()===qq))s=75;
    else if(n.includes(qq))s=60;
    else if(e.full.toLowerCase().includes(qq)||e.aliases.some(a=>a.toLowerCase().includes(qq)))s=45;
    else if(e.tags.some(t=>t.toLowerCase().includes(qq)))s=30;
    else if(e.summary.toLowerCase().includes(qq))s=22;
    else if(e.desc.toLowerCase().includes(qq))s=12;
    else if(Object.values(e.custom).some(v=>String(v).toLowerCase().includes(qq))||e.where.toLowerCase().includes(qq)||e.contact.toLowerCase().includes(qq))s=8;
    if(s)out.push([s,e]);
  }
  out.sort((a,b)=>b[0]-a[0]||b[1].deg-a[1].deg||label(a[1]).localeCompare(label(b[1])));
  return out.slice(0,limit).map(x=>x[1]);
}

/* ---------------- traces ---------------- */
function neighboursOf(id,mode){
  const res=[];
  for(const x of derived.ed.get(id)){
    if(!x.vis)continue;
    const other=x.a===id?x.b:x.a;
    if(mode==='any'){res.push([x,other]);continue;}
    if(!x.flow)continue;
    if(x.sym){res.push([x,other]);continue;}
    if(mode==='out'&&x.a===id)res.push([x,x.b]);
    else if(mode==='in'&&x.b===id)res.push([x,x.a]);
  }
  return res;
}
function bfsFrom(start,mode,target=null){
  const prev=new Map([[start,null]]),q=[start];
  while(q.length){
    const id=q.shift();if(id===target)break;
    for(const [x,n] of neighboursOf(id,mode)){if(prev.has(n))continue;prev.set(n,{from:id,edge:x.id});q.push(n);}
  }
  return prev;
}
function traceFlow(id,mode){
  const prev=bfsFrom(id,mode),edges=new Set();
  for(const v of prev.values())if(v)edges.add(v.edge);
  return {nodes:new Set(prev.keys()),edges,count:prev.size-1};
}
function tracePath(a,b){
  const prev=bfsFrom(a,'any',b);if(!prev.has(b))return null;
  const order=[b],edges=new Set();let cur=b;
  while(prev.get(cur)){const p=prev.get(cur);edges.add(p.edge);cur=p.from;order.push(cur);}
  order.reverse();return {nodes:new Set(order),edges,order};
}
function possiblyRelated(e,limit=5){
  const mine=derived.adj.get(e.id),out=[];
  for(const o of entries){
    if(o===e||mine.has(o.id))continue;
    let c=0;for(const n of derived.adj.get(o.id))if(mine.has(n))c++;
    if(c>=2)out.push([c,o]);
  }
  out.sort((a,b)=>b[0]-a[0]);return out.slice(0,limit);
}

/* ---------------- images: held as blobs, stored inside the .orbweave file ---------------- */
const imgs=new Map();            // name -> {url, mime, blob}
let mainHas=new Set();           // image names the file on disk already contains
const OKMIME=/^image\/(png|jpeg|webp|gif)$/;
const imgURL=im=>{if(!im)return null;const c=imgs.get(im.file);return c?c.url:null;};
function setImages(list){
  for(const c of imgs.values())URL.revokeObjectURL(c.url);
  imgs.clear();
  for(const i of list||[]){
    if(!OKMIME.test(i.mime))continue;
    const blob=new Blob([i.data],{type:i.mime});
    imgs.set(i.name,{url:URL.createObjectURL(blob),mime:i.mime,blob});
  }
  mainHas=new Set(imgs.keys());
}
function addImageBlob(blob,ext){
  const name=uid('i')+'.'+ext;
  imgs.set(name,{url:URL.createObjectURL(blob),mime:blob.type,blob});
  return {file:name};
}
async function resizeImage(file,maxSide=640){
  let bmp;
  try{bmp=await createImageBitmap(file);}
  catch(_){
    bmp=await new Promise((res,rej)=>{const i=new Image(),u=URL.createObjectURL(file);i.onload=()=>{res(i);};i.onerror=rej;i.src=u;});
  }
  const w=bmp.width||bmp.naturalWidth,h=bmp.height||bmp.naturalHeight,s=Math.min(1,maxSide/Math.max(w,h));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*s));c.height=Math.max(1,Math.round(h*s));
  c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
  const png=/png|gif|webp/.test(file.type);
  const blob=await new Promise(res=>c.toBlob(res,png?'image/png':'image/jpeg',.86));
  return {blob,ext:png?'png':'jpg'};
}
async function storeImage(file){
  if(!/^image\//.test(file.type))throw new Error('That is not an image file.');
  const {blob,ext}=await resizeImage(file);
  return addImageBlob(blob,ext);
}

/* ---------------- storage: one .orbweave file through the desktop host ---------------- */
let commitT=0,persistT=0,lastSnap='',undoStack=[],redoStack=[],saveBusy=false,saveAgain=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const snapNow=()=>{const s=serialize();delete s.savedAt;return JSON.stringify(s);};
function flushSnap(){
  const s=snapNow();
  if(s!==lastSnap){if(lastSnap)undoStack.push(lastSnap);if(undoStack.length>40)undoStack.shift();redoStack.length=0;lastSnap=s;}
}
function commit(){if(practice)return;store.pending=true;clearTimeout(commitT);commitT=setTimeout(()=>{flushSnap();persist();},500);setStatus('Unsaved changes…');}
function persistSoon(){clearTimeout(persistT);persistT=setTimeout(()=>persist(),800);}
function flushNow(){if(store.pending){clearTimeout(commitT);flushSnap();persist();}}
async function flushNowAsync(){
  clearTimeout(commitT);
  if(store.pending){flushSnap();await persist();}
  for(let i=0;i<150&&(saveBusy||saveAgain);i++)await sleep(30);
}
function undo(){clearTimeout(commitT);flushSnap();if(!undoStack.length)return;redoStack.push(lastSnap);lastSnap=undoStack.pop();loadData(JSON.parse(lastSnap));derive();afterRestore();persist();}
function redo(){clearTimeout(commitT);if(!redoStack.length)return;undoStack.push(lastSnap);lastSnap=redoStack.pop();loadData(JSON.parse(lastSnap));derive();afterRestore();persist();}

const emptyModel=()=>({app:'orbweave',v:1,types:[],relations:[],lenses:[],entries:[]});
const imageNames=model=>{const s=new Set();for(const e of model.entries)if(e.image&&e.image.file&&imgs.has(e.image.file))s.add(e.image.file);return s;};
async function buildPayload(){
  const model=serialize(),ref=imageNames(model),newImages=[];
  for(const n of ref)if(!mainHas.has(n)){const c=imgs.get(n);newImages.push({name:n,mime:c.mime,data:new Uint8Array(await c.blob.arrayBuffer())});}
  return {model,ref,payload:{model,newImages,baseRev:store.rev}};
}
const clock=()=>new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
async function persist(force=false){
  if(practice||!store.host||!store.file)return;
  if(saveBusy){saveAgain=true;return;}
  saveBusy=true;
  try{
    const {ref,payload}=await buildPayload();
    payload.force=force;
    const r=await store.host.save(payload);
    if(r.conflict){store.conflict=true;showConflict();setStatus('File changed elsewhere — choose a version',true);}
    else if(r.ok){store.rev=r.rev;mainHas=ref;store.pending=false;store.conflict=false;setStatus('Saved · '+clock());}
    else setStatus('Could not save: '+((r.error&&r.error.message)||'unknown error'),true);
  }catch(err){setStatus('Could not save: '+err.message,true);}
  finally{saveBusy=false;if(saveAgain){saveAgain=false;persist();}}
}
async function saveAsCopy(){
  clearTimeout(commitT);await flushNowAsync();
  const {ref,payload}=await buildPayload();
  const r=await store.host.saveAs(payload);
  if(r.canceled)return;
  if(r.ok){store.file=r.file;store.rev=r.rev;mainHas=ref;store.pending=false;store.conflict=false;store.name=baseName(r.file);setStatus('Saved · '+clock());toast('Now working in '+baseName(r.file)+'.orbweave');if($('#modal')&&!$('#modal').hidden&&typeof renderSettings==='function')renderSettings();}
  else toast((r.error&&r.error.message)||'Could not save the copy.',{warn:true});
}
const baseName=p=>String(p||'').split(/[\\/]/).pop().replace(/\.orbweave$/i,'');

async function reloadFromDisk(silent){
  const keepFocus=focusId;
  let r=await store.host.open({path:store.file});
  if(r.needPassword){const pw=await askPassword('This file is protected. Enter the password to reload it.');if(pw==null)return;r=await store.host.open({path:store.file,password:pw});}
  if(!r.ok){toast((r.error&&r.error.message)||'Could not reload the file.',{warn:true});return;}
  setImages(r.images);store.rev=r.rev;store.encrypted=r.encrypted;
  loadData(r.model);derive();
  store.pending=false;store.conflict=false;lastSnap=snapNow();undoStack=[];redoStack=[];
  seedPositions();need=true;
  if(keepFocus&&byId.has(keepFocus)){renderPanel();}else if(keepFocus){unfocus();}
  renderHud();if(viewMode==='index')renderIndex();
  hideConflict();setStatus('Loaded from file');
  if(!silent)toast('Loaded the version on disk.');else toast('The file changed on disk — reloaded.');
}
let missingWarned=false;
setInterval(async()=>{
  if(practice||!store.host||!store.file||document.hidden||store.conflict||saveBusy)return;
  try{
    const m=await store.host.meta();
    if(m.missing){if(!missingWarned){missingWarned=true;setStatus('The file is missing from disk. Orbweave will recreate it on the next change.',true);}return;}
    missingWarned=false;
    if(m.rev&&m.rev!==store.rev){
      if(!store.pending){await reloadFromDisk(true);}
      else{store.conflict=true;showConflict();}
    }
  }catch(_){}
},4000);

/* ---------------- export / import ---------------- */
const csvCell=v=>{v=String(v??'');return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
const toCSV=rows=>'﻿'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
async function downloadBlob(blob,name){
  if(!store.host)return;
  const r=await store.host.saveExport(name,new Uint8Array(await blob.arrayBuffer()),/\.csv$/.test(name)?'CSV':'PNG image');
  if(r.ok)toast('Saved '+r.file);else if(!r.canceled)toast((r.error&&r.error.message)||'Could not save.',{warn:true});
}
const stamp=()=>new Date().toISOString().slice(0,10);
function exportEntriesCSV(){
  const rows=[['Name','Full name','Category','Also called','Summary','Description','Status','Confidence','Importance','Privacy','Where','Contact','Source','Last reviewed','Tags','Links','Connections']];
  for(const e of entries)rows.push([e.name,e.full,T(e).name,e.aliases.join('; '),e.summary,e.desc,e.status,e.conf,IMPORTANCE[e.importance],e.classification,e.where,e.contact,e.source,e.reviewed,e.tags.join('; '),e.urls.map(u=>u.url).join('; '),derived.adj.get(e.id).size]);
  downloadBlob(new Blob([toCSV(rows)],{type:'text/csv'}),'orbweave-entries-'+stamp()+'.csv');
}
function exportLinksCSV(){
  const rows=[['From','Connection','To','What moves','How','How often','Note']];
  for(const e of entries)for(const l of e.links)rows.push([e.name,R(l.rel).name,byId.get(l.to).name,l.data,l.method,l.freq,l.note]);
  downloadBlob(new Blob([toCSV(rows)],{type:'text/csv'}),'orbweave-connections-'+stamp()+'.csv');
}
