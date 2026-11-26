'use strict';
/* =====================================================================
   ORBWEAVE tutorial: a guided tour on a PRACTICE map.
   The user's own map is parked untouched while the tour runs and put back
   when it ends, so the tutorial is safe in a new empty file and in a file
   full of entries alike. Nothing done in the practice map is ever saved.
   ===================================================================== */
let tourStash=null,tourStep=0,tourTimer=0,tourFirst=false,tourResolve=null,tourN0=0,tourStatus='';

/* ---------------- practice map: park the real data, show a sample ---------------- */
async function enterPractice(){
  if(store.file)await flushNowAsync();
  clearTimeout(commitT);clearTimeout(persistT);
  tourStash={types,relations,lenses,entries,hidden:new Set(hidden),relOff:new Set(relOff),onlyStarred,viewMinImp,viewTags:viewTags.slice(),activeLens,
    focusId,editing,hist:hist.slice(),hi,viewMode,lastType,lastRelSel,undoStack,redoStack,lastSnap,cam:{x:cam.x,y:cam.y,k:cam.k},ix:Object.assign({},ix)};
  tourStatus=$('#status').textContent;
  practice=true;
  loadData(sampleModel());
  hidden.clear();relOff.clear();onlyStarred=false;viewMinImp=0;viewTags=[];activeLens='all';
  focusId=null;hoverId=null;editing=false;overlay=null;searchHL=null;pathMode=false;hist=[];hi=-1;
  undoStack=[];redoStack=[];lastType='';lastRelSel='related|f';
  $('#panel').classList.remove('open');document.body.classList.remove('panel');
  setView('map');renderOvl();derive();seedPositions();settle(260);fitAll(true);renderHud();updateNav();
  lastSnap=snapNow();
  setStatus('Practice map, not saved');
}
function leavePractice(){
  const s=tourStash;practice=false;tourStash=null;
  clearTimeout(commitT);clearTimeout(persistT);
  types=s.types;relations=s.relations;lenses=s.lenses;entries=s.entries;
  hidden.clear();s.hidden.forEach(x=>hidden.add(x));relOff.clear();s.relOff.forEach(x=>relOff.add(x));
  onlyStarred=s.onlyStarred;viewMinImp=s.viewMinImp;viewTags=s.viewTags;activeLens=s.activeLens;
  hist=s.hist;hi=s.hi;lastType=s.lastType;lastRelSel=s.lastRelSel;undoStack=s.undoStack;redoStack=s.redoStack;lastSnap=s.lastSnap;
  Object.assign(ix,s.ix);
  focusId=null;hoverId=null;editing=false;overlay=null;searchHL=null;pathMode=false;
  $('#panel').classList.remove('open');document.body.classList.remove('panel');
  reindex();derive();renderOvl();
  setView(s.viewMode);
  cam.x=s.cam.x;cam.y=s.cam.y;cam.k=s.cam.k;camT.active=false;
  if(s.focusId&&byId.has(s.focusId))focus(s.focusId,{push:false,edit:false,fly:false});
  renderHud();updateNav();updateWelcome();
  setStatus(tourStatus||'');need=true;
}

