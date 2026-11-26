'use strict';
/* =====================================================================
   ORBWEAVE view: physics, camera, drawing, canvas interaction
   ===================================================================== */
let W=0,H=0,dpr=1;
const cv=$('#cv'),ctx=cv.getContext('2d');
const cam={x:0,y:0,k:1},camT={x:0,y:0,k:1,active:false};
const SX=x=>(x-cam.x)*cam.k+W/2, SY=y=>(y-cam.y)*cam.k+H/2;
const WX=x=>(x-W/2)/cam.k+cam.x, WY=y=>(y-H/2)/cam.k+cam.y;
let dragNode=null;

/* ---------------- physics ---------------- */
function tick(){
  const act=entries.filter(e=>e.vis);const n=act.length;
  if(!n){alpha=0;return;}
  for(let i=0;i<n;i++){
    const a=act[i];
    for(let j=i+1;j<n;j++){
      const b=act[j];
      let dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy;
      if(d2>640000)continue;
      if(d2<1){dx=Math.random()-.5;dy=Math.random()-.5;d2=1;}
      const d=Math.sqrt(d2);let f=950/d;
      const md=a.r+b.r+32;if(d<md)f+=(md-d)*0.6;
      f*=alpha;const fx=dx/d*f,fy=dy/d*f;
      a.vx+=fx;a.vy+=fy;b.vx-=fx;b.vy-=fy;
    }
  }
  for(const x of derived.edges){
    if(!x.vis)continue;
    const a=byId.get(x.a),b=byId.get(x.b);
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.sqrt(dx*dx+dy*dy)||1;
    const L=x.kind==='link'?135:185,k=(x.kind==='link'?0.09:0.04)/Math.sqrt(Math.max(1,Math.min(a.deg,b.deg)));
    const f=(d-L)*k*alpha,fx=dx/d*f,fy=dy/d*f;
    a.vx+=fx;a.vy+=fy;b.vx-=fx;b.vy-=fy;
  }
  for(const e of act){
    e.vx-=e.x*0.011*alpha;e.vy-=e.y*0.011*alpha;
    if(e.pinned||e===dragNode){e.vx=e.vy=0;continue;}
    e.vx*=0.78;e.vy*=0.78;
    const v=Math.hypot(e.vx,e.vy);if(v>40){e.vx*=40/v;e.vy*=40/v;}
    e.x+=e.vx;e.y+=e.vy;
  }
  alpha*=0.992;
  if(alpha<0.004){alpha=0;persistSoon();}
}
const reheat=(a=.6)=>{alpha=Math.max(alpha,a);need=true;};
function seedPositions(){
  let i=0;
  for(const e of entries){
    if(Number.isFinite(e.x)&&Number.isFinite(e.y)){i++;continue;}
    const ang=i*2.399,rad=34*Math.sqrt(i+1)*2.4;
    e.x=Math.cos(ang)*rad;e.y=Math.sin(ang)*rad;i++;
  }
}
function settle(n=500){alpha=1;for(let i=0;i<n&&alpha>0;i++)tick();alpha=0;}

/* ---------------- camera ---------------- */
const panelPad=()=>$('#panel').classList.contains('open')?Math.min(424,W):0;
const padL=()=>W>900?252:0;
function target(px,py,k,pad){camT.k=k;camT.x=px+(pad-padL())/(2*k);camT.y=py;camT.active=true;need=true;}
function bbox(list){
  let a=1e9,b=1e9,c=-1e9,d=-1e9;
  for(const e of list){a=Math.min(a,e.x-e.r);b=Math.min(b,e.y-e.r);c=Math.max(c,e.x+e.r);d=Math.max(d,e.y+e.r);}
  return {minx:a,miny:b,maxx:c,maxy:d};
}
function fitBox(bb,pad,maxK=1.8,instant=false){
  const aw=Math.max(200,W-pad-padL()-140),ah=Math.max(200,H-300);
  const bw=Math.max(90,bb.maxx-bb.minx),bh=Math.max(90,bb.maxy-bb.miny);
  const k=Math.max(0.2,Math.min(maxK,aw/bw,ah/bh));
  target((bb.minx+bb.maxx)/2,(bb.miny+bb.maxy)/2,k,pad);
  if(instant){cam.x=camT.x;cam.y=camT.y;cam.k=camT.k;camT.active=false;}
}
function fitAll(instant=false){
  const vis=entries.filter(e=>e.vis);
  if(!vis.length){cam.x=cam.y=0;cam.k=1;camT.active=false;need=true;return;}
  fitBox(bbox(vis),panelPad(),1.4,instant);
}
function flyToFocus(){
  const e=byId.get(focusId);if(!e)return;
  const pts=[e];
  for(const id of derived.adj.get(e.id)){const o=byId.get(id);if(o&&o.vis)pts.push(o);}
  if(pts.length===1)target(e.x,e.y,1.5,panelPad());else fitBox(bbox(pts),panelPad(),1.7);
}
function flyToSet(ids){
  const list=[...ids].map(i=>byId.get(i)).filter(e=>e&&e.vis);
  if(list.length)fitBox(bbox(list),panelPad(),1.6);
}
function resize(){dpr=Math.min(window.devicePixelRatio||1,2);W=innerWidth;H=innerHeight;cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);need=true;}

