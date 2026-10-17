'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('../src/session-core.js');
const config={dpi:1600,baseCm:75.2,fov:100,fovType:'horizontal',swipe:20,swipeEstimated:true,weights:[.25,.25,.25,.25],margin:.03,taskDrop:.10,accDrop:.05,maxEffort:5};
const cal={ok:true,raw:'requested',ux:630,uy:628,dpi:1600,env:{ua:'synthetic',dpr:1,w:1200,h:800}};
const clone=x=>JSON.parse(JSON.stringify(x));
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const create=mode=>S.createStudy({mode:mode||'20min',config,calibration:cal,seed:1776,now:'2026-10-17T08:00:00Z',id:'synthetic',provenance:{swipe:'estimated'}});
function complete(study,group,factor=1,options={}){
  const tasks={},deep=study.mode==='120min',seconds=group.taskSeconds,meta=deep?S.recordMeta(study,group):{};
  for(const task of S.TASKS){const hits=Math.round(seconds*factor),shots=Math.ceil(hits/.8),track=task==='track';tasks[task]={...meta,...(deep?{task,seed:group.seed,coveredMs:track?.4*factor*seconds*1000:0,integratedMs:track?seconds*1000:0}:{}),valid:true,score:track?.4*factor:hits/seconds,accuracy:track?.4*factor:(shots?hits/shots:0),duration:seconds*1000,hits:track?0:hits,shots:track?0:shots,timeouts:0,meanAcquireMs:track?null:800/factor,rmsDeg:track?1:null,raw:'requested',trials:[],trace:[]};}
  study.results[group.id]={...meta,tasks,rating:{...meta,effort:options.effort??3,pain:options.pain??false},completedAt:'2026-10-17T08:01:00Z'};
}
function screened(mode){const study=create(mode),base=study.candidates.find(c=>c.baseline),others=study.candidates.filter(c=>!c.baseline);for(const group of study.groups){const factor=group.candidateId===base.id?1:group.candidateId===others[0].id?1.25:group.candidateId===others[1]?.id?1.1:1;complete(study,group,factor)}return study;}
function retested(mode,factor=1.25){const study=screened(mode);S.freezeRetest(study,{now:'2026-10-17T08:08:00Z'});for(const group of study.groups.filter(g=>g.stage==='retest'))complete(study,group,study.candidates.find(c=>c.id===group.candidateId).baseline?1:factor);return study;}
function runtimeFixture(study=create()){
  study.runtime={phase:'familiar',groupIndex:0,taskIndex:0,elapsed:0,extraAdapt:0,paused:true,engaged:false,lastActiveAt:1792224000000,createdWall:1792224000000};
  study.timing={plannedElapsedMs:0,activeMs:0,extraAdaptMs:0,ratingExtraMs:0,pauseMs:0,faultMs:0,waitMs:0};study.inputCheck={events:0,dx:0,dy:0};study.segments=[{startedAt:'2026-10-17T08:00:00Z',reason:'开始单次测试'}];return study;
}

