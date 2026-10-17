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
  const tasks={};
  for(const task of S.TASKS){const hits=Math.round(12*factor),shots=Math.ceil(hits/.8),track=task==='track';tasks[task]={valid:true,score:track?.4*factor:hits/12,accuracy:track?.4*factor:(shots?hits/shots:0),duration:12000,hits:track?0:hits,shots:track?0:shots,timeouts:0,meanAcquireMs:track?null:800/factor,rmsDeg:track?1:null,raw:'requested',trials:[],trace:[]};}
  study.results[group.id]={tasks,rating:{effort:options.effort??3,pain:options.pain??false},completedAt:'2026-10-17T08:01:00Z'};
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
