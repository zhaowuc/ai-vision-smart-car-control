'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('../src/session-core.js');
const M=require('../src/core.js');
const UI=require('../src/session-ui.js');

function harness(restored){
  let ms=0,id=0,saves=0,saveOK=true,raw='requested',ready=true,draw=null,modal='',closed=0;
  const rafs=new Map(),nodes=new Map(),listeners=new Map(),validatedPhases=new Set();
  function element(){const events={};return {textContent:'',innerHTML:'',value:'',events,dataset:{},classList:{add(){},remove(){},contains(){return true}},addEventListener(k,f){(events[k]??=[]).push(f);},removeEventListener(k,f){events[k]=events[k]?.filter(x=>x!==f);},fire(k,e={}){for(const f of events[k]||[])f({preventDefault(){},...e});},click(){}};}
  const doc={pointerLockElement:null,getElementById(k){if(!nodes.has(k))nodes.set(k,element());return nodes.get(k);},addEventListener(k,f){if(!listeners.has(k))listeners.set(k,[]);listeners.get(k).push(f);},removeEventListener(k,f){listeners.set(k,listeners.get(k).filter(x=>x!==f));}};
  const arena=element(),env={ua:'test',dpr:1,w:1280,h:720};
  const data=restored||{settings:{dpi:1600,baseCm:75.2,swipe:20,swipeEstimated:true,fov:100,fovType:'horizontal',weights:[.25,.25,.25,.25],margin:.03,taskDrop:.1,accDrop:.05,maxEffort:5},calibration:{ok:true,raw:'requested',ux:600,uy:600,dpi:1600,env:{...env}},singleStudies:[],singleActive:null,parameterSources:{baseCm:'用户当前填写'}};
  let app;
  const bridge={S,M,document:doc,getData:()=>data,clock:{now:()=>ms,wall:()=>1760000000000+ms,raf:f=>{rafs.set(++id,f);return id;},caf:i=>rafs.delete(i)},save(){saves++;const current=data.singleStudies.find(s=>s.id===data.singleActive);if(current&&!validatedPhases.has(current.runtime.phase)){S.validateStudy(JSON.parse(JSON.stringify(current)));validatedPhases.add(current.runtime.phase);}return saveOK;},calibrationStatus:()=>({ready,title:ready?'可用':'缺少校准'}),getEnv:()=>({...env}),inputCompatible:(a,b)=>a.ua===b.ua&&a.dpr===b.dpr,getRawMode:()=>raw,getArena:()=>arena,ctx:{},stage:element(),openStage(){},closeStage(){closed++;app.pause('用户返回');},modal:s=>{modal=s;},hideModal(){modal='';},toast(){},requestLock(){doc.pointerLockElement=arena;app.onLocked();},releaseLock(){doc.pointerLockElement=null;},drawScene(ctx,w,h,y,p,target,radius){draw={y,p,target,radius};},actualHFov:()=>100,go(){},fmt:(x,n=2)=>Number.isFinite(x)?x.toFixed(n):'—',esc:String,uid:()=>`test-${id}`,exportJSON(){},adoptCm(){}};
  app=UI.create(bridge);
  const h={app,data,doc,arena,env,nodes,bridge,get modal(){return modal;},get saves(){return saves;},get closed(){return closed;},get draw(){return draw;},set saveOK(v){saveOK=v;},set raw(v){raw=v;},set ready(v){ready=v;},validatedPhases,get pending(){return rafs.size;},get callbacks(){return [...rafs.values()];},get ms(){return ms;},get s(){return app.activeStudy();},move(dx,dy){for(const f of listeners.get('mousemove')||[])f({movementX:dx,movementY:dy});},step(dt=50){ms+=dt;const batch=[...rafs];rafs.clear();for(const [,f]of batch)f(ms);},jump(dt){ms+=dt;},start(mode='20min'){assert.equal(app.start(mode),true);app.requestLock();},aim(){if(!draw?.target||!app.isActive())return;const s=app.activeStudy(),r=s.runtime,g=s.groups[r.groupIndex],cm=r.phase==='familiar'?s.configSnapshot.baseCm:s.candidates.find(c=>c.id===g.candidateId).cm;const ty=Math.atan2(draw.target[0],draw.target[2]),tp=Math.asin(draw.target[1]);let dy=ty-draw.y;dy=Math.atan2(Math.sin(dy),Math.cos(dy));h.move(dy*s.calSnapshot.ux*cm/(2*Math.PI),(draw.p-tp)*s.calSnapshot.uy*cm/(2*Math.PI));arena.fire('mousedown',{button:0});},until(predicate,max=200000){let n=0;while(!predicate()){if(n++>max)throw Error('condition not reached: '+JSON.stringify(h.s?.runtime));h.step();h.aim();}},drive(){let n=0;while(!['done','stopped'].includes(h.s.runtime.phase)){if(n++>50000)throw Error('session did not finish');const r=h.s.runtime;if(r.phase==='rating'){assert.equal(app.rate('3','no'),true);}else if(r.paused){app.resume();app.requestLock();}h.step();h.aim();}return h.s;}};
  return h;
}