test('20 minute nominal budget is exactly 1200 seconds',()=>{
  const p=S.plan('20min');assert.equal(p.totalSeconds,1200);assert.equal(p.screenSeconds,400);assert.equal(p.retestSeconds,720);assert.equal(p.familiarizationSeconds,40);assert.equal(p.breakSeconds,40);
});
test('10 minute nominal budget is exactly 600 seconds',()=>{
  const p=S.plan('10min');assert.equal(p.totalSeconds,600);assert.equal(p.screenSeconds,240);assert.equal(p.retestSeconds,280);
});
test('group step budgets do not inherit legacy countdowns or twenty-second rests',()=>{
  for(const mode of ['20min','10min']){const study=retested(mode);for(const group of study.groups){const steps=S.groupSteps(group);assert.equal(steps.reduce((s,x)=>s+x.seconds,0),group.plannedSeconds);assert.deepEqual(steps.filter(s=>s.kind==='task').map(s=>s.seconds),[12,12,12,12]);assert.equal(steps.filter(s=>s.kind==='transition').length,3);assert.equal(steps.filter(s=>s.kind==='rating').length,1)}assert.equal(study.groups.reduce((s,g)=>s+g.plannedSeconds,80),study.plannedSeconds)}
});
test('quick local candidates preserve the measured baseline and distance multipliers',()=>{
  assert.deepEqual(S.candidates(75.2,'10min',1).map(c=>c.cm),[60.16,75.2,94]);
});
test('full candidates explore both sides without using estimated swipe as a cutoff',()=>{
  const study=create();assert.deepEqual(study.candidates.map(c=>c.cm),[48.128,60.16,75.2,94,117.5]);assert.equal(study.candidates.filter(c=>c.baseline).length,1);assert.ok(study.candidates.every(c=>c.cm>20));
});
test('angular gain is base divided by candidate, not distance percentage',()=>{
  const study=retested('10min'),row=S.analyze(study).rows.find(r=>r.cm===60.16);near(row.angleGain,1.25);near(row.angleGainChange,.25);
});
test('configuration and calibration snapshots do not alias live settings',()=>{
  const localConfig=clone(config),localCal=clone(cal),study=S.createStudy({config:localConfig,calibration:localCal,seed:1});localConfig.weights[0]=.9;localConfig.swipe=3;localCal.ux=1;assert.deepEqual(study.configSnapshot.weights,config.weights);assert.equal(study.calSnapshot.ux,630);assert.equal(study.configSnapshot.swipe,20);
});
test('absence of raw physical calibration cannot create a formal session',()=>{
  assert.throws(()=>S.createStudy({config,calibration:null}),/有效物理校准/);assert.throws(()=>S.createStudy({config,calibration:{...cal,raw:'fallback'}}),/有效物理校准/);assert.throws(()=>S.createStudy({config,calibration:{...cal,dpi:800}}),/DPI/);
});
test('formal snapshots require FOV type and calibration DPI/environment metadata',()=>{
  for(const overrides of [{fov:NaN},{fov:0},{fovType:'unknown'}])assert.throws(()=>S.createStudy({config:{...config,...overrides},calibration:cal}));
  for(const key of ['dpi','env']){const missing=clone(cal);delete missing[key];assert.throws(()=>S.createStudy({config,calibration:missing}));}
});
test('seeded candidate labels, screen order and target sequences are reproducible',()=>{
  assert.deepEqual(create(),create());const seen=new Set();for(let seed=0;seed<12;seed++){const study=S.createStudy({config,calibration:cal,seed});seen.add(study.groups.map(g=>g.candidateId).join(','));}assert.ok(seen.size>1);
});
test('each screen condition shares one target seed and one task order',()=>{
  const study=create();assert.equal(new Set(study.groups.map(g=>g.seed)).size,1);assert.equal(new Set(study.groups.map(g=>g.taskOrder.join(','))).size,1);
});
test('full retest balances all three candidate positions over three rounds',()=>{
  const study=retested(),groups=study.groups.filter(g=>g.stage==='retest');assert.equal(groups.length,9);for(const id of study.retest.candidateIds){const positions=[1,2,3].map(round=>groups.filter(g=>g.round===round).findIndex(g=>g.candidateId===id));assert.deepEqual(positions.sort(),[0,1,2])}
});
test('quick retest uses two balanced orders in the same date',()=>{
  const study=retested('10min'),groups=study.groups.filter(g=>g.stage==='retest');assert.equal(groups.length,4);assert.deepEqual(groups.filter(g=>g.round===1).map(g=>g.candidateId),groups.filter(g=>g.round===2).map(g=>g.candidateId).reverse());assert.equal(S.analyze(study).status,'complete');
});
test('retest target seeds are new per round and differ from screen seeds',()=>{
  const study=retested(),rounds=[0,1,2,3].map(round=>study.groups.filter(g=>g.round===round));assert.equal(new Set(rounds.map(g=>g[0].seed)).size,4);for(const group of rounds){assert.equal(new Set(group.map(g=>g.seed)).size,1);assert.equal(new Set(group.map(g=>g.taskOrder.join(','))).size,1)}
});
test('screening cannot freeze before explicit ratings and all tasks are present',()=>{
  const study=screened();delete study.results[study.groups[0].id].rating;assert.throws(()=>S.freezeRetest(study),/明确评分/);assert.equal(study.retest,null);
});
test('a painful screening group stops selection rather than selecting other candidates',()=>{
  const study=screened();study.results[study.groups[0].id].rating.pain=true;assert.throws(()=>S.freezeRetest(study),/疼痛/);
});
test('frozen finalists and groups do not change after new or altered screening scores',()=>{
  const study=retested(),ids=study.retest.candidateIds.slice(),groups=clone(study.groups);for(const group of study.groups.filter(g=>g.stage==='screen'))complete(study,group,.5);S.freezeRetest(study);assert.deepEqual(study.retest.candidateIds,ids);assert.deepEqual(study.groups,groups);
});
test('too few eligible challengers shorten the plan without repeating fake candidates',()=>{
  const study=screened();for(const group of study.groups){if(!study.candidates.find(c=>c.id===group.candidateId).baseline)study.results[group.id].rating.effort=9}S.freezeRetest(study);assert.equal(study.retest.candidateIds.length,1);assert.equal(study.groups.filter(g=>g.stage==='retest').length,3);assert.equal(study.plannedSeconds,720);
});
test('software bounds preserve baseline and disclose a shorter initial plan',()=>{
  const study=S.createStudy({config:{...config,baseCm:5},calibration:cal,seed:1});assert.equal(study.candidates.length,3);assert.ok(study.candidates.some(c=>c.baseline&&c.cm===5));assert.equal(study.plannedSeconds,1040);
});
test('consistent practical gains across all retest rounds support a game trial',()=>{
  const a=S.analyze(retested());assert.equal(a.status,'complete');assert.equal(a.recommendation.action,'try-candidate');assert.equal(a.requiredRounds,3);assert.equal(a.pairedRounds,3);assert.ok(a.improved.every(r=>r.consistent));
});
test('quick mode can finish and recommend in one session without dates as samples',()=>{
  const a=S.analyze(retested('10min'));assert.equal(a.requiredRounds,2);assert.equal(a.pairedRounds,2);assert.equal(a.recommendation.action,'try-candidate');assert.equal(a.ci,null);assert.equal(a.confidence,null);assert.ok(a.rows.every(r=>r.ci===null));
});
test('screen selection data are excluded from final relative scores',()=>{
  const study=retested(),before=S.analyze(study).rows.map(r=>r.relative);for(const group of study.groups.filter(g=>g.stage==='screen'))complete(study,group,2);assert.deepEqual(S.analyze(study).rows.map(r=>r.relative),before);
});
test('near-equal tested values allow keeping the original sensitivity',()=>{
  const a=S.analyze(retested('20min',1));assert.equal(a.recommendation.action,'keep-baseline');assert.equal(a.recommendation.cm,75.2);assert.ok(a.near.length>1);assert.ok(a.near.every(r=>a.rows.some(x=>x.id===r.id)));
});
test('one negative retest round prevents a stable-benefit claim despite high average',()=>{
  const study=retested();for(const g of study.groups.filter(g=>g.stage==='retest'&&g.round===2)){if(!study.candidates.find(c=>c.id===g.candidateId).baseline)complete(study,g,.95)}const a=S.analyze(study);assert.equal(a.recommendation.action,'keep-baseline');assert.ok(a.rows.filter(r=>!r.baseline).every(r=>!r.consistent&&r.relative>1));
});
test('micro accuracy loss cannot hide under efficiency improvement',()=>{
  const study=retested();for(const g of study.groups.filter(g=>g.stage==='retest')){if(!study.candidates.find(c=>c.id===g.candidateId).baseline)study.results[g.id].tasks.micro.accuracy=.4}const a=S.analyze(study);assert.equal(a.recommendation.action,'keep-baseline');assert.ok(a.rows.filter(r=>!r.baseline).every(r=>!r.gates));
});
test('tracking decline cannot hide under high scores on the other tasks',()=>{
  const study=retested();for(const g of study.groups.filter(g=>g.stage==='retest')){if(!study.candidates.find(c=>c.id===g.candidateId).baseline)study.results[g.id].tasks.track.score=.1}assert.equal(S.analyze(study).recommendation.action,'keep-baseline');
});
test('a single round accuracy collapse is not concealed by better later accuracy',()=>{
  const study=retested();for(const g of study.groups.filter(g=>g.stage==='retest'))if(!study.candidates.find(c=>c.id===g.candidateId).baseline)study.results[g.id].tasks.micro.accuracy=g.round===1?.6:.95;
  const a=S.analyze(study);assert.equal(a.recommendation.action,'keep-baseline');assert.ok(a.rows.filter(r=>!r.baseline).every(r=>r.accDiff>0&&!r.gates&&r.rounds[0].gateReasons.length));
});
test('a single round tracking decline cannot be averaged out by later strong tracking',()=>{
  const study=retested();for(const g of study.groups.filter(g=>g.stage==='retest'))if(!study.candidates.find(c=>c.id===g.candidateId).baseline)study.results[g.id].tasks.track.score=g.round===1?.32:.6;
  const a=S.analyze(study);assert.equal(a.recommendation.action,'keep-baseline');assert.ok(a.rows.filter(r=>!r.baseline).every(r=>r.taskRatios[2]>1&&!r.gates));
});
test('comfort limits and pain remain independent gates',()=>{
  const study=retested();for(const g of study.groups.filter(g=>g.stage==='retest'))if(!study.candidates.find(c=>c.id===g.candidateId).baseline)study.results[g.id].rating.effort=8;assert.equal(S.analyze(study).recommendation.action,'keep-baseline');study.results[study.groups.at(-1).id].rating.pain=true;assert.equal(S.analyze(study).status,'pain-stop');assert.equal(S.analyze(study).recommendation.action,'insufficient');
});
test('zero candidate performance remains valid data but never gets epsilon smoothing',()=>{
  const study=retested(),group=study.groups.find(g=>g.stage==='retest'&&!study.candidates.find(c=>c.id===g.candidateId).baseline);study.results[group.id].tasks.track.score=0;assert.equal(S.groupComplete(study,group),true);const a=S.analyze(study),row=a.rows.find(r=>r.id===group.candidateId);assert.equal(row.relative,0);assert.equal(row.gates,false);assert.equal(row.sufficient,false);assert.equal(a.recommendation.action,'insufficient');
});
test('zero baseline performance produces null comparisons rather than infinite advantage',()=>{
  const study=retested(),group=study.groups.find(g=>g.stage==='retest'&&study.candidates.find(c=>c.id===g.candidateId).baseline);study.results[group.id].tasks.track.score=0;const a=S.analyze(study);assert.equal(a.recommendation.action,'insufficient');assert.ok(a.rows.every(r=>r.rounds.find(x=>x.round===group.round).relative===null));
});
test('missing task, too-short duration or insufficient hits block credible conclusions',()=>{
  for(const mutate of [b=>{b.duration=1000},b=>{b.hits=1;b.shots=1},b=>{b.raw='fallback'}]){const study=retested(),g=study.groups.find(g=>g.stage==='retest');mutate(study.results[g.id].tasks.micro);assert.equal(S.analyze(study).recommendation.action,'insufficient')}
  const study=retested(),g=study.groups.find(g=>g.stage==='retest');delete study.results[g.id].tasks.turn;assert.equal(S.analyze(study).status,'insufficient');
});
test('baseline drift is disclosed without deleting or correcting low scores',()=>{
  const study=retested();for(const g of study.groups.filter(g=>g.stage==='retest'&&g.round===3))complete(study,g,study.candidates.find(c=>c.id===g.candidateId).baseline?.7:.875);const before=JSON.stringify(study.results),a=S.analyze(study);assert.equal(a.drift.flagged,true);assert.ok(a.drift.roundChange<0);assert.equal(JSON.stringify(study.results),before);
});
test('a boundary leader is flagged without inventing an untested optimum',()=>{
  const study=retested(),a=S.analyze(study);assert.equal(a.boundary,true);assert.ok(study.candidates.some(c=>c.cm===a.recommendation.cm));
});
test('discarded interrupted rounds are not silently folded into final results',()=>{
  const study=retested(),g=study.groups.find(g=>g.stage==='retest');study.discardedRounds.push({round:g.round,results:clone(study.results)});delete study.results[g.id];assert.equal(S.analyze(study).status,'insufficient');
});
test('complete and partially recorded new-protocol backups validate',()=>{
  for(const s of [create(),screened(),retested(),retested('10min')])assert.equal(S.validateStudy(s),s);
  const s=create();s.results[s.groups[0].id]={tasks:{}};assert.equal(S.validateStudy(s),s);
});
test('backup validation rejects finite-data corruption before deriving reports',()=>{
  for(const alter of [s=>{s.seed=NaN},s=>{s.configSnapshot.weights[0]=Infinity},s=>{s.results[s.groups[0].id].tasks.micro.score=NaN},s=>{s.results[s.groups[0].id].rating.pain='false'},s=>{s.results[s.groups[0].id].tasks.micro.hits=-1}]){const study=retested();alter(study);assert.throws(()=>S.validateStudy(study));}
});
test('backup validation rejects wrong baseline, duplicated candidates and missing groups',()=>{
  for(const alter of [s=>{s.candidates[0].baseline=true},s=>{s.candidates[1].id=s.candidates[0].id},s=>{s.groups.pop()},s=>{s.retest.candidateIds=s.retest.candidateIds.filter(id=>id!==s.candidates.find(c=>c.baseline).id)}]){const study=retested();alter(study);assert.throws(()=>S.validateStudy(study));}
});
test('backup validation rejects result references, missing ratings and incorrect budgets',()=>{
  for(const alter of [s=>{s.results.unknown={tasks:{}}},s=>{delete s.results[s.groups[0].id].rating},s=>{s.groups[0].adaptSeconds=20},s=>{s.plannedSeconds=600}]){const study=retested();alter(study);assert.throws(()=>S.validateStudy(study));}
});
test('backup validation rejects unfair same-round seeds and reused target sequences',()=>{
  let study=retested();study.groups[0].seed++;assert.throws(()=>S.validateStudy(study));study=retested();for(const g of study.groups.filter(g=>g.stage==='retest'&&g.round===1))g.seed=study.groups[0].seed;assert.throws(()=>S.validateStudy(study));
});
test('cached analysis does not control recomputed conclusions',()=>{
  const study=retested('20min',1);study.analysis={recommendation:{cm:5,action:'try-candidate'}};S.validateStudy(study);assert.equal(S.analyze(study).recommendation.action,'keep-baseline');
});
test('fresh and completed UI runtime snapshots validate',()=>{
  S.validateStudy(runtimeFixture());const study=runtimeFixture(retested());study.runtime.phase='done';study.runtime.groupIndex=study.groups.length;study.runtime.paused=false;study.completedAt='2026-10-17T08:25:00Z';S.validateStudy(study);
});
test('restore validation rejects missing UI objects and nonfinite or negative counters',()=>{
  for(const alter of [s=>{delete s.timing},s=>{delete s.inputCheck},s=>{s.timing.waitMs=-1},s=>{s.inputCheck.events=.5},s=>{s.runtime.elapsed=Infinity},s=>{delete s.runtime.createdWall},s=>{s.runtime.roundPlannedStart=-1},s=>{s.segments=[]}]){const study=runtimeFixture();alter(study);assert.throws(()=>S.validateStudy(study));}
});
test('restore validation rejects phase and group indexes that would crash runtime',()=>{
  for(const alter of [s=>{s.runtime.phase='fake'},s=>{s.runtime.groupIndex=99},s=>{s.runtime.taskIndex=-1},s=>{s.runtime.phase='task';s.runtime.groupIndex=s.groups.length},s=>{s.runtime.phase='rating'},s=>{s.runtime.phase='done';s.runtime.groupIndex=s.groups.length;s.completedAt='2026-10-17T08:25:00Z'}]){const study=runtimeFixture();alter(study);assert.throws(()=>S.validateStudy(study));}
});
test('restore validation preserves explicit rating wait and checked short rest states',()=>{
  const study=runtimeFixture(screened());study.runtime.phase='rating';study.runtime.ratingStartedAt=1792224000000;S.validateStudy(study);study.runtime.phase='ratingRest';study.runtime.restRemaining=6000;S.validateStudy(study);delete study.results[study.groups[0].id].rating;assert.throws(()=>S.validateStudy(study));
});
test('restore validation checks interrupted tasks and discarded round audit contents',()=>{
  const study=runtimeFixture(screened()),g=study.groups[0];study.attempts.push({groupId:g.id,task:'micro',reason:'窗口变化',created:'2026-10-17T08:02:00Z',valid:false,partial:{task:'micro',elapsed:2000,hits:1,shots:2,trials:[],trace:[],pathCm:1}});study.discardedRounds.push({stage:'screen',round:0,reason:'长间隔',created:'2026-10-17T08:03:00Z',records:clone(study.results)});S.validateStudy(study);study.attempts[0].partial.elapsed=NaN;assert.throws(()=>S.validateStudy(study));
});

