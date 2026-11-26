'use strict';
/* =====================================================================
   ORBWEAVE sample map: a small, made-up study group and project.
   Used by the tutorial's practice map and by "Add the sample map".
   Everything in it is fictional and tagged "sample" so it can be removed.
   ===================================================================== */
function sampleModel(){
  const F=(label,kind='text',options='')=>({label,kind,options});
  const mkType=(id,name,shape,color,fields)=>({id:'sx-'+id,name,shape,color,fields:fields.map((f,i)=>Object.assign({key:'sxf'+i},f))});
  const types=[
    mkType('person','Person','circle','#ff7eb6',[F('Role'),F('Email')]),
    mkType('course','Course','diamond','#b79cff',[F('Teacher'),F('Semester')]),
    mkType('project','Project','triangle','#ff8a5c',[F('Deadline','date'),F('Goal')]),
    mkType('task','Task','square','#4cc9f0',[F('Deadline','date'),F('Owner')]),
    mkType('term','Term','circle','#ffd166',[F('Meaning in context','longtext')]),
    mkType('tool','Tool','octagon','#5eeb9b',[F('Link')]),
    mkType('idea','Idea','star','#7be0c3',[])
  ];
  const relations=[
    {id:'sx-leads',name:'leads',inverse:'is led by',color:'#ff7eb6'},
    {id:'sx-partof',name:'is part of',inverse:'contains',color:'#a8b3cf'},
    {id:'sx-needs',name:'needs',inverse:'is needed by',color:'#ff6b6b'},
    {id:'sx-hands',name:'hands over to',inverse:'receives from',color:'#4cc9f0',flow:true},
    {id:'sx-owns',name:'is responsible for',inverse:'is looked after by',color:'#9ad06b'},
    {id:'sx-explains',name:'explains',inverse:'is explained by',color:'#ffd166'},
    {id:'sx-with',name:'works with',sym:true,color:'#b79cff'}
  ];
  let n=0;
  const E=(id,type,name,summary,desc,links=[],x={})=>Object.assign({id:'sx-e-'+id,type:'sx-'+type,name,summary,desc,tags:['sample'],
    links:links.map(([to,rel,o])=>Object.assign({id:'sx-l-'+(++n),to:'sx-e-'+to,rel:'sx-'+rel},o||{}))},x);
  const entries=[
    E('maya','person','Maya','Leads the group project.','Maya organises the Group Project, keeps the Shared Drive tidy and works with Jordan every week.',
      [['proj','leads'],['jordan','with'],['drive','owns']],{custom:{sxf0:'Group lead'},starred:true,importance:2}),
    E('jordan','person','Jordan','Writes the draft.','Jordan is responsible for the Draft and for the Review, and works with Priya on the Research.',
      [['draft','owns'],['review','owns'],['priya','with']],{custom:{sxf0:'Writer'}}),
    E('priya','person','Priya','Finds the sources.','Priya does the Research and shares every source in the Shared Drive.',[['research','owns'],['drive','owns']],{custom:{sxf0:'Researcher'}}),
    E('proj','project','Group Project','A short report on renewable energy.','The report is part of Sustainability 201. It needs a clear Thesis statement before the Draft can start, and it uses the Shared Drive.',
      [['course','partof'],['thesis','needs'],['drive','needs']],{status:'In progress',importance:3,custom:{sxf1:'A clear, well-sourced 10-page report'},starred:true}),
    E('course','course','Sustainability 201','The course the project belongs to.','Taught by Dr. Okafor. The Group Project counts for 30% of the grade.',[],{custom:{sxf0:'Dr. Okafor',sxf1:'Semester 2'}}),
    E('research','task','Research','Collect and read the sources.','First step. Hands the collected sources to the Draft.',[['draft','hands',{data:'Sources and notes',method:'Shared Drive',freq:'Once'}],['proj','partof']],{status:'Done'}),
    E('draft','task','Draft','Write the first full version.','Built around the Thesis statement. Hands the finished text to the Review.',[['review','hands',{data:'Draft text',method:'Shared Drive',freq:'Once'}],['proj','partof']],{status:'In progress'}),
    E('review','task','Review','Read, fix and polish.','The whole group reads the Draft and sends fixes back. Then it goes to Submit.',[['submit','hands',{data:'Final text',method:'Shared Drive',freq:'Once'}],['proj','partof']],{status:'To do'}),
    E('submit','task','Submit','Hand it in on time.','Upload the final report before the deadline.',[['proj','partof']],{status:'To do'}),
    E('thesis','term','Thesis statement','The one sentence the whole report argues.','Everything in the Draft should support it. Maya checks it with Dr. Okafor.',[],{full:'Thesis statement',custom:{sxf0:'In essays and reports'},aliases:['thesis']}),
    E('drive','tool','Shared Drive','Where every file lives.','All sources and drafts are kept here so nothing gets lost.',[],{custom:{sxf0:'(your link here)'}}),
    E('idea','idea','Interview a local engineer','Maybe add a quote from an expert.','Could make the Draft stronger. Ask Maya if there is time.',[['draft','explains']],{status:'Idea'})
  ];
  const lenses=[{id:'sx-v-work',name:'Just the work',hiddenTypes:['sx-person','sx-course','sx-term','sx-tool','sx-idea'],hiddenRels:[],mentions:false}];
  return {app:'orbweave',v:1,types,relations,lenses,entries};
}

