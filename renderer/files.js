'use strict';
/* =====================================================================
   ORBWEAVE files: dialogs, start screen, opening/creating files, password, menu
   ===================================================================== */

/* ---------------- small in-app dialogs (window.prompt is not available in Electron) ---------------- */
function showDlg({title,msg='',fields=[],extra='',buttons}){
  return new Promise(res=>{
    const w=$('#dlg'),b=$('.dbox',w);
    b.innerHTML=`<h3>${esc(title)}</h3>${msg?`<p class="dmsg">${msg}</p>`:''}${fields.map(f=>`<label class="l" for="d-${f.id}">${esc(f.label)}</label><input class="f" id="d-${f.id}" type="${f.type||'text'}" placeholder="${esc(f.placeholder||'')}" value="${esc(f.value||'')}" autocomplete="off" spellcheck="false">`).join('')}${extra}<div class="derr" id="d-err"></div><div class="dbtns">${buttons.map(x=>`<button class="btn ${x.primary?'primary':''}" data-b="${x.id}">${esc(x.label)}</button>`).join('')}</div>`;
    const prev=document.activeElement;
    w.hidden=false;
    const vals=()=>Object.fromEntries(fields.map(f=>[f.id,$('#d-'+f.id,b).value]));
    const done=v=>{w.hidden=true;b.innerHTML='';w.onkeydown=null;w.onclick=null;if(prev&&prev.focus)try{prev.focus();}catch(_){}res(v);};
    const press=id=>{
      const btn=buttons.find(x=>x.id===id);
      if(id==='cancel')return done(null);
      const v=vals(),err=btn&&btn.check?btn.check(v):'';
      if(err){$('#d-err',b).textContent=err;return;}
      done({button:id,values:v});
    };
    w.onclick=ev=>{
      const fl=ev.target.closest('[data-fill]');
      if(fl){let m={};try{m=JSON.parse(fl.dataset.fill);}catch(_){}for(const k in m){const i=$('#d-'+k,b);if(i)i.value=m[k];}if(fl.dataset.press)press(fl.dataset.press);return;}
      const x=ev.target.closest('[data-b]');if(x)press(x.dataset.b);else if(ev.target===w)done(null);};
    w.onkeydown=ev=>{
      ev.stopPropagation();
      if(ev.key==='Escape'){ev.preventDefault();done(null);}
      else if(ev.key==='Enter'&&ev.target.tagName==='INPUT'){ev.preventDefault();const p=buttons.find(x=>x.primary);if(p)press(p.id);}
    };
    const first=$('input',b)||$('.btn.primary',b);setTimeout(()=>first&&first.focus(),30);
  });
}
async function askText(title,msg,initial=''){
  const r=await showDlg({title,msg:esc(msg),fields:[{id:'t',label:'',value:initial}],buttons:[{id:'cancel',label:'Cancel'},{id:'ok',label:'OK',primary:true}]});
  return r?r.values.t:null;
}
async function askPassword(msg,title='Password needed'){
  const r=await showDlg({title,msg:esc(msg),fields:[{id:'p',label:'Password',type:'password'}],buttons:[{id:'cancel',label:'Cancel'},{id:'ok',label:'Open',primary:true,check:v=>v.p?'':'Type the password.'}]});
  return r?r.values.p:null;
}
async function passwordFlow(){
  if(store.conflict){toast('Resolve the file conflict first.',{warn:true});return;}
  const warn='<b>There is no password reset.</b> If you forget it, the file cannot be opened by anyone, including backups of it. Keep the password somewhere safe.';
  const setCheck=v=>v.a.length<8?'Use at least 8 characters.':(v.a!==v.b?'The two passwords do not match.':'');
  const r=await showDlg({title:store.encrypted?'Change or remove password':'Set a password',msg:warn,
    fields:[{id:'a',label:store.encrypted?'New password':'Password',type:'password'},{id:'b',label:'Repeat it',type:'password'}],
    buttons:[{id:'cancel',label:'Cancel'},...(store.encrypted?[{id:'remove',label:'Remove password'}]:[]),{id:'set',label:store.encrypted?'Change password':'Set password',primary:true,check:setCheck}]});
  if(!r)return;
  const res=await store.host.setPassword(r.button==='remove'?null:r.values.a);
  if(!res.ok){toast((res.error&&res.error.message)||'Could not set the password.',{warn:true});return;}
  store.encrypted=res.encrypted;
  await persist(true);
  toast(res.encrypted?'File encrypted. Backups made before now keep the old protection.':'Password removed. The file is no longer encrypted.',{ms:7000});
  if(!$('#modal').hidden)renderSettings();
}