function abandonedFixture(study=screened()){
  runtimeFixture(study);study.status='abandoned';study.runtime.phase='abandoned';study.runtime.paused=false;study.abandonedReason='已更换鼠标，保留记录后重新校准';study.completedAt='2026-10-17T08:25:00Z';return study;
}

test('voluntary end preserves existing results and validates as an inactive terminal state',()=>{
  const study=abandonedFixture(),records=clone(study.results);assert.equal(S.validateStudy(study),study);assert.deepEqual(study.results,records);assert.equal(study.runtime.engaged,false);
});

test('voluntary end requires a matching phase, explicit reason and valid end time',()=>{
  for(const alter of [s=>{delete s.abandonedReason},s=>{s.abandonedReason='  '},s=>{s.abandonedReason='x'.repeat(1001)},s=>{delete s.completedAt},s=>{s.completedAt='2026-10-16T08:00:00Z'},s=>{s.runtime.phase='adapt'},s=>{s.status='screen'},s=>{s.runtime.paused=true},s=>{s.runtime.engaged=true},s=>{delete s.runtime}]){const study=abandonedFixture();alter(study);assert.throws(()=>S.validateStudy(study));}
});

test('ending during final short rest does not turn complete raw scores into a recommendation',()=>{
  const study=abandonedFixture(retested()),records=clone(study.results);S.validateStudy(study);const analysis=S.analyze(study);assert.equal(analysis.status,'abandoned');assert.equal(analysis.recommendation.action,'insufficient');assert.match(analysis.recommendation.reason,/主动结束/);assert.equal(analysis.pairedRounds,3);assert.deepEqual(study.results,records);
});