function loadSample(){
  if(practice){toast('Not available in the practice map.',{warn:true});return;}
  if(entries.some(e=>e.id.startsWith('sx-e-'))){toast('The sample map is already here. Use “Remove sample entries” in Settings to clear it.');return;}
  const m=sampleModel(),tmap=new Map(),rmap=new Map();
  for(const t of m.types){
    const ex=types.find(x=>x.name.toLowerCase()===t.name.toLowerCase());
    if(ex)tmap.set(t.id,ex.id);else{const nt=normType(t);types.push(nt);tmap.set(t.id,nt.id);}
  }
  for(const r of m.relations){
    const ex=relations.find(x=>x.name.toLowerCase()===r.name.toLowerCase()&&!!x.sym===!!r.sym);
    if(ex)rmap.set(r.id,ex.id);else{const nr=normRel(r);relations.push(nr);rmap.set(r.id,nr.id);}
  }
  for(const v of m.lenses)lenses.push(normLens(Object.assign({},v,{hiddenTypes:v.hiddenTypes.map(t=>tmap.get(t)||t)})));
  const ex=m.entries.map(e=>mk(Object.assign({},e,{type:tmap.get(e.type)||e.type,links:e.links.map(l=>Object.assign({},l,{rel:rmap.get(l.rel)||l.rel}))})));
  entries=entries.concat(ex);reindex();seedPositions();derive();settle();fitAll(true);commit();renderHud();
  if(!$('#modal').hidden)renderSettings();
  toast('Sample map added. Everything in it is tagged “sample”.');
}
function removeSample(){
  const n=entries.filter(e=>e.tags.includes('sample')).length;
  if(!n){toast('There are no sample entries here.');return;}
  if(!confirm(`Remove ${n} sample entries? Your own entries are not touched.`))return;
  entries=entries.filter(e=>!e.tags.includes('sample'));
  for(const o of entries)o.links=o.links.filter(l=>entries.some(x=>x.id===l.to));
  const usedT=new Set(entries.map(e=>e.type)),usedR=new Set(entries.flatMap(e=>e.links.map(l=>l.rel)));
  types=types.filter(t=>!t.id.startsWith('sx-')||usedT.has(t.id));
  relations=relations.filter(r=>!r.id.startsWith('sx-')||usedR.has(r.id));
  lenses=lenses.filter(v=>!v.id.startsWith('sx-'));
  if(!lenses.some(v=>v.id===activeLens)&&!BUILTIN_LENSES.some(v=>v.id===activeLens))activeLens='all';
  reindex();derive();clearOverlay();unfocus();commit();renderHud();if(!$('#modal').hidden)renderSettings();
}