for(const [mode,seconds,groups]of [['20min',1200,14],['10min',600,7]])test(`${mode}: actual runtime completes exact planned budget and all fixed 12s tasks`,()=>{
  const h=harness();h.start(mode);const s=h.drive();
  assert.equal(s.groups.length,groups);assert.equal(s.plannedSeconds,seconds);assert.equal(s.timing.plannedElapsedMs,seconds*1000);
  assert.equal(Object.keys(s.results).length,groups);assert.equal(s.runtime.phase,'done');assert.equal(h.pending,0);
  for(const g of s.groups){assert.ok(S.groupComplete(s,g));for(const b of Object.values(s.results[g.id].tasks)){assert.equal(b.duration,12000);assert.equal(b.actualDuration,12000);assert.equal(b.valid,true);assert.equal(b.raw,'requested');}}
  assert.doesNotThrow(()=>S.validateStudy(JSON.parse(JSON.stringify(s))));
  const rendered=h.nodes.get('singleResultsRoot').innerHTML;h.jump(60000);h.app.renderResults();assert.equal(h.nodes.get('singleResultsRoot').innerHTML,rendered,'completed elapsed time stays fixed');
});

test('common familiarization uses baseline and accepts natural diagonal movement',()=>{
  const h=harness();h.start();h.step();h.move(600,300);h.step();assert.ok(Math.abs(h.draw.y-2*Math.PI/75.2)<1e-12);assert.ok(h.draw.p<0);assert.equal(h.s.attempts.length,0);
  assert.equal(h.s.provenance.parameterSources.baseCm,'用户当前填写');h.app.renderLab();assert.match(h.nodes.get('singleLabRoot').innerHTML,/尚余 56 项/);
});

test('rating never guesses answers and its remaining rest pauses without advancing in background',()=>{
  const h=harness();h.start('10min');h.until(()=>h.s.runtime.phase==='rating');
  assert.equal(h.doc.pointerLockElement,null);assert.equal(h.pending,0);assert.equal(h.app.rate('','no'),false);assert.equal(h.app.rate('0',''),false);
  h.jump(2000);assert.equal(h.app.rate('0','no'),true);assert.equal(h.s.runtime.phase,'ratingRest');h.step(50);const elapsed=h.s.runtime.elapsed;
  h.app.pause('用户返回');assert.equal(h.pending,0);h.jump(20000);h.step();assert.equal(h.s.runtime.elapsed,elapsed);assert.equal(h.s.runtime.groupIndex,0);
  h.app.resume();h.until(()=>h.s.runtime.groupIndex===1);assert.equal(h.s.results[h.s.groups[0].id].rating.effort,0);assert.equal(h.s.results[h.s.groups[0].id].rating.pain,false);
});

test('rating time beyond budget counts as extra, not a default-filled rating',()=>{
  const h=harness();h.start('10min');h.until(()=>h.s.runtime.phase==='rating');h.jump(15000);assert.equal(h.s.runtime.phase,'rating');assert.equal(h.app.rate('2','no'),true);assert.equal(h.s.timing.ratingExtraMs,4000);assert.equal(h.s.runtime.groupIndex,1);
});