/* ---------------- start screen ---------------- */
const fmtDate=ms=>{try{return new Date(ms).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});}catch(_){return '';}};
async function showStart(message=''){
  document.body.classList.add('nofile');
  const st=await store.host.status();store.info=st;
  const w=$('#start');w.hidden=false;
  w.innerHTML=`<div class="sbox glass"><div class="logo"><b>ORBWEAVE</b><span>your map</span></div>
    <p class="tag2">Map anything you want to understand: people, ideas, projects, courses, tools, and how they connect. Everything stays in one file on this computer. No account, no network, no AI.</p>
    ${message?`<div class="smsg">${esc(message)}</div>`:''}
    <div class="sbtns"><button class="btn primary" data-s="new">Create a new map…</button><button class="btn" data-s="open">Open a map…</button><button class="btn ghost" data-s="tour">Take the tutorial</button></div>
    ${st.recent.length?`<h4>Recent</h4><div class="recent">${st.recent.map(r=>`<div class="rrow" data-p="${esc(r.path)}"><span class="rn">${r.encrypted?'🔒 ':''}${esc(baseName(r.path))}</span><span class="rp">${esc(r.path)}</span><span class="rd">${esc(fmtDate(r.mtime))}</span><button class="x" data-forget="${esc(r.path)}" title="Remove from this list">✕</button></div>`).join('')}</div>`:''}
    <p class="hint2">You can also drag an .orbweave file onto this window.</p></div>`;
}
$('#start').addEventListener('click',async ev=>{
  const f=ev.target.closest('[data-forget]');
  if(f){ev.stopPropagation();await store.host.forgetRecent(f.dataset.forget);showStart();return;}
  const b=ev.target.closest('[data-s]');
  if(b){if(b.dataset.s==='tour')startTutorial({fromStart:true});else b.dataset.s==='new'?newFlow():openFlow();return;}
  const r=ev.target.closest('.rrow');if(r)openFlow(r.dataset.p);
});

/* ---------------- entering a file ---------------- */
function enterFile(r){
  setImages(r.images||[]);
  store.file=r.file;store.name=baseName(r.file);store.rev=r.rev;store.encrypted=!!r.encrypted;
  store.pending=false;store.conflict=false;
  clearTimeout(commitT);
  loadData(r.model);
  hist=[];hi=-1;focusId=null;hoverId=null;editing=false;overlay=null;pathMode=false;searchHL=null;
  hidden.clear();relOff.clear();onlyStarred=false;viewMinImp=0;viewTags=[];activeLens='all';
  $('#panel').classList.remove('open');document.body.classList.remove('panel');renderOvl();
  setView('map');derive();seedPositions();settle(entries.length?120:10);fitAll(true);
  lastSnap=snapNow();undoStack=[];redoStack=[];
  renderHud();updateNav();updateWelcome();hideConflict();
  document.body.classList.remove('nofile');$('#start').hidden=true;
  setStatus('Opened '+store.name+'.orbweave');
  need=true;
}
async function leaveCurrent(){if(store.file){await flushNowAsync();if(store.conflict&&!confirm('Your latest edits are not saved because the file changed elsewhere. Open another file anyway and lose them?'))return false;}return true;}
async function openFlow(path,{auto=false}={}){
  if(!await leaveCurrent())return false;
  let r=await store.host.open({path}),msg='';
  while(r.needPassword){
    const pw=await askPassword(msg||`“${baseName(r.file)}.orbweave” is password protected.`);
    if(pw==null){if(!store.file)showStart();return false;}
    const file=r.file;r=await store.host.open({path:file,password:pw});
    if(r.error&&r.error.code==='badpassword'){msg='Wrong password. Try again.';r={needPassword:true,file};}
  }
  if(r.canceled)return false;
  if(r.error){
    const m=r.error.message||'Could not open the file.';
    if(!store.file)showStart(m);else toast(m,{warn:true,ms:8000});
    return false;
  }
  enterFile(r);return true;
}
async function newFlow(){
  if(!await leaveCurrent())return;
  const r=await store.host.newFile(emptyModel());
  if(r.canceled)return;
  if(r.error){const m=r.error.message||'Could not create the file.';if(!store.file)showStart(m);else toast(m,{warn:true});return;}
  enterFile(r);
}

/* ---------------- native menu, drag and drop, closing ---------------- */
function menuAction(a){
  if(practice&&a!=='help'){toast('Finish or skip the tutorial first. Nothing in it is saved.',{warn:true});return;}
  if(!store.file&&!['new','open','help','tutorial'].includes(a))return;
  switch(a){
    case 'new':newFlow();break;
    case 'open':openFlow();break;
    case 'save':clearTimeout(commitT);flushSnap();persist().then(()=>{if(!store.pending&&!store.conflict)toast('Saved.',{ms:1500});});break;
    case 'saveas':saveAsCopy();break;
    case 'password':passwordFlow();break;
    case 'help':openHelp();break;
    case 'tutorial':startTutorial();break;
    case 'settings':openSettings(SET.tab);break;
  }
}
function wireHost(){
  store.host.on('menu',menuAction);
  store.host.on('open-path',async p=>{if(practice)await endTutorial();openFlow(p);});
  store.host.on('before-close',async()=>{
    try{await flushNowAsync();}catch(_){}
    if(store.file&&(store.conflict||store.pending)&&!confirm('Your latest edits could not be saved. Quit anyway and lose them?'))return;
    store.host.closeNow();
  });
  addEventListener('dragover',e=>{e.preventDefault();});
  addEventListener('drop',e=>{
    e.preventDefault();
    const f=[...(e.dataTransfer&&e.dataTransfer.files||[])].find(x=>/\.orbweave$/i.test(x.name));
    if(f){const p=store.host.pathForFile(f);if(p)openFlow(p);}
  });
}
