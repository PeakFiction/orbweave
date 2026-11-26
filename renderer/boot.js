'use strict';
/* =====================================================================
   ORBWEAVE boot
   ===================================================================== */
addEventListener('resize',()=>{resize();need=true;});
(async function boot(){
  resize();
  if(!store.host){document.body.innerHTML='<p style="padding:40px;color:#ccd">Orbweave must be started as the desktop app.</p>';return;}
  document.body.classList.add('nofile');
  loadData(null);derive();seedPositions();settle(10);fitAll(true);
  requestAnimationFrame(frame);
  wireHost();
  if(store.host.test)window.__orb={get entries(){return entries;},get types(){return types;},get relations(){return relations;},derived:()=>derived,store,cam,addEntry,focus,findMatches,serialize,runTrace,applyLens,openFlow,newFlow,imgs,sampleModel,loadSample,removeSample,startTutorial,endTutorial,askCategory,newEntry,tour:()=>({on:tourOn,step:tourStep,total:TOUR.length}),get practice(){return practice;},get lenses(){return lenses;},get view(){return {hidden,relOff,onlyStarred,viewMinImp,viewTags,activeLens};}};
  const st=await store.host.status();store.info=st;
  if(!st.tutorialDone)await startTutorial({first:true});   // only ever on the very first run
  if(st.pendingOpen)await openFlow(st.pendingOpen);
  else if(st.last)await openFlow(st.last,{auto:true});
  if(!store.file)await showStart();
})();
