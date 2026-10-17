/* SensLab single-session protocol. Pure calculations; no DOM, storage or legacy bootstrap. */
(function(root){
'use strict';
const VERSION='senslab-session/1';
const TASKS=['micro','switch','track','turn'];
const NAMES={micro:'微调',switch:'切换',track:'跟枪',turn:'转向'};
const QUALITY={minimumDurationMs:11900,minimumHits:2,minimumShots:3,driftThreshold:.10,pairedRoundGatePolicy:'each-round'};
const clone=value=>JSON.parse(JSON.stringify(value));
const finite=(x,min=-Infinity,max=Infinity)=>Number.isFinite(x)&&x>=min&&x<=max;
const mean=a=>a.length?a.reduce((sum,x)=>sum+x,0)/a.length:null;
const unique=a=>new Set(a).size===a.length;
const fail=message=>{throw Error(message)};
const stamp=value=>{const d=new Date(value??Date.now());if(!Number.isFinite(d.getTime()))fail('时间无效');return d.toISOString()};
function modeName(mode){if(['20min','20',20,'full20'].includes(mode))return '20min';if(['10min','10',10,'quick10'].includes(mode))return '10min';return fail('请选择10分钟或20分钟模式')}
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hash(seed,tag){let n=seed>>>0;for(const c of tag)n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;return n}
function shuffle(values,seed){const out=values.slice(),random=rng(seed);for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
function rotate(values,n){return values.map((_,i)=>values[(i+n)%values.length])}
function geometric(values,weights){if(!values.length||values.some(v=>!finite(v,0)))return null;if(values.some(v=>v===0))return 0;const result=Math.exp(values.reduce((sum,v,i)=>sum+Math.log(v)*(weights?weights[i]:1/values.length),0));return finite(result,0)?result:null}
function ratio(a,b){if(!finite(a,0)||!finite(b,0)||b===0)return null;const result=a/b;return finite(result,0)?result:null}
function configSnapshot(input){
  if(!input||typeof input!=='object')fail('缺少已保存设备设置');
  const c=clone(input);
  c.weights=c.weights??[.25,.25,.25,.25];c.margin=c.margin??.03;c.taskDrop=c.taskDrop??.10;c.accDrop=c.accDrop??.05;c.maxEffort=c.maxEffort??5;
  if(!finite(c.baseCm,5,250)||!finite(c.dpi,100,64000))fail('基准距离或DPI超出软件范围');
  if(!finite(c.fov,30,150)||!['horizontal','vertical','h43'].includes(c.fovType))fail('实验FOV数值或标度无效');
  if(!Array.isArray(c.weights)||c.weights.length!==4||c.weights.some(x=>!finite(x,0.001,1))||Math.abs(c.weights.reduce((s,x)=>s+x,0)-1)>1e-6)fail('四项权重必须为正且合计1');
  if(!finite(c.margin,.01,.10)||!finite(c.taskDrop,.01,.30)||!finite(c.accDrop,0,.20)||!finite(c.maxEffort,1,8))fail('分析规则无效');
  return c;
}
function calibrationValid(cal){return !!(cal&&cal.ok===true&&cal.raw==='requested'&&finite(cal.ux,1,1e6)&&finite(cal.uy,1,1e6)&&finite(cal.dpi,100,64000)&&cal.env&&typeof cal.env==='object'&&!Array.isArray(cal.env))}
function candidates(base,mode='20min',seed=1){
  mode=modeName(mode);if(!finite(base,5,250))fail('基准距离超出软件范围');
  const factors=mode==='20min'?[.64,.8,1,1.25,1.5625]:[.8,1,1.25];
  const rows=factors.map((factor,i)=>({id:'c'+i,cm:factor===1?base:+(base*factor).toFixed(6),baseline:factor===1})).filter(c=>c.cm>=5&&c.cm<=250);
  const labels=shuffle(rows.map((_,i)=>String.fromCharCode(65+i)),hash(seed,'labels'));
  return rows.map((c,i)=>({...c,label:labels[i]}));
}
function plan(mode='20min',counts={}){
  mode=modeName(mode);const full=mode==='20min',screenCount=counts.screenCount??(full?5:3),retestCount=counts.retestCount??(full?3:2),rounds=full?3:2;
  if(!Number.isInteger(screenCount)||screenCount<1||screenCount>5||!Number.isInteger(retestCount)||retestCount<1||retestCount>(full?3:2))fail('实验条件数量无效');
  const familiarizationSeconds=40,breakSeconds=40,screenGroupSeconds=80,retestGroupSeconds=full?80:70;
  return{mode,familiarizationSeconds,breakSeconds,screenCount,retestCount,retestRounds:rounds,screenGroupSeconds,retestGroupSeconds,screenSeconds:screenCount*80,retestSeconds:retestCount*rounds*retestGroupSeconds,totalSeconds:40+screenCount*80+40+retestCount*rounds*retestGroupSeconds};
}
function makeGroup(stage,round,candidateId,seed,taskOrder,mode,index){
  const short=stage==='retest'&&mode==='10min';
  return{id:stage+'-'+round+'-'+index,stage,round,candidateId,seed,taskOrder:taskOrder.slice(),adaptSeconds:short?10:15,ratingSeconds:short?6:11,taskSeconds:12,transitionSeconds:2,plannedSeconds:short?70:80};
}
function groupSteps(group){
  const steps=[{kind:'adapt',seconds:group.adaptSeconds}];
  group.taskOrder.forEach((task,index)=>{steps.push({kind:'task',task,seconds:group.taskSeconds});if(index<3)steps.push({kind:'transition',seconds:group.transitionSeconds})});
  steps.push({kind:'rating',seconds:group.ratingSeconds});return steps;
}
function createStudy({mode='20min',config,calibration,seed=1,id,now,provenance={}}={}){
  mode=modeName(mode);if(!Number.isInteger(seed)||!finite(seed,0,4294967295))fail('随机种子无效');
  const c=configSnapshot(config);if(!calibrationValid(calibration))fail('正式实验需要有效物理校准；可先进行不计分练习');
  if(calibration.dpi!==undefined&&calibration.dpi!==c.dpi)fail('校准DPI与当前已保存设置不一致');
  const created=stamp(now),all=candidates(c.baseCm,mode,seed),order=shuffle(all.map(x=>x.id),hash(seed,'screen-order')),taskOrder=shuffle(TASKS,hash(seed,'screen-tasks')),targetSeed=hash(seed,'screen-targets');
  const groups=order.map((candidateId,index)=>makeGroup('screen',0,candidateId,targetSeed,taskOrder,mode,index));
  const p=plan(mode,{screenCount:all.length,retestCount:Math.min(mode==='20min'?3:2,all.length)});
  return{protocolVersion:VERSION,mode,id:id||'session-'+seed.toString(16)+'-'+Date.parse(created),created,seed,configSnapshot:c,calSnapshot:clone(calibration),provenance:clone(provenance),qualityRules:clone(QUALITY),candidates:all,groups,results:{},attempts:[],segments:[],discardedRounds:[],retest:null,status:'screen',plannedSeconds:p.totalSeconds,nominalSeconds:mode==='20min'?1200:600};
}
function blockValid(b){return !!(b&&b.valid===true&&finite(b.score,0,1000)&&finite(b.accuracy,0,1)&&finite(b.duration,0,1e7))}
function groupComplete(study,group){const result=study.results[group.id];return !!(result&&TASKS.every(t=>blockValid(result.tasks?.[t]))&&result.rating&&finite(result.rating.effort,0,10)&&typeof result.rating.pain==='boolean')}
function sampleProblems(result){
  const reasons=[];
  for(const t of TASKS){const b=result?.tasks?.[t];if(!blockValid(b)){reasons.push(NAMES[t]+'任务缺失或中断');continue}
    if(b.raw!=='requested')reasons.push(NAMES[t]+'原始输入未确认');
    if(b.duration<QUALITY.minimumDurationMs)reasons.push(NAMES[t]+'有效记录时间不足');
    if(t!=='track'&&(!Number.isInteger(b.hits)||b.hits<QUALITY.minimumHits||!Number.isInteger(b.shots)||b.shots<QUALITY.minimumShots))reasons.push(NAMES[t]+'点击样本不足');
    if(b.score===0)reasons.push(NAMES[t]+'零表现，保留原值但不足以支持优势结论');
  }
  return reasons;
}
function rawSummary(groups,study){
  return Object.fromEntries(TASKS.map(t=>{
    const blocks=groups.map(g=>study.results[g.id]?.tasks?.[t]).filter(blockValid);
    const sum=key=>blocks.reduce((s,b)=>s+(finite(b[key])?b[key]:0),0);
    return[t,{score:mean(blocks.map(b=>b.score)),accuracy:mean(blocks.map(b=>b.accuracy)),duration:sum('duration'),hits:sum('hits'),shots:sum('shots'),timeouts:sum('timeouts'),meanAcquireMs:mean(blocks.map(b=>b.meanAcquireMs).filter(x=>finite(x,0))),rmsDeg:mean(blocks.map(b=>b.rmsDeg).filter(x=>finite(x,0))),blocks:blocks.length}];
  }));
}
function driftReport(study){
  const base=study.candidates.find(c=>c.baseline),good=study.groups.filter(g=>g.candidateId===base.id&&groupComplete(study,g)),screen=good.find(g=>g.stage==='screen'),retests=good.filter(g=>g.stage==='retest').sort((a,b)=>a.round-b.round);
  const compare=(a,b)=>{if(!a||!b)return null;const ratios=TASKS.map(t=>ratio(study.results[a.id].tasks[t].score,study.results[b.id].tasks[t].score));return ratios.every(x=>x!==null)?geometric(ratios,study.configSnapshot.weights):null};
  const screenRatios=retests.map(g=>compare(g,screen)).filter(x=>x!==null),screenRelative=geometric(screenRatios),roundRelative=retests.length>1?compare(retests.at(-1),retests[0]):null;
  const screenToRetest=screenRelative===null?null:screenRelative-1,roundChange=roundRelative===null?null:roundRelative-1,flagged=[screenToRetest,roundChange].some(x=>x!==null&&Math.abs(x)>QUALITY.driftThreshold+1e-12);
  return{screenToRetest,roundChange,flagged,threshold:QUALITY.driftThreshold,rounds:retests.map(g=>({round:g.round,scores:TASKS.map(t=>study.results[g.id].tasks[t].score)})),note:flagged?'基准随时间变化，可能存在练习、疲劳或状态漂移；数据仍全部保留。':'未按漂移剔除任何数据；短时结果不能证明不存在状态变化。'};
}
function analyze(study,stage='retest'){
  if(!['screen','retest'].includes(stage))fail('未知分析阶段');
  const config=study.configSnapshot,base=study.candidates.find(c=>c.baseline),ids=stage==='screen'?study.candidates.map(c=>c.id):(study.retest?.candidateIds||[]),groups=study.groups.filter(g=>g.stage===stage),requiredRounds=stage==='screen'?1:(study.mode==='20min'?3:2),roundNumbers=[...new Set(groups.map(g=>g.round))].sort((a,b)=>a-b);
  const rows=ids.map(id=>{
    const c=study.candidates.find(x=>x.id===id),own=groups.filter(g=>g.candidateId===id),complete=own.filter(g=>groupComplete(study,g)),missingReasons=[],rounds=[];
    for(const round of roundNumbers){const g=own.find(x=>x.round===round),b=groups.find(x=>x.round===round&&x.candidateId===base.id);
      if(!g||!b||!groupComplete(study,g)||!groupComplete(study,b)){missingReasons.push('第'+(round||1)+'轮缺少完整配对');continue}
      const v=study.results[g.id],reference=study.results[b.id],ratios=TASKS.map(t=>ratio(v.tasks[t].score,reference.tasks[t].score)),relative=ratios.every(x=>x!==null)?geometric(ratios,config.weights):null,problems=[...sampleProblems(v),...sampleProblems(reference).map(x=>'基准：'+x)];
      if(relative===null)problems.push('基准含零分或无有限比值；未使用极小数替代');
      missingReasons.push(...problems);
      const accDiff=v.tasks.micro.accuracy-reference.tasks.micro.accuracy,roundGateReasons=[];
      if(v.rating.pain)roundGateReasons.push('疼痛或明显不适');if(v.rating.effort>config.maxEffort)roundGateReasons.push('费力度超过预设上限');if(accDiff< -config.accDrop-1e-12)roundGateReasons.push('微调命中率下降超过守门线');
      TASKS.forEach((t,i)=>{if(ratios[i]!==null&&ratios[i]<1-config.taskDrop-1e-12)roundGateReasons.push(NAMES[t]+'退步超过预设上限')});
      rounds.push({round,groupId:g.id,baselineGroupId:b.id,relative,ratios,accDiff,effort:v.rating.effort,pain:v.rating.pain,sufficient:problems.length===0,gates:roundGateReasons.length===0,gateReasons:roundGateReasons,raw:Object.fromEntries(TASKS.map(t=>[t,{candidate:clone(v.tasks[t]),baseline:clone(reference.tasks[t])}]))});
    }
    const paired=rounds.filter(r=>r.relative!==null),relative=geometric(paired.map(r=>r.relative)),taskRatios=TASKS.map((_,i)=>{const values=paired.map(r=>r.ratios[i]);return values.length?geometric(values):null}),accDiff=mean(paired.map(r=>r.accDiff)),effort=mean(complete.map(g=>study.results[g.id].rating.effort));
    const pains=own.filter(g=>study.results[g.id]?.rating?.pain===true).length,gateReasons=[];
    if(pains)gateReasons.push('疼痛或明显不适');if(effort===null||effort>config.maxEffort)gateReasons.push(effort===null?'缺少费力度评分':'费力度超过预设上限');
    if(accDiff===null||accDiff< -config.accDrop-1e-12)gateReasons.push(accDiff===null?'缺少命中率配对':'微调命中率下降超过守门线');
    TASKS.forEach((t,i)=>{if(taskRatios[i]===null||taskRatios[i]<1-config.taskDrop-1e-12)gateReasons.push(NAMES[t]+(taskRatios[i]===null?'缺少可比较分数':'退步超过预设上限'))});
    for(const round of rounds)for(const reason of round.gateReasons)gateReasons.push('第'+(round.round||1)+'轮：'+reason);
    const sufficient=rounds.length===requiredRounds&&rounds.every(r=>r.sufficient),positiveRounds=paired.filter(r=>r.relative>1+1e-12).length,consistent=sufficient&&positiveRounds===requiredRounds;
    if(rounds.length<requiredRounds)missingReasons.push('复测/筛选轮次尚未完成');
    const angleGain=config.baseCm/c.cm;
    return{...c,relative,range:paired.length?[Math.min(...paired.map(r=>r.relative)),Math.max(...paired.map(r=>r.relative))]:null,taskRatios,taskChanges:Object.fromEntries(TASKS.map((t,i)=>[t,taskRatios[i]===null?null:taskRatios[i]-1])),rounds,raw:rawSummary(complete,study),effort,pains,accDiff,accuracyDiff:accDiff,gates:gateReasons.length===0,gateReasons,sufficient,consistent,positiveRounds,pairedRounds:paired.length,requiredRounds,completeGroups:complete.length,missingReasons:[...new Set(missingReasons)],angleGain,angleGainChange:angleGain-1,ci:null};
  });
  const ranked=rows.filter(r=>r.sufficient&&r.gates&&r.relative!==null).sort((a,b)=>b.relative-a.relative),leader=ranked[0]||null,near=leader?ranked.filter(r=>r.relative>=leader.relative*(1-config.margin)-1e-12):[],improved=stage==='retest'?ranked.filter(r=>!r.baseline&&r.consistent&&r.relative>=1+config.margin-1e-12):[];
  const allAdequate=rows.length>0&&rows.every(r=>r.sufficient),pain=rows.some(r=>r.pains),chosen=improved[0]||base,cm=chosen.cm,angleGain=config.baseCm/cm;
  const abandoned=study.status==='abandoned'||study.runtime?.phase==='abandoned';
  const action=stage==='retest'&&allAdequate&&!pain&&!abandoned?(improved.length?'try-candidate':'keep-baseline'):'insufficient';
  const reason=pain?'出现疼痛或明显不适，应停止测试。':abandoned?'本次测试已主动结束，记录保留，不生成换敏推荐。':!allAdequate?'有效配对或样本不足，保留数据，不生成可信优势结论。':stage==='screen'?'粗筛仅用于冻结复测候选，尚未形成最终判断。':improved.length?'全部复测轮的方向一致，并超过预设实用差异线；可拿回游戏试用。':'本次没有稳定且实用的优势，继续使用原设置。';
  const selected=action==='try-candidate'?chosen:base,limits=study.candidates.map(c=>c.cm),boundary=!!(leader&&(leader.cm===Math.min(...limits)||leader.cm===Math.max(...limits))),drift=driftReport(study),warnings=[];
  if(boundary)warnings.push('领先值位于已测范围边界，最佳点可能仍在范围外；不外推未测数值。');if(drift.flagged)warnings.push(drift.note);if(!allAdequate)warnings.push('最低数据要求是工程质检条件，不是科学常数。');if(study.mode==='10min')warnings.push('快速局部筛选，仅比较本次已测局部范围。');
  warnings.push('每一配对轮都检查精度、单项退步和费力度守门线，避免平均成绩掩盖某轮明显退步。');
  warnings.push('单场2–3轮不计算正式95%区间或显著性，也不证明近似候选统计等效。');
  return{stage,rows,leader,near,improved,recommendation:{candidateId:selected.id,cm:selected.cm,baseline:!!selected.baseline,action,reason,angleGain:config.baseCm/selected.cm,angleGainChange:config.baseCm/selected.cm-1},status:pain?'pain-stop':abandoned?'abandoned':!allAdequate?'insufficient':stage==='screen'?'screen-only':'complete',pairedRounds:rows.length?Math.min(...rows.map(r=>r.pairedRounds)):0,requiredRounds,drift,boundary,warnings,ci:null,confidence:null};
}
function selectRetest(study){
  if(study.retest)return study.retest.candidateIds.map(id=>study.candidates.find(c=>c.id===id));
  const groups=study.groups.filter(g=>g.stage==='screen');if(!groups.every(g=>groupComplete(study,g)))fail('请先完成全部粗筛任务及明确评分');
  if(groups.some(g=>study.results[g.id].rating.pain))fail('已记录疼痛或明显不适，停止本次测试');
  const analysis=analyze(study,'screen'),base=study.candidates.find(c=>c.baseline),other=analysis.rows.filter(r=>!r.baseline&&r.sufficient&&r.gates&&r.relative!==null).sort((a,b)=>b.relative-a.relative).slice(0,study.mode==='20min'?2:1);
  return[base,...other.map(r=>study.candidates.find(c=>c.id===r.id))];
}
function freezeRetest(study,{now}={}){
  if(study.retest)return study.retest;
  const selected=selectRetest(study),candidateIds=selected.map(c=>c.id),order=shuffle(candidateIds,hash(study.seed,'retest-order')),baseTasks=shuffle(TASKS,hash(study.seed,'retest-tasks')),rounds=study.mode==='20min'?3:2,usedSeeds=new Set(study.groups.map(g=>g.seed));
  for(let round=1;round<=rounds;round++){
    let seed=hash(study.seed,'retest-targets-'+round);while(usedSeeds.has(seed))seed=(seed+1)>>>0;usedSeeds.add(seed);
    const tasks=rotate(baseTasks,round-1);rotate(order,round-1).forEach((id,index)=>study.groups.push(makeGroup('retest',round,id,seed,tasks,study.mode,index)));
  }
  study.retest={candidateIds,lockedAt:stamp(now),selection:analyze(study,'screen').rows.map(r=>({candidateId:r.id,relative:r.relative,gates:r.gates,sufficient:r.sufficient})),rules:clone(study.configSnapshot)};
  study.plannedSeconds=plan(study.mode,{screenCount:study.candidates.length,retestCount:candidateIds.length}).totalSeconds;study.status='retest';return study.retest;
}
function validateStudy(study){
  // Reject non-JSON values and excessive nesting/collections before inspecting derived data.
  let nodes=0;const visit=(v,depth=0)=>{if(++nodes>2000000||depth>24)fail('单次实验备份过大');if(typeof v==='number'&&!Number.isFinite(v))fail('备份包含非有限数值');if(v===null||['string','boolean','number'].includes(typeof v))return;if(typeof v!=='object')fail('备份包含无效数据类型');if(Array.isArray(v)&&v.length>200000)fail('备份列表过长');for(const x of Object.values(v))visit(x,depth+1)};visit(study);
  const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
  const text=value=>typeof value==='string'&&value.length<=10000;
  if(!study||study.protocolVersion!==VERSION||!['20min','10min'].includes(study.mode)||typeof study.id!=='string'||!study.id||!Number.isInteger(study.seed)||!finite(study.seed,0,4294967295)||!date(study.created))fail('单次实验标识无效');
  configSnapshot(study.configSnapshot);if(!calibrationValid(study.calSnapshot)||study.calSnapshot.dpi!==study.configSnapshot.dpi)fail('单次实验缺少有效且DPI一致的校准快照');
  const expected=candidates(study.configSnapshot.baseCm,study.mode,study.seed),all=study.candidates;
  if(!Array.isArray(all)||all.length!==expected.length||!unique(all.map(c=>c?.id))||!unique(all.map(c=>c?.label)))fail('单次实验候选集合无效');
  for(const c of all){const e=expected.find(x=>x.id===c.id);if(!e||c.cm!==e.cm||c.baseline!==e.baseline||c.label!==e.label)fail('候选不符合冻结协议')}
  const ids=all.map(c=>c.id),base=all.find(c=>c.baseline),groups=study.groups;
  if(!Array.isArray(groups)||groups.length>20||!unique(groups.map(g=>g?.id))||!study.results||typeof study.results!=='object'||Array.isArray(study.results))fail('单次实验组或结果无效');
  if(!Array.isArray(study.attempts)||study.attempts.length>10000||!Array.isArray(study.segments)||study.segments.length>1000)fail('实验过程记录无效');
  if(study.retest){const r=study.retest;if(!Array.isArray(r.candidateIds)||!unique(r.candidateIds)||r.candidateIds.length<1||r.candidateIds.length>(study.mode==='20min'?3:2)||r.candidateIds.some(id=>!ids.includes(id))||!r.candidateIds.includes(base.id)||!date(r.lockedAt))fail('冻结复测候选无效');if(!r.rules||JSON.stringify(r.rules)!==JSON.stringify(study.configSnapshot))fail('冻结规则与设置快照不一致')}
  const stageRounds={screen:[0],retest:study.retest?Array.from({length:study.mode==='20min'?3:2},(_,i)=>i+1):[]};
  for(const g of groups){if(!g||typeof g.id!=='string'||!['screen','retest'].includes(g.stage)||!stageRounds[g.stage].includes(g.round)||!ids.includes(g.candidateId)||!Number.isInteger(g.seed)||!finite(g.seed,0,4294967295)||!Array.isArray(g.taskOrder)||g.taskOrder.length!==4||!unique(g.taskOrder)||g.taskOrder.some(t=>!TASKS.includes(t)))fail('任务组结构无效');const short=g.stage==='retest'&&study.mode==='10min';if(g.adaptSeconds!==(short?10:15)||g.ratingSeconds!==(short?6:11)||g.taskSeconds!==12||g.transitionSeconds!==2||g.plannedSeconds!==(short?70:80))fail('任务预算不符合协议')}
  const seeds=[];
  for(const stage of ['screen','retest'])for(const round of stageRounds[stage]){const rows=groups.filter(g=>g.stage===stage&&g.round===round),expectedIds=stage==='screen'?ids:study.retest.candidateIds;if(rows.length!==expectedIds.length||!unique(rows.map(g=>g.candidateId))||expectedIds.some(id=>!rows.some(g=>g.candidateId===id)))fail('比较轮缺少或重复条件');if(rows.some(g=>g.seed!==rows[0].seed||g.taskOrder.join(',')!==rows[0].taskOrder.join(',')))fail('同轮任务种子或顺序不一致');seeds.push(rows[0].seed)}
  if(!unique(seeds))fail('粗筛与复测轮必须使用新的目标种子');
  const checkResult=(result,g)=>{if(!result||typeof result!=='object'||!result.tasks||typeof result.tasks!=='object')fail('任务结果结构无效');for(const t of Object.keys(result.tasks)){const b=result.tasks[t];if(!TASKS.includes(t)||!b||typeof b.valid!=='boolean'||!finite(b.score,0,1000)||!finite(b.accuracy,0,1)||!finite(b.duration,0,1e7))fail('任务结果数值无效');for(const k of ['hits','shots','timeouts'])if(b[k]!==undefined&&(!Number.isInteger(b[k])||!finite(b[k],0,1e7)))fail('点击计数无效');if(t!=='track'&&(!Number.isInteger(b.hits)||!Number.isInteger(b.shots)||b.hits>b.shots))fail('点击结果缺少有效计数');for(const k of ['meanAcquireMs','rmsDeg','pathCm','frameFps','frameP95'])if(b[k]!==undefined&&b[k]!==null&&!finite(b[k],0,1e7))fail('任务诊断数值无效');if(b.raw!==undefined&&!['requested','fallback','unconfirmed','unknown'].includes(b.raw))fail('输入状态无效');if(b.trials!==undefined&&(!Array.isArray(b.trials)||b.trials.length>10000))fail('逐次记录无效');if(b.trace!==undefined&&(!Array.isArray(b.trace)||b.trace.length>20000))fail('跟踪记录无效')}
    if(result.rating!==undefined&&result.rating!==null&&(!finite(result.rating.effort,0,10)||typeof result.rating.pain!=='boolean'))fail('评分必须明确填写');if(result.completedAt&&!groupComplete({results:{[g.id]:result}},g))fail('完成标记缺少任务或评分');};
  for(const id of Object.keys(study.results)){const g=groups.find(g=>g.id===id);if(!g)fail('结果引用未知任务组');checkResult(study.results[id],g)}
  if(study.discardedRounds!==undefined&&(!Array.isArray(study.discardedRounds)||study.discardedRounds.length>1000))fail('废弃轮审计记录无效');
  for(const discarded of study.discardedRounds||[]){if(!discarded||!['screen','retest'].includes(discarded.stage)||!stageRounds[discarded.stage].includes(discarded.round)||!text(discarded.reason)||!date(discarded.created)||!discarded.records||typeof discarded.records!=='object'||Array.isArray(discarded.records))fail('废弃轮审计内容无效');for(const id of Object.keys(discarded.records)){const g=groups.find(g=>g.id===id);if(!g||g.stage!==discarded.stage||g.round!==discarded.round)fail('废弃记录引用错误比较轮');checkResult(discarded.records[id],g)}}
  const partialValid=p=>p&&typeof p==='object'&&TASKS.includes(p.task)&&finite(p.elapsed,0,1e12)&&Number.isInteger(p.hits)&&finite(p.hits,0,1e7)&&Number.isInteger(p.shots)&&finite(p.shots,0,1e7)&&p.hits<=p.shots&&Array.isArray(p.trials)&&p.trials.length<=10000&&Array.isArray(p.trace)&&p.trace.length<=20000&&finite(p.pathCm,0,1e7);
  for(const attempt of study.attempts){if(!attempt||!groups.some(g=>g.id===attempt.groupId)||!TASKS.includes(attempt.task)||attempt.valid!==false||!text(attempt.reason)||!date(attempt.created)||(attempt.partial!==null&&attempt.partial!==undefined&&!partialValid(attempt.partial)))fail('中断尝试记录无效')}
  for(const segment of study.segments){if(!segment||!date(segment.startedAt)||!text(segment.reason)||(segment.gapMs!==undefined&&!finite(segment.gapMs,0,1e12)))fail('会话片段记录无效')}
  if(study.warnings!==undefined&&(!Array.isArray(study.warnings)||study.warnings.length>10000||study.warnings.some(x=>!text(x))))fail('实验提示记录无效');
  if(study.completedAt!==undefined&&!date(study.completedAt))fail('结束时间无效');
  if(study.status==='abandoned'&&(study.runtime?.phase!=='abandoned'||typeof study.abandonedReason!=='string'||!study.abandonedReason.trim()||study.abandonedReason.length>1000||!date(study.completedAt)||Date.parse(study.completedAt)<Date.parse(study.created)))fail('主动结束状态缺少原因或有效结束时间');
  if(study.runtime!==undefined){
    const r=study.runtime,phases=['familiar','adapt','task','transition','rating','ratingRest','stageRest','done','stopped','abandoned'];
    if(!r||!phases.includes(r.phase)||!Number.isInteger(r.groupIndex)||!finite(r.groupIndex,0,groups.length)||!Number.isInteger(r.taskIndex)||!finite(r.taskIndex,0,3)||!finite(r.elapsed,0,1e12)||!finite(r.extraAdapt,0,1e12)||typeof r.paused!=='boolean'||typeof r.engaged!=='boolean'||(r.paused&&r.engaged)||!finite(r.createdWall,0,8640000000000000)||!finite(r.lastActiveAt,0,8640000000000000))fail('恢复运行状态无效');
    for(const key of ['pauseStartedAt','waitStartedAt','ratingStartedAt'])if(r[key]!==undefined&&!finite(r[key],0,8640000000000000))fail('恢复时间戳无效');
    if(r.restRemaining!==undefined&&!finite(r.restRemaining,0,11000))fail('剩余评分休息时间无效');
    if(r.roundPlannedStart!==undefined&&!finite(r.roundPlannedStart,0,1e12))fail('比较轮计划耗时基点无效');
    if(r.partial!==undefined&&r.partial!==null&&!partialValid(r.partial))fail('当前任务中断快照无效');
    if(r.phase!=='done'&&r.groupIndex>=groups.length)fail('当前条件索引超出计划');
    if(r.phase==='done'&&(r.groupIndex!==groups.length||!study.retest||!groups.every(g=>groupComplete(study,g))||!date(study.completedAt)))fail('已完成状态缺少全部结果');
    if(r.phase==='familiar'&&r.groupIndex!==0)fail('共同熟悉阶段索引无效');
    if(r.phase==='transition'&&r.taskIndex>2)fail('任务间过渡索引无效');
    const current=groups[r.groupIndex];
    if(r.phase==='stageRest'&&(!study.retest||current?.stage!=='retest'||current.round!==1))fail('阶段休息位置无效');
    if(['rating','ratingRest'].includes(r.phase)&&(!current||!TASKS.every(t=>blockValid(study.results[current.id]?.tasks?.[t]))||!finite(r.ratingStartedAt,0,8640000000000000)))fail('评分阶段缺少任务或开始时间');
    if(r.phase==='ratingRest'&&(!groupComplete(study,current)||!finite(r.restRemaining,0,11000)))fail('评分休息阶段缺少明确评分');
    if(r.phase==='stopped'&&(!date(study.completedAt)||!Object.values(study.results).some(result=>result.rating?.pain)))fail('不适停止状态缺少记录');
    if(r.phase==='abandoned'&&(study.status!=='abandoned'||r.paused||r.engaged))fail('主动结束状态不能仍在运行或暂停');
    if(!study.timing||typeof study.timing!=='object'||['plannedElapsedMs','activeMs','extraAdaptMs','ratingExtraMs','pauseMs','faultMs','waitMs'].some(k=>!finite(study.timing[k],0,1e12)))fail('实验耗时累计无效');
    if(!study.inputCheck||!Number.isInteger(study.inputCheck.events)||!finite(study.inputCheck.events,0,1e12)||!finite(study.inputCheck.dx,0,1e15)||!finite(study.inputCheck.dy,0,1e15))fail('输入检查计数无效');
    if(!study.segments.length)fail('缺少实际会话片段');
  }else if(study.timing!==undefined||study.inputCheck!==undefined)fail('恢复记录缺少运行状态');
  const computed=plan(study.mode,{screenCount:all.length,retestCount:study.retest?study.retest.candidateIds.length:Math.min(study.mode==='20min'?3:2,all.length)}).totalSeconds;if(study.plannedSeconds!==computed)fail('计划总时长不一致');
  analyze(study,'screen');if(study.retest)analyze(study,'retest');return study;
}
const api={VERSION,PROTOCOL_VERSION:VERSION,TASKS,NAMES,QUALITY,modeName,rng,shuffle,candidates,plan,groupSteps,createStudy,groupComplete,selectRetest,freezeRetest,analyze,validateStudy};
root.SensSession=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