/* ---------------- steps ---------------- */
const TOUR=[
  {title:'Welcome to Orbweave',place:'center',
   body:'This is a short tour on a <b>practice map</b>. Click around freely: nothing you do here is saved, and your own map is not touched. It takes about two minutes. Press Esc at any time to leave.'},
  {title:'The map',place:'center',
   enter(){clearOverlay();unfocus();applyLens(BUILTIN_LENSES[0]);},
   body:'Every shape is an <b>entry</b>: a person, a task, an idea, anything. The lines are <b>connections</b>. Drag the background to move around, scroll to zoom, drag a shape to move it, and double-click empty space to add an entry.<br><br><b>Try it:</b> click any shape.',
   expect:()=>focusId!==null,done:'Good. That opened it.'},
  {title:'An entry',anchor:'#panel',place:'left',
   enter(){if(!focusId||!byId.has(focusId))focus('sx-e-maya');else{editing=false;renderPanel();}},
   body:'The side panel shows everything about an entry: what it is, its description, and everything it connects to. Names written inside a description become <b>links</b>: click one to jump there. The pencil (or the E key) edits, the star marks favourites.'},
  {title:'Add anything',anchor:'#cmdbox',place:'top',
   enter(){unfocus();setView('map');tourN0=entries.length;setTimeout(()=>cmd.focus(),80);},
   body:'This bar finds and adds. Type a name, press Enter, and pick its category. The very first time you use Orbweave it asks you to create a category, because it starts with none.<br><br><b>Try it:</b> type any name and press Enter.',
   expect:()=>entries.length>tourN0,done:'Added. It only exists in the practice map.'},
  {title:'Categories are yours',anchor:'#h-types',place:'right',
   enter(){unfocus();cmd.blur();},
   body:'A <b>category</b> says what kind of thing an entry is: Person, Course, Recipe, whatever you need. Orbweave starts with none, so you only ever see yours. Click a category here to hide or show it on the map. The pencil makes new ones and sets their colour, shape and extra fields.'},
  {title:'Connections happen on their own',anchor:'#pbody',place:'left',
   enter(){secOpen.add('desc');focus('sx-e-maya',{edit:true});renderPanel();},
   body:'Write another entry’s name inside a description and the two connect <b>automatically</b>. Everything below the description lists what was found.<br><br><b>Try it:</b> add the word <i>Priya</i> to this description. Or type <b>@</b> to pick from a list.'},
  {title:'Connect on purpose',anchor:'.sentence',place:'left',
   enter(){secOpen.add('conn');focus('sx-e-maya',{edit:true});renderPanel();setTimeout(()=>{const el=$('.sentence');if(el)el.scrollIntoView({block:'center'});},80);},
   body:'Read it as a sentence: <b>Maya</b> [works with] [who or what?]. Pick the words in the middle, then search for the other entry, or type a new name to create it. There is nothing to type except plain words, and the list also has “Make a new connection type…”.'},
  {title:'Your own connection types',anchor:'#mbox',place:'screen-bottom',
   enter(){editing=false;if(focusId)renderPanel();SET.selRel='sx-hands';openSettings('rels',{});},
   body:'In <b>Settings → Connections</b> you define the words that join entries: one direction (<i>teaches</i> / <i>is taught by</i>) or the same both ways (<i>works with</i>). The preview shows how it reads. Tick “something moves along it” to track what moves, how and how often.'},
  {title:'Views',anchor:'#h-lens',place:'right',modal:false,
   enter(){applyLens(BUILTIN_LENSES[0]);unfocus();},
   body:'A <b>view</b> is a saved way of looking: which categories, connection types and entries to show. Settings → Views lets you build, rename and edit them. The ＋ saves whatever you have filtered right now.<br><br><b>Try it:</b> click <i>Just the work</i>.',
   expect:()=>activeLens==='sx-v-work',done:'That view hides people, courses and terms.'},
  {title:'Follow what moves',anchor:'.tracebar',place:'left',
   enter(){applyLens(BUILTIN_LENSES[0],{fit:false});focus('sx-e-research');},
   body:'Connections that carry something (work, information, money) show moving dots. <b>Where it leads</b> follows them all the way along the chain. <b>Path to…</b> finds the shortest chain between any two entries.<br><br><b>Try it:</b> press “Where it leads”.',
   expect:()=>!!overlay,done:'The whole chain is lit up. Esc clears it.'},
  {title:'Index',anchor:'#seg',place:'bottom',
   enter(){clearOverlay();unfocus();setView('map');},
   body:'<b>Map</b> is for exploring. <b>Index</b> is an A–Z table of everything, with filters and CSV export. Press <b>I</b> to switch.'},
  {title:'Saving and settings',anchor:'#dock',place:'top',
   enter(){setView('map');},
   body:'Your real map saves by itself into one <b>.orbweave</b> file, with dated backups beside it. The gear holds Settings: categories, connections, views, password, export and this tutorial, which you can replay at any time in any file.'},
  {title:'That’s the tour',place:'center',last:true,
   body:'Leave the practice map and go back to your own. Everything you tried here disappears; nothing was saved.'}
];