test('fault retry preserves previous completed tasks and retains only one interrupted attempt',()=>{
  const h=harness();h.start();h.until(()=>h.s.runtime.phase==='task'&&h.s.runtime.taskIndex===1);h.step();const g=h.s.groups[0],saved=structuredClone(h.s.results[g.id].tasks);h.app.pause('失焦');h.app.pause('鼠标锁定丢失');
  assert.equal(h.s.attempts.length,1);assert.deepEqual(h.s.results[g.id].tasks,saved);assert.equal(h.s.runtime.elapsed,0);assert.equal(h.pending,0);h.app.resume();h.app.requestLock();h.until(()=>h.s.runtime.taskIndex===2);assert.equal(Object.keys(h.s.results[g.id].tasks).length,2);
});

test('stored partial task is an interrupted attempt after reload, never a completed score',()=>{
  const h=harness();h.start();h.until(()=>h.s.runtime.phase==='task'&&h.s.runtime.elapsed>=2000);const snapshot=structuredClone(h.data);h.app.dispose();const r=harness(snapshot);
  assert.equal(r.s.attempts.length,1);assert.match(r.s.attempts[0].reason,/刷新/);assert.equal(r.s.runtime.elapsed,0);assert.equal(r.s.runtime.paused,true);assert.equal(Object.keys(r.s.results[r.s.groups[0].id].tasks).length,0);
});

test('long gap preserves prior screen records as history and repeats the entire screen comparison',()=>{
  const h=harness();h.start('10min');h.until(()=>h.s.runtime.phase==='rating');h.app.rate('3','no');h.until(()=>h.s.runtime.groupIndex===1);h.app.requestLock();h.until(()=>h.s.runtime.phase==='task');h.app.pause('用户暂停');h.jump(301000);h.app.resume();
  assert.equal(h.s.runtime.groupIndex,0);assert.equal(h.s.runtime.phase,'adapt');assert.equal(h.s.discardedRounds.length,1);assert.equal(h.s.discardedRounds[0].stage,'screen');assert.ok(Object.keys(h.s.discardedRounds[0].records).length);assert.equal(Object.keys(h.s.results).length,0);
});

test('geometry change preserves physical calibration and redraws comparison as a new audited segment',()=>{
  const h=harness();h.start('10min');h.until(()=>h.s.runtime.phase==='task');const cal=structuredClone(h.data.calibration);h.env.w=1200;h.step();assert.equal(h.s.runtime.paused,true);assert.deepEqual(h.data.calibration,cal);assert.equal(h.s.discardedRounds.length,1);assert.ok(h.s.segments.length>=2);
});

test('missing physical calibration and unconfirmed raw input block formal runtime',()=>{
  const h=harness();h.ready=false;assert.equal(h.app.start('20min'),false);assert.equal(h.data.singleStudies.length,0);h.ready=true;h.raw='fallback';assert.equal(h.app.start('20min'),true);h.app.requestLock();assert.equal(h.app.isActive(),false);assert.equal(h.doc.pointerLockElement,null);assert.match(h.modal,/未确认原始输入/);
});

test('storage failure stops task, retains memory and retries without inventing a completed score',()=>{
  const h=harness();h.start();h.until(()=>h.s.runtime.phase==='task'&&h.s.runtime.elapsed>=500);h.saveOK=false;h.until(()=>h.s.runtime.paused);assert.equal(h.pending,0);assert.equal(h.doc.pointerLockElement,null);assert.match(h.modal,/尚未写入浏览器/);assert.equal(h.s.attempts.length,1);assert.equal(h.s.runtime.elapsed,0);h.saveOK=true;h.app.resume();h.app.requestLock();assert.equal(h.app.isActive(),true);
});

test('extra adaptation is unscored extra time and pain stops with an honest report',()=>{
  const h=harness();h.start('10min');h.app.extend();h.until(()=>h.s.runtime.phase==='adapt');assert.equal(h.s.timing.extraAdaptMs,15000);assert.equal(Object.keys(h.s.results).length,0);h.until(()=>h.s.runtime.phase==='rating');assert.equal(h.app.rate('7','yes'),true);assert.equal(h.s.runtime.phase,'stopped');h.app.renderResults();assert.match(h.nodes.get('singleResultsRoot').innerHTML,/因疼痛或不适停止/);assert.doesNotMatch(h.nodes.get('singleResultsRoot').innerHTML,/证据支持保留/);
});