/* ---------------- images ---------------- */
const imgCache=new Map();
function getImg(e){
  if(!e.image)return null;
  const u=imgURL(e.image);if(!u)return null;const key=u.length>300?e.id+'|'+u.length:u;
  let c=imgCache.get(key);
  if(!c){c={img:new Image(),ok:false};c.img.onload=()=>{c.ok=true;need=true;};c.img.onerror=()=>{c.err=true;};c.img.src=u;imgCache.set(key,c);}
  return c.ok?c.img:null;
}

/* ---------------- drawing ---------------- */
const sprites=new Map();
function spriteFor(color){
  let c=sprites.get(color);if(c)return c;
  c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  const gr=g.createRadialGradient(64,64,0,64,64,64);
  gr.addColorStop(0,rgbaOf(color,.5));gr.addColorStop(.3,rgbaOf(color,.17));gr.addColorStop(1,rgbaOf(color,0));
  g.fillStyle=gr;g.fillRect(0,0,128,128);sprites.set(color,c);return c;
}
const stars=Array.from({length:180},()=>({x:Math.random(),y:Math.random(),r:Math.random()*1.2+.25,a:Math.random()*.5+.12,p:Math.random()*.16+.02}));
const FONT='"Segoe UI Variable Text","Segoe UI",-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,system-ui,sans-serif';