/* ---------------- running it ---------------- */
function startTutorial(opts={}){
  if(tourOn||!store.host)return Promise.resolve();
  const done=new Promise(res=>{tourResolve=res;});
  (async()=>{
    try{
      tourFirst=!!opts.first;
      closeModal();$('#dlg').hidden=true;
      $('#start').hidden=true;document.body.classList.remove('nofile');
      await enterPractice();
      tourOn=true;tourStep=0;
      $('#tour').hidden=false;document.body.classList.add('tour');
      renderTour();
      tourTimer=setInterval(tourTick,150);
    }catch(err){
      console.error('tutorial failed to start',err);
      if(tourStash){try{leavePractice();}catch(_){practice=false;}}
      practice=false;tourOn=false;
      if(!store.file){document.body.classList.add('nofile');}
      const r=tourResolve;tourResolve=null;if(r)r();
    }
  })();
  return done;
}
async function endTutorial(){
  if(!tourOn)return;
  tourOn=false;clearInterval(tourTimer);
  $('#tour').hidden=true;document.body.classList.remove('tour');
  closeModal();$('#dlg').hidden=true;
  if(tourStash)leavePractice();else practice=false;
  try{await store.host.tutorialDone();}catch(_){}
  if(!store.file){document.body.classList.add('nofile');if(!tourFirst)await showStart();}
  else toast('Tutorial finished. Your own map is exactly as you left it.');
  const r=tourResolve;tourResolve=null;if(r)r();
}
function goTour(i){
  const prev=TOUR[tourStep];
  tourStep=Math.max(0,Math.min(TOUR.length-1,i));
  const st=TOUR[tourStep];
  if(!st.anchor||st.anchor!=='#mbox')closeModal();
  if(st.enter)st.enter();
  renderTour();
}
function tourEl(st){
  if(!st.anchor)return null;
  const el=document.querySelector(st.anchor);
  if(!el)return null;
  const r=el.getBoundingClientRect();
  return r.width>2&&r.height>2?el:null;
}
function renderTour(){
  const st=TOUR[tourStep],card=$('#tour-card'),n=TOUR.length;
  card.innerHTML=`<div class="tcount">${tourStep+1} of ${n}</div><h3>${esc(st.title)}</h3><div class="tbody">${st.body}</div>
    <div class="tdone" id="tour-done" hidden>${esc(st.done||'')}</div>
    <div class="tbtns"><button class="btn ghost sm" data-t="skip">${st.last?'':'Skip tutorial'}</button><span style="flex:1"></span>
      ${tourStep>0?'<button class="btn sm" data-t="back">Back</button>':''}<button class="btn primary sm" data-t="${st.last?'finish':'next'}">${st.last?'Finish':(tourStep===0?'Start':'Next')}</button></div>`;
  tourLayout();
}
$('#tour-card').addEventListener('click',ev=>{
  const b=ev.target.closest('[data-t]');if(!b)return;
  const k=b.dataset.t;
  if(k==='next')goTour(tourStep+1);
  else if(k==='back')goTour(tourStep-1);
  else endTutorial();
});
function tourLayout(){
  if(!tourOn)return;
  const st=TOUR[tourStep],card=$('#tour-card'),spot=$('#tour-spot'),vw=innerWidth,vh=innerHeight;
  const el=tourEl(st);let rect=null;
  if(el){const r=el.getBoundingClientRect(),p=8;rect={l:Math.max(4,r.left-p),t:Math.max(4,r.top-p),r:Math.min(vw-4,r.right+p),b:Math.min(vh-4,r.bottom+p)};}
  if(rect){spot.style.cssText=`left:${rect.l}px;top:${rect.t}px;width:${rect.r-rect.l}px;height:${rect.b-rect.t}px;opacity:1`;}
  else{spot.style.cssText=`left:${vw/2}px;top:${vh/2}px;width:0;height:0;opacity:1`;}
  const cw=card.offsetWidth||340,ch=card.offsetHeight||200,g=16;
  let x,y;
  if(!rect||st.place==='center'){x=(vw-cw)/2;y=(vh-ch)/2;}
  else if(st.place==='screen-bottom'){x=(vw-cw)/2;y=vh-ch-24;}
  else if(st.place==='right'){x=rect.r+g;y=rect.t;}
  else if(st.place==='left'){x=rect.l-g-cw;y=rect.t+8;}
  else if(st.place==='top'){x=(rect.l+rect.r)/2-cw/2;y=rect.t-g-ch;}
  else{x=(rect.l+rect.r)/2-cw/2;y=rect.b+g;}
  x=Math.max(12,Math.min(vw-cw-12,x));y=Math.max(12,Math.min(vh-ch-12,y));
  card.style.left=x+'px';card.style.top=y+'px';
}
function tourTick(){
  if(!tourOn)return;
  const st=TOUR[tourStep];
  if(st.expect){const d=$('#tour-done');if(d){const ok=!!st.expect();d.hidden=!ok;}}
  tourLayout();
}
addEventListener('resize',()=>{if(tourOn)tourLayout();});