test('zero hit blocks are preserved with the complete denominator and produce insufficient evidence',()=>{
  const h=harness();h.start('10min');let n=0;while(h.s.runtime.phase!=='done'){if(n++>30000)throw Error('timeout');const r=h.s.runtime;if(r.phase==='rating')h.app.rate('2','no');else if(r.paused){h.app.resume();h.app.requestLock();}h.step();if(r.phase==='familiar')h.move(1,1);}
  for(const g of h.s.groups)for(const [task,b]of Object.entries(h.s.results[g.id].tasks)){assert.equal(b.valid,true);assert.equal(b.duration,12000);if(task!=='track'){assert.equal(b.score,0);assert.equal(b.trials.at(-1).censored,true);if(task!=='turn'){assert.equal(b.timeouts,2);assert.equal(b.trials.at(-1).ms,4000);}}}
  h.app.renderResults();assert.match(h.nodes.get('singleResultsRoot').innerHTML,/本次数据不足/);
});

test('repeating a partially completed paired round preserves audit and exact planned budget',()=>{
  const h=harness();h.start('10min');let n=0;
  while(!(h.s.runtime.phase==='task'&&h.s.groups[h.s.runtime.groupIndex].stage==='retest'&&h.s.runtime.groupIndex===4)){
    if(n++>30000)throw Error('no paired round');const r=h.s.runtime;if(r.phase==='rating')h.app.rate('3','no');else if(r.paused){h.app.resume();h.app.requestLock();}h.step();h.aim();
  }
  h.step();h.app.pause('主动暂停');h.jump(301000);h.app.resume();assert.equal(h.s.runtime.groupIndex,3);assert.equal(h.s.discardedRounds.length,1);assert.equal(h.s.discardedRounds[0].stage,'retest');assert.ok(h.s.timing.faultMs>=70000);assert.doesNotThrow(()=>S.validateStudy(h.s));
  h.app.requestLock();const s=h.drive();assert.equal(s.timing.plannedElapsedMs,600000);assert.equal(s.plannedSeconds,600);assert.doesNotThrow(()=>S.validateStudy(s));
});

test('workspace import recovers interrupted task and keeps storage-failed recovery in memory',()=>{
  const h=harness();h.start();h.until(()=>h.s.runtime.phase==='task'&&h.s.runtime.elapsed>=1000);const snapshot=structuredClone(h.data);Object.assign(h.data,snapshot);h.saveOK=false;h.app.onWorkspaceLoaded();
  assert.equal(h.pending,0);assert.equal(h.s.runtime.elapsed,0);assert.equal(h.s.attempts.length,1);assert.equal(h.s.runtime.engaged,false);assert.match(h.modal,/尚未写入浏览器/);assert.doesNotThrow(()=>S.validateStudy(h.s));
});

test('same-day pain blocks new formal test including legacy field records',()=>{
  const h=harness();h.data.field=[{date:new Date(1760000000000).toISOString(),pain:true}];assert.equal(h.app.start('10min'),false);assert.equal(h.data.singleStudies.length,0);h.data.field=[];h.start('10min');h.until(()=>h.s.runtime.phase==='rating');h.app.rate('6','yes');assert.equal(h.app.start('10min'),false);assert.equal(h.data.singleStudies.length,1);
});

test('completed history is selectable but unfinished experiment cannot be bypassed',()=>{
  const h=harness();h.start('10min');h.drive();const first=h.s.id;assert.equal(h.app.start('10min'),true);const second=h.s.id;assert.notEqual(first,second);assert.equal(h.app.selectHistory(first),false);assert.equal(h.data.singleActive,second);h.app.requestLock();h.drive();assert.equal(h.app.selectHistory(first),true);assert.equal(h.data.singleActive,first);h.app.renderLab();assert.match(h.nodes.get('singleLabRoot').innerHTML,/singleHistory/);
});