function deepScreen(challengers=2){
  const study=screened('120min'),allowed=study.candidates.filter(c=>!c.baseline).slice(0,challengers).map(c=>c.id);
  for(const group of study.groups)if(!study.candidates.find(c=>c.id===group.candidateId).baseline&&!allowed.includes(group.candidateId))study.results[group.id].rating.effort=9;
  return study;
}
function deepRetest(challengers=2,factor=1.2){const study=deepScreen(challengers);S.freezeRetest(study,{now:'2026-10-17T08:50:00Z'});for(const g of study.groups.filter(g=>g.stage==='retest'))complete(study,g,study.candidates.find(c=>c.id===g.candidateId).baseline?1:factor);return study;}
function deepRuntime(study=create('120min')){runtimeFixture(study);study.runtime.phase='preflight';study.runtime.preflightStartedAt=study.runtime.createdWall;study.runtime.practiceIndex=0;study.timing.extraRestMs=0;return study;}

test('deep protocol reserves 120 minutes but unlocks the report after 105 minutes of measurement and rest',()=>{
  const p=S.plan('120min'),study=create('120min');assert.equal(p.totalSeconds,7200);assert.equal(p.measurementSeconds,6300);assert.equal(p.reportReserveSeconds,900);assert.equal(study.plannedSeconds,7200);assert.equal(study.measurementSeconds,6300);assert.equal(study.protocolVersion,S.DEEP_VERSION);
  assert.equal(p.preflightSeconds+4*(p.tutorialSecondsEach+p.warmupSecondsEach)+p.initialRestSeconds,900);assert.equal(p.screenSeconds,2100);assert.equal(p.breakSeconds,600);assert.equal(p.retestSeconds,2700);
});