function poly(c,x,y,r,n,off){for(let i=0;i<n;i++){const a=i*TAU/n+off,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?c.lineTo(px,py):c.moveTo(px,py);}c.closePath();}
function shapePath(c,shape,x,y,R){
  c.beginPath();
  switch(shape){
    case 'square':{const r=R*.92;if(c.roundRect)c.roundRect(x-r,y-r,2*r,2*r,r*.34);else c.rect(x-r,y-r,2*r,2*r);break;}
    case 'diamond':{const r=R*1.2;c.moveTo(x,y-r);c.lineTo(x+r,y);c.lineTo(x,y+r);c.lineTo(x-r,y);c.closePath();break;}
    case 'hexagon':poly(c,x,y,R*1.08,6,Math.PI/6);break;
    case 'octagon':poly(c,x,y,R*1.07,8,TAU/16);break;
    case 'triangle':poly(c,x,y+R*.14,R*1.3,3,-Math.PI/2);break;
    case 'star':{for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=(i%2?R*.58:R*1.32),px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?c.lineTo(px,py):c.moveTo(px,py);}c.closePath();break;}
    default:c.arc(x,y,R,0,TAU);
  }
}
const statusClass=e=>{const s=e.status.toLowerCase();return /archiv|cancel|dropped|deprecat|retire|obsolete|sunset/.test(s)?'old':(/idea|to do|todo|plan|propos|upcoming|in progress|pilot|draft|on hold/.test(s)?'plan':'');};
const edgeText=x=>{
  let s=x.kind==='link'?[x.data,x.freq].filter(Boolean).join(' · '):'';
  if(!s)s=x.note;if(!s)s=R(x.rel).name;return s;
};
function currentHL(){
  if(overlay)return {set:overlay.nodes,mode:'overlay'};
  if(searchHL)return {set:searchHL,mode:'search'};
  if(focusId&&byId.has(focusId)){const s=new Set(derived.adj.get(focusId));s.add(focusId);return {set:s,mode:'focus'};}
  if(hoverId&&byId.has(hoverId)){const s=new Set(derived.adj.get(hoverId));s.add(hoverId);return {set:s,mode:'hover'};}
  return null;
}
let hasFlow=false;
function paintNode(n,a,t){
  const {e,x,y,R}=n,tp=T(e),colr=tp.color;
  ctx.globalAlpha=a;
  const gs=R*5.2;ctx.drawImage(spriteFor(colr),x-gs/2,y-gs/2,gs,gs);
  shapePath(ctx,tp.shape,x,y,R);ctx.fillStyle='#090e20';ctx.fill();
  const img=getImg(e);
  if(img){
    ctx.save();shapePath(ctx,tp.shape,x,y,R);ctx.clip();
    const s=Math.max(2*R/img.width,2*R/img.height)*1.04;
    ctx.drawImage(img,x-img.width*s/2,y-img.height*s/2,img.width*s,img.height*s);ctx.restore();
  }
  const sc=statusClass(e);
  shapePath(ctx,tp.shape,x,y,R);
  ctx.lineWidth=Math.max(1.6,R*.14);ctx.strokeStyle=rgbaOf(colr,sc==='old'?.55:1);
  if(sc==='old')ctx.setLineDash([R*.5,R*.35]);else if(sc==='plan')ctx.setLineDash([2,R*.4]);
  ctx.stroke();ctx.setLineDash([]);
  if(!img){
    if(tp.glyph){ctx.fillStyle=colr;ctx.font=`${Math.round(R*1.05)}px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(tp.glyph,x,y+R*.05);}
    else{ctx.beginPath();ctx.arc(x,y,R*.4,0,TAU);ctx.fillStyle=rgbaOf(colr,.92);ctx.fill();}
  }
  if(e.starred&&R>6){
    ctx.beginPath();for(let i=0;i<10;i++){const aa=-Math.PI/2+i*Math.PI/5,r=(i%2?2.4:5.6),px=x+R*.85+Math.cos(aa)*r,py=y-R*.85+Math.sin(aa)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();
    ctx.fillStyle='#ffd166';ctx.strokeStyle='#05070f';ctx.lineWidth=1.2;ctx.stroke();ctx.fill();
  }
  if(e.conf==='unsure'&&R>8){ctx.beginPath();ctx.arc(x+R*.85,y+R*.85,4.4,0,TAU);ctx.fillStyle='#ffb86b';ctx.fill();ctx.fillStyle='#1a1205';ctx.font=`700 7px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('?',x+R*.85,y+R*.85+.3);}
  if(e.pinned&&R>6){ctx.beginPath();ctx.arc(x-R*.85,y-R*.85,2.2,0,TAU);ctx.fillStyle='#fff';ctx.fill();}
}
function draw(t){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const bg=ctx.createRadialGradient(W*.5,H*.42,0,W*.5,H*.42,Math.max(W,H)*.8);
  bg.addColorStop(0,'#111a3b');bg.addColorStop(.55,'#080c1d');bg.addColorStop(1,'#04060d');
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  for(const s of stars){
    const px=(((s.x*W-cam.x*cam.k*s.p)%W)+W)%W,py=(((s.y*H-cam.y*cam.k*s.p)%H)+H)%H;
    ctx.globalAlpha=s.a;ctx.fillStyle='#cfd9ff';ctx.beginPath();ctx.arc(px,py,s.r,0,TAU);ctx.fill();
  }
  ctx.globalAlpha=1;
  const hl=currentHL();hasFlow=false;
  ctx.lineCap='round';
  for(const x of derived.edges){
    if(!x.vis)continue;
    const A=byId.get(x.a),B=byId.get(x.b);
    const ax=SX(A.x),ay=SY(A.y),bx=SX(B.x),by=SY(B.y);
    if((ax<-60&&bx<-60)||(ax>W+60&&bx>W+60)||(ay<-60&&by<-60)||(ay>H+60&&by>H+60))continue;
    let al=x.kind==='link'?.55:.24,emph=false;
    if(hl){
      let inc;
      if(hl.mode==='overlay')inc=overlay.edges.has(x.id);
      else if(hl.mode==='search')inc=hl.set.has(A.id)&&hl.set.has(B.id);
      else if(hl.mode==='focus')inc=A.id===focusId||B.id===focusId;
      else inc=A.id===hoverId||B.id===hoverId;
      const both=hl.set.has(A.id)&&hl.set.has(B.id);
      if(inc){al=x.kind==='link'?.95:.7;emph=true;}else if(both&&(hl.mode==='focus'||hl.mode==='hover'))al=.16;else al=.035;
    }
    const dx=bx-ax,dy=by-ay,L=Math.hypot(dx,dy)||1;
    const sign=x.a<x.b?1:-1,cu=(x.pn===1?.1:(x.pi-(x.pn-1)/2)*.2)*sign;
    const cx=(ax+bx)/2-dy*cu,cy=(ay+by)/2+dx*cu;
    const col=x.color;
    if(overlay&&emph){ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo(cx,cy,bx,by);ctx.strokeStyle=rgbaOf(col,.22);ctx.lineWidth=9;ctx.setLineDash([]);ctx.stroke();}
    ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo(cx,cy,bx,by);
    if(x.kind==='link'){
      ctx.strokeStyle=rgbaOf(col,al);ctx.lineWidth=Math.max(1,Math.min(2.4,1.7*Math.sqrt(cam.k)))*(emph?1.3:1);ctx.setLineDash([]);ctx.stroke();
      if(!x.sym){
        const tt=Math.max(.3,Math.min(.95,1-(B.r*Math.max(.35,Math.min(2.2,cam.k))+6)/L));
        const px=(1-tt)*(1-tt)*ax+2*(1-tt)*tt*cx+tt*tt*bx,py=(1-tt)*(1-tt)*ay+2*(1-tt)*tt*cy+tt*tt*by;
        const tx=2*(1-tt)*(cx-ax)+2*tt*(bx-cx),ty=2*(1-tt)*(cy-ay)+2*tt*(by-cy),tl=Math.hypot(tx,ty)||1,ux=tx/tl,uy=ty/tl;
        const sz=5+Math.min(4,cam.k*2.4);
        ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-ux*sz-uy*sz*.55,py-uy*sz+ux*sz*.55);ctx.lineTo(px-ux*sz+uy*sz*.55,py-uy*sz-ux*sz*.55);ctx.closePath();
        ctx.fillStyle=rgbaOf(col,Math.min(1,al+.1));ctx.fill();
      }
      if(x.flow&&al>.2){
        hasFlow=true;
        for(let i=0;i<3;i++){
          const tt=((t/(2800+L*3))+i/3+(x.pi||0)*.17)%1,u=1-tt;
          const px=u*u*ax+2*u*tt*cx+tt*tt*bx,py=u*u*ay+2*u*tt*cy+tt*tt*by;
          ctx.beginPath();ctx.arc(px,py,emph?2.8:2.1,0,TAU);ctx.fillStyle=rgbaOf('#ffffff',Math.min(.95,al+.1));ctx.fill();
        }
      }
    }else{
      ctx.strokeStyle=`rgba(175,190,235,${al})`;ctx.lineWidth=1;ctx.setLineDash([3,6]);ctx.stroke();ctx.setLineDash([]);
    }
    if(x.kind==='link'&&al>.3&&(emph||(cam.k>1.6&&(x.note||x.data)))){
      const txt=edgeText(x),mx=(ax+2*cx+bx)/4,my=(ay+2*cy+by)/4;
      ctx.font=`11.5px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';
      const w=Math.min(260,ctx.measureText(txt).width)+14;
      ctx.fillStyle='rgba(8,12,28,.9)';ctx.beginPath();if(ctx.roundRect)ctx.roundRect(mx-w/2,my-9,w,18,9);else ctx.rect(mx-w/2,my-9,w,18);ctx.fill();
      ctx.strokeStyle=rgbaOf(col,.5);ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle='#d6def8';let tt=txt;while(ctx.measureText(tt).width>w-12&&tt.length>4)tt=tt.slice(0,-2);if(tt!==txt)tt+='…';ctx.fillText(tt,mx,my+.5);
    }
  }
  /* nodes */
  const dimA=!hl?1:(hl.mode==='hover'?.32:.13);
  const bright=[],dim=[];
  for(const e of entries){
    if(!e.vis)continue;
    const x=SX(e.x),y=SY(e.y),Rr=e.r*Math.max(.35,Math.min(2.2,cam.k));
    if(x<-130||x>W+130||y<-130||y>H+130)continue;
    (hl&&!hl.set.has(e.id)?dim:bright).push({e,x,y,R:Rr});
  }
  for(const n of dim)paintNode(n,dimA,t);
  for(const n of bright)paintNode(n,1,t);
  if(focusId&&byId.has(focusId)&&byId.get(focusId).vis){
    const e=byId.get(focusId),x=SX(e.x),y=SY(e.y),Rr=e.r*Math.max(.35,Math.min(2.2,cam.k)),p=(t/1700)%1,col=nodeColor(e);
    ctx.globalAlpha=(1-p)*.7;ctx.lineWidth=1.5;ctx.strokeStyle=col;ctx.beginPath();ctx.arc(x,y,Rr*1.5+p*Rr*1.6,0,TAU);ctx.stroke();
    ctx.globalAlpha=.9;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,Rr*1.45,0,TAU);ctx.stroke();
  }
  ctx.globalAlpha=1;
  /* labels */
  ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.lineJoin='round';
  const many=entries.length>80;
  const drawLabel=({e,x,y,R:Rr},a)=>{
    const isF=e.id===focusId,isH=e.id===hoverId,inSet=hl&&hl.set.has(e.id);
    const show=isF||isH||(inSet&&hl.mode!=='hover')||cam.k>=.72||e.deg>=3||Rr>=15||!many;
    if(!show)return;
    const fs=isF?15:(inSet||isH?13:12.5);
    ctx.font=`${isF?600:500} ${fs}px ${FONT}`;
    let tx=label(e);if(tx.length>28)tx=tx.slice(0,27)+'…';
    const ty=y+Rr+fs+4;
    ctx.globalAlpha=a;ctx.lineWidth=4;ctx.strokeStyle='rgba(4,6,13,.92)';ctx.strokeText(tx,x,ty);
    ctx.fillStyle=isF?'#fff':'#dfe6fb';ctx.fillText(tx,x,ty);
    if(e.full&&(isF||isH||(cam.k>1.25&&a>.5))){
      let f=e.full;if(f.length>34)f=f.slice(0,33)+'…';
      ctx.font=`11px ${FONT}`;ctx.lineWidth=3.5;ctx.strokeText(f,x,ty+14);ctx.fillStyle='#8b97ba';ctx.fillText(f,x,ty+14);
    }
  };
  for(const n of dim)drawLabel(n,hl&&hl.mode==='hover'?.45:.28);
  for(const n of bright)drawLabel(n,1);
  ctx.globalAlpha=1;
}

/* ---------------- canvas interaction ---------------- */
let down=null;
const pos=ev=>{const r=cv.getBoundingClientRect();return {x:ev.clientX-r.left,y:ev.clientY-r.top};};
function nodeAt(px,py){
  let best=null,bd=1e9;
  for(const e of entries){
    if(!e.vis)continue;
    const Rr=e.r*Math.max(.35,Math.min(2.2,cam.k))+5,dx=SX(e.x)-px,dy=SY(e.y)-py,d=dx*dx+dy*dy;
    if(d<=Rr*Rr&&d<bd){bd=d;best=e;}
  }
  return best;
}
cv.addEventListener('pointerdown',ev=>{
  if(ev.button!==0)return;
  cv.setPointerCapture(ev.pointerId);
  const p=pos(ev),hit=nodeAt(p.x,p.y);
  down={x:p.x,y:p.y,hit,moved:false,cx:cam.x,cy:cam.y,ox:hit?WX(p.x)-hit.x:0,oy:hit?WY(p.y)-hit.y:0};
  camT.active=false;hideTip();
});
cv.addEventListener('pointermove',ev=>{
  const p=pos(ev);
  if(down){
    if(!down.moved&&Math.hypot(p.x-down.x,p.y-down.y)>4){down.moved=true;cv.classList.add('dragging');if(down.hit)dragNode=down.hit;}
    if(down.moved){
      if(dragNode){dragNode.x=WX(p.x)-down.ox;dragNode.y=WY(p.y)-down.oy;dragNode.pinned=true;reheat(.35);}
      else{cam.x=down.cx-(p.x-down.x)/cam.k;cam.y=down.cy-(p.y-down.y)/cam.k;need=true;}
    }
    return;
  }
  const h=nodeAt(p.x,p.y),id=h?h.id:null;
  if(id!==hoverId){hoverId=id;cv.classList.toggle('over',!!id);need=true;}
  if(h)showTip(h,ev.clientX,ev.clientY);else hideTip();
});
cv.addEventListener('pointerup',()=>{
  if(!down)return;
  cv.classList.remove('dragging');
  const d=down;down=null;
  if(!d.moved){
    if(d.hit)focus(d.hit.id);
    else if(overlay)clearOverlay();
    else if(focusId)unfocus();
  }else if(dragNode){
    const dn=dragNode;dragNode=null;touch(dn);commit();
    if(focusId===dn.id&&editing)renderPanel();
  }
});
cv.addEventListener('pointerleave',()=>{if(!down){hoverId=null;hideTip();need=true;}});
cv.addEventListener('dblclick',async ev=>{
  const p=pos(ev);if(nodeAt(p.x,p.y))return;
  const e=await newEntry({name:'New entry',x:WX(p.x),y:WY(p.y),pinned:true},{edit:true});
  if(e)setTimeout(()=>{const f=$('#f-name');if(f){f.focus();f.select();}},60);
});
cv.addEventListener('wheel',ev=>{
  ev.preventDefault();
  const p=pos(ev),wxp=WX(p.x),wyp=WY(p.y);
  const k=Math.min(4,Math.max(.12,cam.k*Math.exp(-ev.deltaY*(ev.ctrlKey?.01:.0016))));
  cam.k=k;cam.x=wxp-(p.x-W/2)/k;cam.y=wyp-(p.y-H/2)/k;camT.active=false;need=true;
},{passive:false});
cv.addEventListener('dragover',ev=>{ev.preventDefault();});
cv.addEventListener('drop',ev=>{
  ev.preventDefault();
  const f=ev.dataTransfer&&ev.dataTransfer.files&&ev.dataTransfer.files[0];if(!f)return;
  const p=pos(ev),hit=nodeAt(p.x,p.y);
  if(!hit){toast('Drop the picture onto a node.');return;}
  setNodeImage(hit,f);
});

const tip=$('#tip');
function showTip(e,mx,my){
  if(e.id===focusId){hideTip();return;}
  const d=(e.summary||e.desc).replace(/\s+/g,' ').trim(),u=imgURL(e.image);
  tip.innerHTML=(u?`<img src="${esc(u)}" alt="">`:'')+`<span class="pill" style="--c:${nodeColor(e)}"><i></i>${esc(T(e).name)}</span><b>${esc(label(e))}</b>${e.full?`<div class="s">${esc(e.full)}</div>`:''}${d?`<div class="d">${esc(d.length>130?d.slice(0,129)+'…':d)}</div>`:''}<div class="d">${e.deg} connection${e.deg===1?'':'s'}</div>`;
  tip.style.opacity=1;
  const w=tip.offsetWidth,h=tip.offsetHeight;
  tip.style.left=Math.max(8,Math.min(W-w-12,mx+18))+'px';tip.style.top=Math.max(8,Math.min(H-h-12,my+16))+'px';
}
function hideTip(){tip.style.opacity=0;}

/* ---------------- main loop ---------------- */
let lastT=0,lastDraw=0;
function frame(t){
  const dt=Math.min(.05,(t-lastT)/1000||.016);lastT=t;
  let busy=false;
  if(alpha>0){const n=entries.length<150?2:1;for(let i=0;i<n&&alpha>0;i++)tick();busy=true;}
  if(camT.active){
    const f=1-Math.exp(-dt*7),dx=camT.x-cam.x,dy=camT.y-cam.y,lk=Math.log(camT.k/cam.k);
    cam.x+=dx*f;cam.y+=dy*f;cam.k*=Math.exp(lk*f);
    if(Math.abs(dx)*cam.k<.4&&Math.abs(dy)*cam.k<.4&&Math.abs(lk)<.002){cam.x=camT.x;cam.y=camT.y;cam.k=camT.k;camT.active=false;}
    busy=true;
  }
  if(viewMode==='map'){
    const anim=focusId||hasFlow;
    if(busy||need||(anim&&t-lastDraw>(busy?0:30))){draw(t);need=false;lastDraw=t;}
  }
  requestAnimationFrame(frame);
}