test('old RAF callback cannot drive a replacement run and geometry changed while paused forces audit restart',()=>{
  const h=harness();h.start('10min');h.until(()=>h.s.runtime.phase==='task');const old=h.callbacks[0];h.app.pause('失焦');h.app.resume();h.app.requestLock();const elapsed=h.s.runtime.elapsed;old(h.ms+100);assert.equal(h.s.runtime.elapsed,elapsed);assert.equal(h.pending,1);
  h.app.pause('暂停后调整窗口');h.env.w+=100;h.app.resume();h.app.requestLock();assert.equal(h.s.runtime.phase,'adapt');assert.ok(h.s.discardedRounds.length>=1);
});

test('current measured swipe is not relabeled an estimate; saved phases remain import-valid',()=>{
  const h=harness();h.data.settings.swipe=18;h.data.settings.swipeEstimated=false;h.app.renderLab();assert.match(h.nodes.get('singleLabRoot').innerHTML,/18.0 cm（当前填写值/);h.start('10min');h.drive();assert.equal(h.s.provenance.swipeEstimated,false);assert.deepEqual([...h.validatedPhases].sort(),['familiar','adapt','task','transition','rating','ratingRest','stageRest','done'].sort());
});

test('missing movement in the initial check allows a complete new familiarization attempt',()=>{
  const h=harness();h.start('10min');while(!h.s.runtime.paused)h.step();assert.equal(h.s.runtime.phase,'familiar');assert.equal(h.s.runtime.elapsed,0);assert.equal(h.s.timing.faultMs,40000);h.app.resume();h.app.requestLock();h.move(1,1);h.step();h.move(2,2);h.until(()=>h.s.runtime.phase==='adapt');assert.equal(h.s.timing.plannedElapsedMs,40000);
});

test('resume blocks changed current DPI and replacement calibration without altering frozen snapshots',()=>{
  const h=harness();h.start();h.until(()=>h.s.runtime.phase==='task');h.app.pause('用户暂停');const frozen=structuredClone(h.s.calSnapshot);h.data.settings.dpi=800;h.data.calibration={...h.data.calibration,dpi:800,ux:300,uy:300};
  h.app.resume();assert.match(h.modal,/当前声明为 800 DPI/);h.app.requestLock();assert.equal(h.doc.pointerLockElement,null);assert.equal(h.app.isActive(),false);assert.deepEqual(h.s.calSnapshot,frozen);
  h.data.settings.dpi=1600;h.app.resume();h.app.requestLock();assert.equal(h.app.isActive(),true);assert.deepEqual(h.s.calSnapshot,frozen);
});

test('device declaration changes block recovery, while new base/FOV/weights keep the frozen experiment usable',()=>{
  const h=harness();h.data.settings.environment='鼠标A，直连';h.data.calibration.deviceNotes='鼠标A，直连';h.start('10min');h.app.pause('暂停');const config=structuredClone(h.s.configSnapshot);h.data.settings.environment='鼠标B，直连';h.app.resume();assert.match(h.modal,/设备说明或输入路径声明/);h.app.requestLock();assert.equal(h.app.isActive(),false);
  h.data.settings.environment='鼠标A，直连';Object.assign(h.data.settings,{baseCm:60,fov:110,weights:[.4,.2,.2,.2]});h.app.resume();h.app.requestLock();assert.equal(h.app.isActive(),true);assert.deepEqual(h.s.configSnapshot,config);
});

test('physical input guard runs again when an asynchronous lock completes',()=>{
  const h=harness();assert.equal(h.app.start('10min'),true);h.bridge.requestLock=()=>{};h.app.requestLock();h.data.settings.dpi=800;h.doc.pointerLockElement=h.arena;assert.equal(h.app.onLocked(),false);assert.equal(h.doc.pointerLockElement,null);assert.match(h.modal,/物理输入已变化/);
});