test('deep group steps account for every transition and mandatory rest exactly once',()=>{
  const study=deepRetest(),screen=study.groups.filter(g=>g.stage==='screen'),retest=study.groups.filter(g=>g.stage==='retest');
  assert.equal(screen.reduce((sum,g)=>sum+g.plannedSeconds+g.betweenRestSeconds,0),2100);assert.deepEqual(screen.map(g=>g.betweenRestSeconds),[60,60,60,0]);assert.equal(retest.reduce((sum,g)=>sum+g.plannedSeconds,0),2700);
  for(const g of study.groups){assert.equal(S.groupSteps(g).reduce((sum,s)=>sum+s.seconds,0),g.plannedSeconds);assert.equal(g.taskSeconds,g.stage==='screen'?60:45);assert.equal(S.groupSteps(g).filter(s=>s.kind==='transition').length,3);assert.equal(g.postRestSeconds,g.stage==='screen'?0:30);}
});

test('deep candidates use the live base, preserve it and disclose software bounds without duplicates',()=>{
  assert.deepEqual(S.candidates(75.2,'120min',1).map(c=>c.cm),[94,75.2,60.16,48.128]);assert.deepEqual(S.candidates(50,'120min',1).map(c=>c.cm),[62.5,50,40,32]);
  for(const baseCm of [5,250]){const s=S.createStudy({mode:'120min',config:{...config,baseCm,swipe:5},calibration:cal,seed:1});assert.ok(s.candidates.some(c=>c.baseline&&c.cm===baseCm));assert.equal(new Set(s.candidates.map(c=>c.cm)).size,s.candidates.length);assert.ok(s.candidateWarnings.length);assert.ok(s.plannedSeconds<7200);S.validateStudy(s);}
});