test('explicit abandon requires confirmation, retains records and permits a fresh calibrated experiment',()=>{
  const h=harness();h.start('10min');h.until(()=>h.s.runtime.phase==='task'&&h.s.runtime.taskIndex===1);const before=structuredClone(h.s.results),old=h.s;
  h.bridge.confirm=()=>false;assert.equal(h.app.abandon('设备、DPI或输入路径已改变'),false);assert.equal(h.app.isActive(),true);h.bridge.confirm=()=>true;assert.equal(h.app.abandon('设备、DPI或输入路径已改变'),true);assert.equal(old.runtime.phase,'abandoned');assert.equal(old.status,'abandoned');assert.deepEqual(old.results,before);assert.equal(old.attempts.length,1);assert.equal(h.pending,0);assert.doesNotThrow(()=>S.validateStudy(old));assert.match(h.nodes.get('singleResultsRoot').innerHTML,/记录不完整，不作换敏推荐/);assert.equal(S.analyze(old).recommendation.action,'insufficient');
  h.data.settings.dpi=800;Object.assign(h.data.calibration,{dpi:800,ux:300,uy:300});assert.equal(h.app.start('10min'),true);assert.notEqual(h.s.id,old.id);assert.equal(h.data.singleStudies.length,2);assert.equal(old.calSnapshot.dpi,1600);
});

test('failed abandonment save retains export-valid memory and does not claim success',()=>{
  const h=harness();h.start('10min');h.app.pause('暂停');h.bridge.confirm=()=>true;h.saveOK=false;assert.equal(h.app.abandon(),false);assert.equal(h.s.runtime.phase,'abandoned');assert.equal(h.s.runtime.paused,false);assert.match(h.modal,/尚未写入浏览器/);assert.doesNotThrow(()=>S.validateStudy(h.s));assert.equal(h.app.start('10min'),false);h.saveOK=true;h.app.resume();assert.equal(h.closed,1);
});

test('paused rating time is counted once and does not consume the remaining rating/rest budget',()=>{
  const h=harness();h.start('10min');h.until(()=>h.s.runtime.phase==='rating');h.jump(2000);h.app.pause('用户暂停');h.jump(20000);h.app.resume();h.jump(1000);h.app.rate('3','no');const result=h.s.results[h.s.groups[0].id];assert.equal(result.ratingMs,3000);assert.equal(h.s.timing.pauseMs,20000);assert.equal(h.s.timing.ratingExtraMs,0);assert.equal(h.s.runtime.restRemaining,8000);
});

test('restored rating pause does not count offline time as rating overtime',()=>{
  const h=harness();h.start('10min');h.until(()=>h.s.runtime.phase==='rating');h.app.pause('离开网页');const copy=structuredClone(h.data),pausedAt=h.ms;h.app.dispose();const r=harness(copy);r.jump(pausedAt+20000);r.app.resume();r.jump(1000);r.app.rate('3','no');assert.equal(r.s.results[r.s.groups[0].id].ratingMs,1000);assert.equal(r.s.timing.pauseMs,20000);assert.equal(r.s.runtime.restRemaining,10000);
});

test('all rapid formal clicks count as shots even when too early to be accepted as hits',()=>{
  const h=harness();h.start('10min');h.until(()=>h.s.runtime.phase==='task'&&h.s.groups[0].taskOrder[h.s.runtime.taskIndex]!=='track');const g=h.s.groups[0],t=g.taskOrder[h.s.runtime.taskIndex];for(let i=0;i<7;i++)h.arena.fire('mousedown',{button:0});h.until(()=>!!h.s.results[g.id].tasks[t]);const b=h.s.results[g.id].tasks[t];assert.ok(b.shots>=b.hits+7);assert.ok(b.accuracy<1);
});

test('legacy day field takes precedence over old study creation date for same-day pain protection',()=>{
  const h=harness(),today=new Date(1760000000000).toISOString().slice(0,10);h.data.studies=[{created:'2025-01-01',sessions:[{day:today,ratings:{c1:{pain:true}}}]}];assert.equal(h.app.start('10min'),false);h.data.studies=[];h.data.field=[{day:today,pain:true}];assert.equal(h.app.start('10min'),false);
});

test('opening an abandoned record after a long gap never restarts or deletes its comparison round',()=>{
  const h=harness();h.start('10min');h.until(()=>h.s.runtime.phase==='task'&&h.s.runtime.taskIndex===1);h.bridge.confirm=()=>true;h.app.abandon();const previous=structuredClone(h.s);h.jump(400000);h.app.resume();assert.deepEqual(h.s,previous);assert.equal(h.pending,0);assert.doesNotThrow(()=>S.validateStudy(h.s));
});