test('old v1 studies keep their version, budgets, candidates and minimum data rules',()=>{
  for(const mode of ['10min','20min']){const study=retested(mode);assert.equal(study.protocolVersion,S.VERSION);assert.equal(study.plannedSeconds,mode==='10min'?600:1200);assert.equal(S.qualityFor(study,study.groups[0]).minimumDurationMs,11900);assert.equal(S.validateStudy(study),study);assert.equal(S.analyze(study).recommendation.action,'try-candidate');}
  const wrong=create('120min');wrong.protocolVersion=S.VERSION;assert.throws(()=>S.validateStudy(wrong));const old=create();old.protocolVersion=S.DEEP_VERSION;assert.throws(()=>S.validateStudy(old));
});

test('deep labels, order, task order and all separate seeds reproduce from the saved design seed',()=>{
  const first=deepRetest(),second=deepRetest();assert.deepEqual(first.candidates,second.candidates);assert.deepEqual(first.groups,second.groups);
  const formal=[...new Set(first.groups.map(g=>g.seed))];assert.equal(formal.length,4);assert.ok(!formal.includes(first.practiceSeed));
  for(const round of [0,1,2,3]){const rows=first.groups.filter(g=>g.round===round);assert.equal(new Set(rows.map(g=>g.seed)).size,1);assert.equal(new Set(rows.map(g=>g.adaptSeed)).size,1);assert.equal(new Set(rows.map(g=>g.taskOrder.join(','))).size,1);assert.ok(!formal.includes(rows[0].adaptSeed));assert.notEqual(rows[0].adaptSeed,first.practiceSeed);}
});

test('three-condition deep retest uses three complete Latin rounds',()=>{
  const study=deepRetest(),rounds=[1,2,3].map(r=>study.groups.filter(g=>g.stage==='retest'&&g.round===r).map(g=>g.candidateId));assert.equal(study.retest.rounds,3);assert.equal(study.retest.candidateIds.length,3);for(const id of rounds[0])assert.equal(new Set(rounds.map(r=>r.indexOf(id))).size,3);S.validateStudy(study);
});

test('one challenger produces four balanced paired rounds and a 115-minute total budget',()=>{
  const study=deepRetest(1),rounds=[1,2,3,4].map(r=>study.groups.filter(g=>g.stage==='retest'&&g.round===r).map(g=>g.candidateId));assert.equal(study.retest.rounds,4);assert.equal(study.groups.filter(g=>g.stage==='retest').length,8);assert.deepEqual(rounds[0],rounds[3]);assert.deepEqual(rounds[1],rounds[2]);assert.deepEqual(rounds[0].slice().reverse(),rounds[1]);assert.equal(study.measurementSeconds,6000);assert.equal(study.plannedSeconds,6900);assert.equal(S.analyze(study).requiredRounds,4);S.validateStudy(study);
});

test('no challenger ends honestly after screening without a fake baseline comparison or stage break',()=>{
  const study=deepRetest(0),a=S.analyze(study);assert.equal(study.retest.rounds,0);assert.equal(study.retest.noComparison,true);assert.equal(study.groups.length,4);assert.equal(study.status,'insufficient');assert.equal(study.measurementSeconds,3000);assert.equal(study.plannedSeconds,3900);assert.equal(a.status,'no-comparison');assert.equal(a.recommendation.action,'insufficient');assert.equal(a.pairedRounds,0);assert.match(a.recommendation.reason,/没有进行伪造/);S.validateStudy(study);
});

test('deep final analysis excludes screen records and reports median and observed range without CIs',()=>{
  const study=deepRetest(),before=S.analyze(study);for(const g of study.groups.filter(g=>g.stage==='screen'))complete(study,g,.5);const after=S.analyze(study);assert.deepEqual(after.rows.map(x=>x.relative),before.rows.map(x=>x.relative));assert.equal(after.ci,null);assert.equal(after.confidence,null);assert.ok(after.rows.every(x=>x.medianRelative!==null&&x.observedRange.length===2&&x.ci===null));assert.ok(after.rows.every(x=>x.raw.micro.scoreMedian!==null));
});

test('deep observed median is distinct from its geometric recommendation score',()=>{
  const study=deepRetest();for(const g of study.groups.filter(g=>g.stage==='retest'&&!study.candidates.find(c=>c.id===g.candidateId).baseline))complete(study,g,[1,1.2,1.4][g.round-1]);const row=S.analyze(study).rows.find(r=>!r.baseline);near(row.medianRelative,1.2);near(row.observedRange[0],1);near(row.observedRange[1],1.4);assert.notEqual(row.relative,row.medianRelative);
});

test('deep quality applies 99 percent of the actual 60- and 45-second task budgets',()=>{
  const study=deepRetest(),screen=study.groups[0],retest=study.groups.find(g=>g.stage==='retest');assert.equal(S.qualityFor(study,screen).minimumDurationMs,59400);assert.equal(S.qualityFor(study,retest).minimumDurationMs,44550);
  study.results[retest.id].tasks.micro.duration=44550;assert.notEqual(S.analyze(study).recommendation.action,'insufficient');study.results[retest.id].tasks.micro.duration=44549;assert.equal(S.analyze(study).recommendation.action,'insufficient');study.results[retest.id].tasks.micro.duration=12000;assert.equal(S.analyze(study).recommendation.action,'insufficient');
});

test('deep zero scores, low samples, missing data and one-round precision losses cannot produce a winner',()=>{
  for(const mutate of [b=>{b.score=0;b.hits=0},b=>{b.hits=2;b.shots=5},b=>{b.hits=3;b.shots=4},b=>{b.raw='fallback'}]){const s=deepRetest(),g=s.groups.find(g=>g.stage==='retest');mutate(s.results[g.id].tasks.micro);assert.equal(S.analyze(s).recommendation.action,'insufficient');}
  const s=deepRetest();for(const g of s.groups.filter(g=>g.stage==='retest'&&g.round===2&&!s.candidates.find(c=>c.id===g.candidateId).baseline))s.results[g.id].tasks.micro.accuracy=.1;assert.equal(S.analyze(s).recommendation.action,'keep-baseline');
});

test('deep inconsistent rounds disclose uncertainty and preserve later low scores',()=>{
  const s=deepRetest(),before=Object.keys(s.results).length;for(const g of s.groups.filter(g=>g.stage==='retest'&&g.round===3&&!s.candidates.find(c=>c.id===g.candidateId).baseline))complete(s,g,.95);const a=S.analyze(s);assert.equal(a.recommendation.action,'keep-baseline');assert.equal(a.inconsistent,true);assert.match(a.recommendation.reason,/尚未稳定区分/);assert.equal(Object.keys(s.results).length,before);
});

test('deep saved metadata prevents results from being relabeled as another round, condition or session',()=>{
  for(const mutate of [s=>{s.sessionId='another'},s=>{s.results[s.groups[0].id].sessionSegment=2},s=>{s.results[s.groups[0].id].tasks.micro.round=9},s=>{s.results[s.groups[0].id].tasks.micro.conditionId='fake'},s=>{s.results[s.groups[0].id].rating.phase='retest'},s=>{s.results[s.groups[0].id].tasks.micro.seed++}]){const s=deepRetest();mutate(s);assert.throws(()=>S.validateStudy(s));}
});

test('deep backup validation rejects changed frozen rules, budgets, order and reused adaptation seeds',()=>{
  for(const mutate of [s=>{s.protocolConfig.stageRestSeconds=0},s=>{s.qualityRules.minimumHits=0},s=>{s.retest.rounds=2},s=>{s.groups[0].betweenRestSeconds=0},s=>{s.groups[0].adaptSeed=s.groups[0].seed},s=>{s.groups[4].postRestSeconds=0},s=>{s.measurementSeconds=7200},s=>{s.retest.qualityRules.minimumShots=0}]){const s=deepRetest();mutate(s);assert.throws(()=>S.validateStudy(s));}
  const s=deepRetest(1),second=s.groups.filter(g=>g.round===2);[second[0].candidateId,second[1].candidateId]=[second[1].candidateId,second[0].candidateId];assert.throws(()=>S.validateStudy(s));
});

test('long-task trace data validate within 60 seconds and reject invalid time or coverage',()=>{
  const s=deepRetest(),g=s.groups[0],b=s.results[g.id].tasks.track;b.trace=Array.from({length:300},(_,i)=>[(i+1)*200,1]);S.validateStudy(s);b.trace.push([60200,1]);S.validateStudy(s);b.trace.push([60400,1]);assert.throws(()=>S.validateStudy(s));
  const d=deepRetest(),t=d.results[d.groups[0].id].tasks.track;t.coveredMs=t.duration+1;assert.throws(()=>S.validateStudy(d));
});

test('deep UI phases, early preflight savings and no-comparison completion restore without erasing data',()=>{
  for(const phase of ['preflight','tutorial','warmup','initialRest','screenRest']){const s=deepRuntime();s.runtime.phase=phase;s.preflightSavedSeconds=100;if(['initialRest','screenRest'].includes(phase)){s.runtime.restPlannedMs=phase==='initialRest'?180000:60000;s.runtime.extraRest=0;s.runtime.restNext='adapt';}assert.equal(S.validateStudy(s),s);}
  const s=deepRuntime(deepRetest(0));s.runtime.phase='done';s.runtime.groupIndex=s.groups.length;s.runtime.paused=false;s.completedAt='2026-10-17T09:00:00Z';S.validateStudy(s);assert.equal(S.analyze(s).recommendation.action,'insufficient');
  for(const mutate of [s=>{s.runtime.practiceIndex=4},s=>{s.preflightSavedSeconds=121},s=>{s.timing.extraRestMs=-1},s=>{s.runtime.restNext='fake'},s=>{delete s.runtime.preflightStartedAt},s=>{s.runtime.phase='initialRest'}]){const d=deepRuntime();mutate(d);assert.throws(()=>S.validateStudy(d));}
});

test('deep audit stores interruption category and segment without altering saved scores',()=>{
  const s=deepRuntime(deepRetest()),g=s.groups[0],saved=clone(s.results);s.sessionSegment=2;s.interruptions=[{type:'technical',reason:'窗口变化',created:'2026-10-17T09:00:00Z',phase:'task',sessionSegment:2,elapsed:2000}];s.attempts.push({...S.recordMeta(s,g),groupId:g.id,task:'micro',reason:'锁定丢失',created:'2026-10-17T09:00:00Z',valid:false,partial:null});S.validateStudy(s);assert.deepEqual(s.results,saved);s.interruptions[0].type='best-score-retry';assert.throws(()=>S.validateStudy(s));
});

test('deep near candidates, boundary leaders, gain arithmetic and drift remain descriptive',()=>{
  const equal=S.analyze(deepRetest(2,1));assert.equal(equal.recommendation.action,'keep-baseline');assert.ok(equal.near.length>1);
  const s=deepRetest(),a=S.analyze(s);assert.equal(a.boundary,true);near(a.rows.find(r=>r.cm===94).angleGain,.8);near(a.rows.find(r=>r.cm===60.16).angleGain,1.25);
  const baseline=s.candidates.find(c=>c.baseline);for(const g of s.groups.filter(g=>g.stage==='retest'&&g.round===3&&g.candidateId===baseline.id))complete(s,g,.7);const before=clone(s.results),drift=S.analyze(s).drift;assert.equal(drift.flagged,true);assert.ok(drift.roundChange<0);assert.deepEqual(s.results,before);
});

test('deep pain blocks selection and final recommendation without discarding records',()=>{
  const screen=deepScreen();screen.results[screen.groups[0].id].rating.pain=true;assert.throws(()=>S.freezeRetest(screen),/疼痛/);
  const study=deepRetest(),group=study.groups.at(-1);study.results[group.id].rating.pain=true;assert.equal(S.analyze(study).recommendation.action,'insufficient');assert.equal(S.analyze(study).status,'pain-stop');assert.ok(study.results[group.id]);
});
