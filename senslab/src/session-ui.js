/* Single-session experiment runtime. No legacy study is modified. */
(function (root) {
'use strict';
function create(bridge) {
  const B=bridge, S=B.S||root.SensSession, M=B.M, doc=B.document||root.document;
  const clock=B.clock||{now:()=>performance.now(),wall:()=>Date.now(),raf:f=>requestAnimationFrame(f),caf:id=>cancelAnimationFrame(id)};
  const $=id=>doc.getElementById(id), esc=B.esc||String, fmt=B.fmt||((x,n=2)=>Number.isFinite(x)?x.toFixed(n):'—');
  const TASKS=['micro','switch','track','turn'], NAMES={micro:'微调精度',switch:'目标切换',track:'连续跟枪',turn:'大角度转向'};
  const TERMINAL=['done','stopped','abandoned'];
  const LONG_GAP=5*60*1000;
  let frame=null, live=null, disposed=false, storageFailed=false;
  const state=()=>B.getData();
  const activeStudy=()=>state().singleStudies?.find(x=>x.id===state().singleActive)||null;
  const runtime=()=>activeStudy()?.runtime;
  const isActive=()=>!!activeStudy()&&!TERMINAL.includes(runtime()?.phase)&&!!runtime()?.engaged;
  const iso=()=>new Date(clock.wall()).toISOString();
  const candidate=(s,g)=>s.candidates.find(c=>c.id===g.candidateId);
  const group=()=>{const s=activeStudy();return s?.groups[s.runtime.groupIndex]||null;};
  function stopFrame(){if(frame!==null)clock.caf(frame);frame=null;}
  function release(){live=null;stopFrame();B.releaseLock();}
  function save(){
    if(B.save()!==false){storageFailed=false;return true;}
    storageFailed=true;const r=runtime(),s=activeStudy();if(r){if(live&&live.phase==='task'&&r.phase==='task'&&live.task===group().taskOrder[r.taskIndex]){s.attempts.push({groupId:group().id,task:live.task,reason:'存储失败，当前任务中断',created:iso(),valid:false,partial:partial(live)});s.timing.faultMs+=r.elapsed;r.elapsed=0;r.partial=null;}if(!TERMINAL.includes(r.phase)){r.paused=true;r.pauseStartedAt??=clock.wall();}r.engaged=false;r.lastActiveAt=clock.wall();}
    release();B.modal('<h2>数据尚未写入浏览器</h2><p>已完成数据仍在本页内存中。请先导出备份，检查存储后继续；关闭页面可能丢失未保存内容。</p><div class="row"><button data-single-action="export">导出备份</button><button data-single-action="resume">重试保存并继续</button></div>');return false;
  }
  function rules(s){const c=s.configSnapshot;return `权重 ${c.weights.map(x=>Math.round(x*100)+'%').join(' / ')}；实用差异 ${fmt(c.margin*100,1)}%；单项下降上限 ${fmt(c.taskDrop*100,1)}%；微调命中率下降 ${fmt(c.accDrop*100,1)} 个百分点；费力度 ≤${c.maxEffort}。`;}
  function setupNote(){const d=state(),c=d.settings;return c?`${c.dpi} DPI · 基准约 ${fmt(c.baseCm,2)} cm/360 · 舒适横向行程 ${fmt(c.swipe,1)} cm（${(c.swipeEstimated??c.swipe===20)?'估计':'当前填写值'}，仅作范围提示）`:'基础设置尚未保存；可保留现有值后继续。';}
  function start(mode){
    if(storageFailed&&!save())return false;
    const unfinished=state().singleStudies?.find(x=>x.runtime&&!TERMINAL.includes(x.runtime.phase));if(unfinished){state().singleActive=unfinished.id;B.toast('已有未完成测试，请继续该测试；已完成成绩不会因重开而被挑选替换。',true);renderLab();return false;}
    if(painToday()){B.toast('今天已经记录疼痛或明显不适，请停止今天的正式测试；已有记录保留。',true);return false;}
    const status=B.calibrationStatus();if(!status.ready){B.toast(status.detail||status.title,true);renderLab();return false;}
    const d=state();if(!d.settings||!d.calibration||!B.inputCompatible(d.calibration.env,B.getEnv())||d.calibration.dpi!==d.settings.dpi){B.toast('DPI或物理输入校准不匹配，请查看具体设备提示；已有记录保留。',true);return false;}
    const s=S.createStudy({mode,config:structuredClone(d.settings),calibration:structuredClone(d.calibration),seed:seed(),id:B.uid(),now:iso(),provenance:{settings:'saved',parameterSources:structuredClone(d.parameterSources||{}),swipeEstimated:d.settings.swipeEstimated??d.settings.swipe===20,measurementNote:'基准保留原测量值；弧线和端点带来测量不确定性，不增加显示精度。'}});
    s.runtime={phase:'familiar',groupIndex:0,taskIndex:0,elapsed:0,extraAdapt:0,paused:true,engaged:false,lastActiveAt:clock.wall(),createdWall:clock.wall()};
    s.timing={plannedElapsedMs:0,activeMs:0,extraAdaptMs:0,ratingExtraMs:0,pauseMs:0,faultMs:0,waitMs:0};
    s.inputCheck={events:0,dx:0,dy:0};s.segments=[{startedAt:iso(),reason:'开始单次测试'}];
    (d.singleStudies??=[]).push(s);d.singleActive=s.id;
    if(!save())return false;showResume();renderLab();return true;
  }
  function seed(){return root.crypto?.getRandomValues?root.crypto.getRandomValues(new Uint32Array(1))[0]:Math.floor(Math.random()*4294967296);}
  function remaining(s){const completed=Object.values(s.results).reduce((n,r)=>n+TASKS.filter(t=>r.tasks?.[t]?.valid).length,0),future=s.retest?0:(s.mode==='20min'?9:4)*4;return Math.max(0,s.groups.length*4+future-completed);}
  function elapsedWall(s){return Math.max(0,(s.completedAt?Date.parse(s.completedAt):clock.wall())-s.runtime.createdWall);}
  function painToday(){
    const today=new Date(clock.wall()).toDateString();let found=false;
    function walk(v,date,depth=0){if(found||!v||typeof v!=='object'||depth>12)return;const stamp=v.answeredAt||v.completedAt||v.day||v.created||v.date||v.startedAt||date;if((v.pain===true||v.pain==='yes')&&stamp&&new Date(stamp).toDateString()===today){found=true;return;}for(const x of Object.values(v))if(x&&typeof x==='object')walk(x,stamp,depth+1);}
    walk(state().singleStudies);walk(state().studies);walk(state().field);return found;
  }
  function historyMarkup(){const all=state().singleStudies||[];return all.length>1?`<label class="space">单次实验历史<select id="singleHistory">${all.map(x=>`<option value="${esc(x.id)}" ${x.id===state().singleActive?'selected':''}>${esc(new Date(x.created).toLocaleString())} · ${x.mode==='20min'?'20分钟':'10分钟'} · ${x.runtime.phase==='done'?'完成':x.runtime.phase==='stopped'?'不适停止':x.runtime.phase==='abandoned'?'已结束（不完整）':'未完成'}</option>`).join('')}</select></label><button data-single-action="history">查看所选记录</button>`:'';}
  function selectHistory(id){const s=activeStudy();if(isActive()||live||s&&!TERMINAL.includes(s.runtime.phase)){B.toast('请先完成当前测试；测试期间不切换记录。',true);return false;}const found=state().singleStudies.find(x=>x.id===id);if(!found)return false;state().singleActive=id;if(!save())return false;renderLab();renderResults();B.go('results');return true;}
  function markRound(){const s=activeStudy(),r=s.runtime,g=group(),key=g.stage+'-'+g.round;if(r.roundKey!==key){r.roundKey=key;r.roundPlannedStart=s.timing.plannedElapsedMs;r.roundEnv=structuredClone(B.getEnv());}}
  function renderLab(){
    const el=$('singleLabRoot');if(!el)return;
    const s=activeStudy(),status=B.calibrationStatus();
    el.innerHTML=`<div class="card space"><div class="eyebrow">SINGLE SESSION · 同一天完成</div><h2>一次完整比较，再决定是否换敏</h2><p class="space">${esc(setupNote())}</p><details><summary>查看当前设置与分析规则</summary><p>已保存值优先；新实验冻结这些值。20 cm行程仅是估计，不参与评分或候选淘汰。窗口和FOV变化会暂停任务，不自动删除物理校准。</p><p>${s?esc(rules(s)):'沿用已保存的四项权重、实用差异及舒适度标准。'}</p><button data-single-action="settings">查看设备与校准</button></details>
      <p class="${status.ready?'accent':'warn'}">${esc(status.detail||status.title)}</p><div class="row space"><button class="primary" data-single-action="start20">开始20分钟完整测试</button><button data-single-action="start10">开始10分钟快速测试</button>${s&&!TERMINAL.includes(s.runtime?.phase)?'<button class="primary" data-single-action="resume">继续未完成测试</button><button data-single-action="abandon">结束本次并保留记录</button>':''}<button data-single-action="practice">不计分练习</button></div>${historyMarkup()}
      <p class="tiny space">20分钟：40秒熟悉＋5×80秒粗筛＋40秒休息＋3条件×3轮×80秒复测。10分钟：40＋3×80＋40＋2条件×2轮×70。每项正式任务固定12秒；适应不是充分训练的保证。评分超时、主动暂停、延长练习和故障重试另计。</p>
      ${s?`<div class="notice"><strong>${s.mode==='20min'?'本次会话内多轮复测':'快速局部筛选'}</strong> · 计划 ${fmt(s.plannedSeconds/60,1)} 分钟 · 实际经过 ${fmt(elapsedWall(s)/60000,1)} 分钟 · 额外主动/等待/故障时间 ${fmt(extra(s)/1000,0)} 秒 · 尚余 ${remaining(s)} 项正式任务（粗筛阶段包含预计复测）。${s.retest&&s.retest.candidateIds.length<(s.mode==='20min'?3:2)?'符合粗筛条件的候选较少；按实际 '+s.retest.candidateIds.length+' 个条件复测，计划已相应缩短。':''}${s.runtime.phase==='done'?'本次已完成，可查看结果。':s.runtime.phase==='stopped'?'已因不适停止，记录保留。':s.runtime.phase==='abandoned'?'本次已主动结束，记录不完整并保留。':s.runtime.paused?'已暂停，点击继续。':''}</div><button data-single-action="results">查看本次结果与进度</button>`:''}</div>`;
  }
  function extra(s){const t=s.timing;return t.extraAdaptMs+t.ratingExtraMs+t.pauseMs+t.faultMs+t.waitMs;}
  function showResume(){
    const s=activeStudy();if(!s)return;
    const r=s.runtime;if(TERMINAL.includes(r.phase)){B.closeStage();renderResults();B.go('results');return;}
    if(r.phase==='rating'){showRating();return;}
    if(r.phase==='ratingRest'){B.openStage();r.engaged=false;r.paused=false;showRest();makeLive();return;}
    B.openStage();r.engaged=false;r.paused=true;r.waitStartedAt??=clock.wall();
    const g=group(), name=r.phase==='familiar'?'40秒共同熟悉与输入检查':r.phase==='stageRest'?'粗筛完成 · 40秒阶段休息':`${g.stage==='screen'?'粗筛':'复测第'+g.round+'轮'} · 条件${candidate(s,g).label}`;
    B.modal(`<h2>${name}</h2><p>系统箭头会隐藏；屏幕中央白色准星是瞄准点。鼠标转动视角。微调、切换、转向用左键；跟枪只需持续覆盖目标。</p><p>每项正式任务12秒，零命中也会保留；Esc/失焦只中断当前任务。这只是数值遮蔽，不是真正双盲；手感仍可能被识别。</p><div class="row"><button class="primary" data-single-action="lock">锁定鼠标并继续</button>${['adapt','familiar'].includes(r.phase)?'<button data-single-action="extend">还没适应，延长练习15秒</button>':''}<button data-single-action="close">稍后继续</button></div>`);
  }
  function resume(){
    const s=activeStudy();if(!s)return;
    if(storageFailed&&!save())return;
    if(TERMINAL.includes(s.runtime.phase)){showResume();return;}
    if(!TERMINAL.includes(s.runtime.phase)&&blockChangedInput(s))return;
    const r=s.runtime,gap=Math.max(0,clock.wall()-(r.lastActiveAt||clock.wall()));
    if(r.pauseStartedAt!==undefined){const pausedFor=Math.max(0,clock.wall()-r.pauseStartedAt);s.timing.pauseMs+=pausedFor;if(r.phase==='rating'&&Number.isFinite(r.ratingStartedAt))r.ratingStartedAt+=pausedFor;delete r.pauseStartedAt;r.lastActiveAt=clock.wall();}
    if(gap>LONG_GAP){s.segments.push({startedAt:iso(),reason:'超过5分钟后恢复（工程分段阈值）',gapMs:gap});restartRound('长间隔恢复，重做本比较轮');}
    if(!save())return;showResume();
  }
  function changedInput(s){
    const current=state().settings;if(!current)return'当前已保存设备设置缺失';
    if(current.dpi!==s.calSnapshot.dpi)return`当前声明为 ${current.dpi} DPI，本次冻结校准使用 ${s.calSnapshot.dpi} DPI`;
    const original=s.calSnapshot.deviceNotes??s.configSnapshot.environment??'';
    if((current.environment||'')!==original)return'当前设备说明或输入路径声明与本次开始时不同';
    if(!B.inputCompatible(s.calSnapshot.env,B.getEnv()))return'当前浏览器输入环境与本次冻结校准不同';
    return null;
  }
  function blockChangedInput(s){
    const reason=changedInput(s);if(!reason)return false;
    if(live)pause(reason);else{release();const r=s.runtime;if(r.waitStartedAt!==undefined){s.timing.waitMs+=Math.max(0,clock.wall()-r.waitStartedAt);delete r.waitStartedAt;}r.paused=true;r.engaged=false;r.pauseStartedAt??=clock.wall();}
    if(storageFailed)return true;B.openStage();B.modal(`<h2>物理输入已变化，不能继续旧实验</h2><p>${esc(reason)}。请恢复本次原来的鼠标、DPI和输入路径后继续；如果确实已换设备，请结束本次并保留记录，再校准和新建实验。</p><p>冻结的校准与已完成记录不会被最新校准覆盖。仅修改基准、FOV或分析权重不会使原实验失效。</p><div class="row"><button data-single-action="close">返回并检查设备设置</button><button data-single-action="abandon-device">结束本次并保留记录</button></div>`);return true;
  }
  function requestLock(){const s=activeStudy();if(!s||TERMINAL.includes(s.runtime.phase)||blockChangedInput(s))return;const r=s.runtime;r.waitStartedAt??=clock.wall();B.requestLock();}
  function onLocked(){
    const s=activeStudy();if(!s)return false;
    if(['rating','ratingRest',...TERMINAL].includes(s.runtime.phase)){B.releaseLock();return false;}
    if(blockChangedInput(s))return false;
    s.runtime.paused=false;
    if(B.getRawMode()!=='requested'){pause('未确认原始输入，正式测试不开始');return false;}
    if(!B.inputCompatible(s.calSnapshot.env,B.getEnv())||s.calSnapshot.dpi!==s.configSnapshot.dpi){pause('设备、DPI或输入路径发生变化，请检查校准；已有记录保留');return false;}
    const old=s.runtime.roundEnv,now=B.getEnv();if(old&&(old.w!==now.w||old.h!==now.h)&&!['familiar','stageRest'].includes(s.runtime.phase)){s.segments.push({startedAt:iso(),reason:'恢复时显示尺寸变化'});restartRound('恢复时显示尺寸变化，重做本比较轮');}
    const r=s.runtime;if(['rating','ratingRest',...TERMINAL].includes(r.phase)){B.releaseLock();return false;}if(r.waitStartedAt!==undefined){s.timing.waitMs+=Math.max(0,clock.wall()-r.waitStartedAt);delete r.waitStartedAt;}
    r.paused=false;r.engaged=true;r.lastActiveAt=clock.wall();B.hideModal();makeLive();return true;
  }
  function phaseSeconds(){const s=activeStudy(),r=s.runtime,g=group();return r.phase==='familiar'?40:r.phase==='stageRest'?40:r.phase==='adapt'?g.adaptSeconds:r.phase==='task'?12:r.phase==='transition'?2:r.phase==='ratingRest'?(r.restRemaining||0)/1000:0;}
  function makeLive(){
    stopFrame();const s=activeStudy(),r=s.runtime,g=group(),task=r.phase==='task'?g.taskOrder[r.taskIndex]:'track';
    const rng=M.rng((g?.seed||s.seed)+(TASKS.indexOf(task)+3)*7321);
    live={owner:s.id,phase:r.phase,task,y:0,p:0,start:clock.now(),previous:clock.now(),env:structuredClone(B.getEnv()),radius:M.rad(1.1),target:M.vec(0,0),rng,nodes:Array.from({length:80},()=>({y:(rng()-.5)*1.65,p:(rng()-.5)*.4})),hits:0,shots:0,index:0,trials:[],trialStart:0,trialShots:0,onTime:0,sqTime:0,integrated:0,pathCm:0,frames:[],longFrames:0,trace:[],lastTrace:0,savedSecond:-1};
    if(r.phase==='task'&&task!=='track')spawn(live,0);
    schedule(live);
  }
  function schedule(owner){frame=clock.raf(now=>{if(disposed||live!==owner)return;frame=null;try{tick(now);}catch(e){pause('场景或输入处理异常：'+e.message);}});}
  function stepTime(dt){const s=activeStudy(),r=s.runtime;r.elapsed+=dt;s.timing.activeMs+=dt;r.lastActiveAt=clock.wall();}
  function tick(now){
    const l=live,s=activeStudy();if(!l||!s||s.id!==l.owner)return;
    const r=s.runtime,dt=Math.max(0,now-l.previous);l.previous=now;
    if(r.phase==='ratingRest'){
      stepTime(Math.min(dt,Math.max(0,phaseSeconds()*1000-r.elapsed)));
      if($('singleRestTime'))$('singleRestTime').textContent=Math.ceil(Math.max(0,phaseSeconds()*1000-r.elapsed)/1000);
      if(r.elapsed>=phaseSeconds()*1000){advanceGroup();return;}schedule(l);return;
    }
    if(doc.pointerLockElement!==B.getArena()){pause('鼠标锁定丢失');return;}
    const current=B.getEnv();if(JSON.stringify(current)!==JSON.stringify(l.env)){pause('显示环境变化，当前任务暂停',{restartRound:true});return;}
    if(dt>250||dt>100&&++l.longFrames>=3){pause('显著卡顿，当前任务作为故障中断');return;}
    if(dt>0)l.frames.push(dt);
    const base=phaseSeconds()*1000,limit=base+(['adapt','familiar'].includes(r.phase)?r.extraAdapt:0),step=Math.min(dt,Math.max(0,limit-r.elapsed));
    stepTime(step);
    if(r.phase==='task'){
      const elapsed=r.elapsed;
      if(l.task==='track'){
        l.target=tracking(l,elapsed/1000);const error=M.angle(M.vec(l.y,l.p),l.target);
        l.onTime+=(error<=l.radius?step:0);l.sqTime+=error*error*step;l.integrated+=step;
        if(elapsed-l.lastTrace>=200){l.trace.push([elapsed,M.deg(error)]);l.lastTrace=elapsed;}
      }else if(elapsed<12000&&elapsed-l.trialStart>=(l.task==='turn'?5000:4000))trial(false,elapsed,true);
    }else if(['adapt','familiar'].includes(r.phase))l.target=tracking(l,(r.elapsed%30000)/1000);
    const g=group(),cand=g?candidate(s,g):s.candidates.find(c=>c.baseline);
    $('hudTitle').textContent=r.phase==='task'?NAMES[l.task]:r.phase==='familiar'?'共同熟悉 · 不计分':r.phase==='adapt'?'条件适应 · 不计分':r.phase==='transition'?'任务过渡 · 不计分':'阶段休息 · 不计分';
    $('hudDetail').textContent=`${g&&r.phase!=='familiar'?`${g.stage==='screen'?'粗筛':'复测第'+g.round+'轮'} · 条件${cand.label} · `:''}计划 ${fmt(s.plannedSeconds/60,1)} 分钟 · 剩余 ${remaining(s)} 项`;
    $('hudRight').textContent=Math.max(0,(limit-r.elapsed)/1000).toFixed(1)+' s';
    $('hudInput').textContent=`原始输入已请求 · ${s.inputCheck.events} 次移动事件（不代替物理校准）`;
    const upcoming=r.phase==='transition'?g.taskOrder[r.taskIndex+1]:r.phase==='adapt'?g.taskOrder[0]:l.task,operation=upcoming==='track'?'准星持续覆盖目标，无需开火':'准星瞄准目标后左键单击';
    $('stageHelp').textContent=`系统箭头已隐藏 · 中央准星瞄准 · ${['adapt','transition'].includes(r.phase)?'接下来 '+NAMES[upcoming]+'：':''}${operation} · ${['adapt','familiar'].includes(r.phase)?'E再练15秒 · ':''}Esc暂停`;
    B.drawScene(B.ctx,current.w,current.h,l.y,l.p,['task','adapt','familiar'].includes(r.phase)?l.target:null,l.radius,B.actualHFov(s.configSnapshot,current.w,current.h));
    const second=Math.floor(r.elapsed/1000);if(second!==l.savedSecond){l.savedSecond=second;r.partial=r.phase==='task'?partial(l):null;if(!save())return;}
    if(r.elapsed>=limit){finishPhase();return;}schedule(l);
  }
  function partial(l){return{task:l.task,elapsed:runtime().elapsed,hits:l.hits,shots:l.shots,trials:structuredClone(l.trials),trace:structuredClone(l.trace),pathCm:l.pathCm};}
  function finishPhase(){
    const s=activeStudy(),r=s.runtime,l=live,g=group();if(!l)return;
    if(r.phase==='task'){
      if(l.task!=='track')l.trials.push({index:l.index,hit:false,censored:true,ms:r.elapsed-l.trialStart,shots:l.trialShots});
      const accuracy=l.task==='track'?l.onTime/12000:l.hits/Math.max(1,l.shots);
      const b={valid:true,task:l.task,duration:12000,actualDuration:r.elapsed,score:l.task==='track'?accuracy:l.hits/12,accuracy,hits:l.hits,shots:l.shots,timeouts:l.trials.filter(x=>x.timeout).length,meanAcquireMs:l.trials.some(x=>x.hit)?M.mean(l.trials.filter(x=>x.hit).map(x=>x.ms)):null,rmsDeg:l.task==='track'?M.deg(Math.sqrt(l.sqTime/12000)):null,pathCm:l.pathCm,trials:l.trials,trace:l.trace,frameFps:1000/M.median(l.frames),raw:B.getRawMode(),seed:g.seed,env:l.env,created:iso(),unfinishedTarget:'right-censored-at-12s'};
      const result=s.results[g.id]??={tasks:{},env:l.env};
      if(!result.tasks[l.task])result.tasks[l.task]=b;
      s.timing.plannedElapsedMs+=12000;r.partial=null;
      if(r.taskIndex<3){r.phase='transition';r.elapsed=0;}else{r.phase='rating';r.elapsed=0;r.ratingStartedAt=clock.wall();r.engaged=false;release();if(save())showRating();return;}
    }else if(r.phase==='familiar'){
      if(s.inputCheck.events<2){s.timing.faultMs+=r.elapsed;r.elapsed=0;pause('40秒内没有收到足够鼠标移动；这只是输入检查，重新熟悉后再进入正式计分');return;}
      s.timing.plannedElapsedMs+=40000;s.timing.extraAdaptMs+=Math.max(0,r.elapsed-40000);r.phase='adapt';r.elapsed=0;r.extraAdapt=0;markRound();
    }else if(r.phase==='adapt'){
      s.timing.plannedElapsedMs+=g.adaptSeconds*1000;s.timing.extraAdaptMs+=Math.max(0,r.elapsed-g.adaptSeconds*1000);(s.results[g.id]??={tasks:{}}).adaptMs=r.elapsed;r.phase='task';r.taskIndex=0;r.elapsed=0;r.extraAdapt=0;
    }else if(r.phase==='transition'){s.timing.plannedElapsedMs+=2000;r.phase='task';r.taskIndex++;r.elapsed=0;}
    else if(r.phase==='stageRest'){s.timing.plannedElapsedMs+=40000;r.phase='adapt';r.elapsed=0;r.taskIndex=0;markRound();}
    if(save())makeLive();
  }
  function showRating(){
    const s=activeStudy(),r=s.runtime,g=group();release();r.engaged=false;r.paused=false;B.openStage();
    B.modal(`<h2>条件${candidate(s,g).label} · 记录感受</h2><p>请明确回答两项。页面会等待，不自动填0分或“无疼痛”。评分与短休预算共${g.ratingSeconds}秒，超过部分计为额外耗时。</p><div class="formgrid"><label>费力度（0–10）<select id="singleEffort"><option value="">请选择</option>${Array.from({length:11},(_,i)=>`<option value="${i}">${i}</option>`).join('')}</select></label><label>疼痛或明显不适<select id="singlePain"><option value="">请选择</option><option value="no">没有</option><option value="yes">有，停止测试</option></select></label></div><button class="primary" data-single-action="rate">保存评分</button><p id="singleRatingError" class="bad"></p>`);
  }
  function showRest(){B.modal('<h2>评分已保存 · 短暂休息</h2><p>剩余 <span id="singleRestTime">'+Math.ceil(Math.max(0,phaseSeconds()*1000-runtime().elapsed)/1000)+'</span> 秒。下一组需点击重新锁定鼠标。</p><button data-single-action="close">暂停，稍后继续</button>');}
  function rate(effort,pain){
    const s=activeStudy(),r=s?.runtime,g=group();if(!s||r.phase!=='rating')return false;
    if(effort===''||!Number.isInteger(+effort)||+effort<0||+effort>10||!['yes','no'].includes(pain)){if($('singleRatingError'))$('singleRatingError').textContent='请选择费力度，并明确选择是否疼痛。';return false;}
    const elapsed=Math.max(0,clock.wall()-r.ratingStartedAt),budget=g.ratingSeconds*1000;
    const result=s.results[g.id];result.rating={effort:+effort,pain:pain==='yes',answeredAt:iso()};result.completedAt=iso();result.ratingMs=elapsed;
    s.timing.ratingExtraMs+=Math.max(0,elapsed-budget);s.timing.plannedElapsedMs+=Math.min(elapsed,budget);
    if(pain==='yes'){r.phase='stopped';r.engaged=false;s.status='stopped';s.stoppedReason='疼痛或明显不适';s.completedAt=iso();if(!save())return false;B.modal('<h2>已记录不适，测试停止</h2><p>请停止今天的测试。已完成记录保留，不通过舒适度守门线；不必为了凑满计划继续。</p><button data-single-action="results">查看已有记录</button>');renderLab();return true;}
    r.restRemaining=Math.max(0,budget-elapsed);r.phase='ratingRest';r.elapsed=0;r.engaged=false;if(!save())return false;
    if(r.restRemaining===0)advanceGroup();else{showRest();makeLive();}return true;
  }
  function advanceGroup(){
    const s=activeStudy(),r=s.runtime,g=group();s.timing.plannedElapsedMs+=r.restRemaining||0;r.restRemaining=0;r.groupIndex++;r.taskIndex=0;r.elapsed=0;release();
    if(g.stage==='screen'&&r.groupIndex===s.groups.length){S.freezeRetest(s,{now:iso()});r.phase='stageRest';}
    else if(r.groupIndex>=s.groups.length){r.phase='done';s.status='completed';s.completedAt=iso();r.engaged=false;r.paused=false;if(save()){B.closeStage();renderLab();renderResults();B.go('results');}return;}
    else{r.phase='adapt';markRound();}
    r.paused=true;r.engaged=false;r.lastActiveAt=clock.wall();r.waitStartedAt=clock.wall();if(save()){showResume();renderLab();}
  }
  function restartRound(reason){
    const s=activeStudy(),r=s.runtime,g=group();if(!g||['familiar','stageRest'].includes(r.phase))return;
    const ids=s.groups.filter(x=>x.stage===g.stage&&x.round===g.round).map(x=>x.id);
    const records={};for(const id of ids)if(s.results[id]){records[id]=structuredClone(s.results[id]);delete s.results[id];}
    const spent=Math.max(0,s.timing.plannedElapsedMs-(r.roundPlannedStart??s.timing.plannedElapsedMs));
    s.timing.faultMs+=spent+(['adapt','transition','ratingRest'].includes(r.phase)?r.elapsed:0);s.timing.plannedElapsedMs-=spent;
    (s.discardedRounds??=[]).push({stage:g.stage,round:g.round,reason,created:iso(),records});
    r.groupIndex=s.groups.findIndex(x=>x.id===ids[0]);r.taskIndex=0;r.phase='adapt';r.elapsed=0;r.extraAdapt=0;r.roundEnv=structuredClone(B.getEnv());
    s.warnings??=[];s.warnings.push(reason+'；原轮全部记录保留在备份中，不混入新的配对轮。');
  }
  function pause(reason,options={}){
    const s=activeStudy(),r=s?.runtime;if(!s||TERMINAL.includes(r.phase))return;
    if(r.paused&&!live)return;
    if(live&&r.phase==='task'){
      s.attempts.push({groupId:group().id,task:live.task,reason,created:iso(),valid:false,partial:partial(live)});s.timing.faultMs+=r.elapsed;r.elapsed=0;r.partial=null;
    }
    if(!r.paused||r.pauseStartedAt===undefined){r.lastActiveAt=clock.wall();r.pauseStartedAt=clock.wall();}delete r.waitStartedAt;r.paused=true;r.engaged=false;release();
    if(options.restartRound||/窗口|视野|FOV|显示环境/.test(reason)){s.segments.push({startedAt:iso(),reason});restartRound(reason);}
    if(!save())return;
    B.modal(`<h2>本次测试已暂停</h2><p>${esc(reason)}。已完成任务保留；当前中断任务及原因也会保存，不按得分选择重测。</p><p>恢复超过5分钟将分段记录；复测阶段重做当前配对轮，保留旧轮历史。窗口变化不自动清除物理校准。</p><div class="row"><button class="primary" data-single-action="resume">准备好，继续</button>${['adapt','familiar'].includes(r.phase)?'<button data-single-action="extend">还没适应，延长练习15秒</button>':''}<button data-single-action="close">稍后继续</button></div>`);renderLab();
  }
  function abandon(reason='用户主动结束本次测试'){
    const s=activeStudy();if(!s||TERMINAL.includes(s.runtime.phase))return false;
    const confirm=B.confirm||root.confirm;if(!confirm||!confirm('结束本次并保留记录？已完成成绩和中断记录全部保留，本次标记为不完整，不给换敏推荐。原因：'+reason))return false;
    pause(reason);const r=s.runtime;if(r.pauseStartedAt!==undefined){s.timing.pauseMs+=Math.max(0,clock.wall()-r.pauseStartedAt);delete r.pauseStartedAt;}
    release();r.phase='abandoned';r.paused=false;r.engaged=false;s.status='abandoned';s.abandonedReason=String(reason).slice(0,1000);s.completedAt=iso();
    if(!save())return false;B.closeStage();renderLab();renderResults();B.go('results');return true;
  }
  function extend(){const s=activeStudy(),r=s?.runtime;if(!r||!['adapt','familiar'].includes(r.phase))return;r.extraAdapt+=15000;(s.extensions??=[]).push({phase:r.phase,groupId:group()?.id,seconds:15,created:iso()});save();B.toast('已增加15秒不计分练习，实际流程将延长。');}
  function spawn(l,t){const sets=l.task==='micro'?[2,4,7]:l.task==='switch'?[15,30,45]:[90,120,160],a=M.rad(sets[l.index%3]);let phi=l.task==='turn'?(l.rng()<.5?0:Math.PI)+(l.rng()-.5)*.07:l.rng()*2*Math.PI;l.radius=M.rad(l.task==='micro'?(l.index%2?.5:.3):l.task==='switch'?(l.index%2?1.1:.8):2);l.target=M.relative(l.y,l.p,a,phi);if(Math.abs(l.target[1])>Math.sin(M.rad(65)))l.target=M.relative(l.y,l.p,a,l.rng()<.5?0:Math.PI);l.amplitude=M.deg(a);l.trialStart=t;l.trialShots=0;}
  function trial(hit,t,timeout=false){const l=live;l.trials.push({index:l.index,hit,timeout,ms:t-l.trialStart,shots:l.trialShots,errorDeg:M.deg(M.angle(M.vec(l.y,l.p),l.target)),amplitude:l.amplitude,radiusDeg:M.deg(l.radius)});if(hit)l.hits++;l.index++;spawn(l,t);}
  function cat(a,b,c,d,t){return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);}
  function tracking(l,sec){const v=sec/1.15,k=Math.floor(v),t=v-k,n=l.nodes;return M.vec(cat(n[k].y,n[k+1].y,n[k+2].y,n[k+3].y,t),cat(n[k].p,n[k+1].p,n[k+2].p,n[k+3].p,t));}
  function mousemove(e){
    if(!isActive()||!live||doc.pointerLockElement!==B.getArena())return;
    const dx=e.movementX,dy=e.movementY;if(!Number.isFinite(dx)||!Number.isFinite(dy)){pause('输入事件含非有限数值');return;}
    if(!dx&&!dy)return;const s=activeStudy(),l=live,g=group(),cm=runtime().phase==='familiar'?s.configSnapshot.baseCm:g?candidate(s,g).cm:s.configSnapshot.baseCm;
    s.inputCheck.events++;s.inputCheck.dx+=Math.abs(dx);s.inputCheck.dy+=Math.abs(dy);
    l.y+=dx/s.calSnapshot.ux*2*Math.PI/cm;l.y=Math.atan2(Math.sin(l.y),Math.cos(l.y));l.p=M.clamp(l.p-dy/s.calSnapshot.uy*2*Math.PI/cm,-M.rad(85),M.rad(85));l.pathCm+=Math.hypot(dx/s.calSnapshot.ux,dy/s.calSnapshot.uy);
  }
  function mousedown(e){if(e.button!==0||!isActive()||!live||runtime().phase!=='task'||live.task==='track'||doc.pointerLockElement!==B.getArena())return;e.preventDefault();const t=runtime().elapsed;live.shots++;live.trialShots++;if(t-live.trialStart<(live.task==='micro'?80:100))return;if(M.angle(M.vec(live.y,live.p),live.target)<=live.radius)trial(true,t);}
  function keydown(e){if(isActive()&&e.code==='KeyE'&&!e.repeat){e.preventDefault();extend();}}
  function driftText(d){if(!d)return'尚无足够基准记录';const f=x=>Number.isFinite(x)?fmt(x*100,1)+'%':'数据不足';return '粗筛到复测均值 '+f(d.screenToRetest)+'，首轮到末轮复测 '+f(d.roundChange)+'。'+(d.note||'');}
  function renderResults(){
    const el=$('singleResultsRoot'),s=activeStudy();if(!el)return false;
    if(!s){el.innerHTML='<div class="card space"><h2>单次测试结果</h2><p>还没有单次实验。旧多日实验保留在下方高级历史中。</p></div>';return false;}
    const a=S.analyze(s,'retest'),rec=a.recommendation,full=TERMINAL.includes(s.runtime.phase),ready=s.runtime.phase==='done'&&rec.action==='try-candidate';
    const headline=s.runtime.phase==='abandoned'?'本次已结束：记录不完整，不作换敏推荐':s.runtime.phase==='stopped'?'因疼痛或不适停止：不作换敏推荐':!full?'测试尚未完成：当前仅显示记录':rec.action==='insufficient'?'本次数据不足：尚不能判断换敏收益':ready?`本次更值得游戏试用：约 ${fmt(rec.cm,2)} cm/360`:'当前证据支持保留原灵敏度';
    const rowHtml=a.rows.map(x=>`<tr><td>${fmt(x.cm,2)}${x.baseline?' · 基准':''}</td><td>${fmt(x.angleGain,3)}×（${fmt(x.angleGainChange*100,1)}%）</td><td>${fmt(x.relative,3)}</td>${x.taskRatios.map(y=>`<td>${Number.isFinite(y)?fmt((y-1)*100,1)+'%':'缺少有效配对'}</td>`).join('')}<td>${x.positiveRounds}/${a.requiredRounds}轮向上</td><td>${fmt(x.effort,1)} / 疼痛${x.pains}</td><td>${esc([...(x.gateReasons||[]),...(x.missingReasons||[])].join('；')||'通过本次工程检查')}</td></tr>`).join('');
    const raw=s.groups.map(g=>{const result=s.results[g.id];if(!result)return'';return TASKS.map(t=>{const b=result.tasks?.[t];return b?`<tr><td>${g.stage==='screen'?'粗筛':'复测第'+g.round+'轮'}</td><td>${full?fmt(candidate(s,g).cm,2):'条件'+candidate(s,g).label}</td><td>${NAMES[t]}</td><td>${fmt(b.score,3)}</td><td>${fmt(b.accuracy*100,1)}%</td><td>${b.hits}/${b.shots}</td><td>${fmt(b.meanAcquireMs,0)}ms</td><td>${b.timeouts}</td><td>${fmt(b.rmsDeg,2)}°</td></tr>`:'';}).join('');}).join('');
    el.innerHTML=`<div class="card space"><div class="eyebrow">${s.mode==='10min'?'快速局部筛选':'本次会话内多轮复测'}</div><h2>${headline}</h2><p class="space">${esc(s.runtime.phase==='abandoned'?s.abandonedReason:full?rec.reason:'完成预定复测后才作最终判断。粗筛成绩不会混入复测比较。')}</p><p>计划 ${fmt(s.plannedSeconds/60,1)} 分钟；实际经过 ${fmt(elapsedWall(s)/60000,1)} 分钟；已完成配对轮 ${a.pairedRounds}/${a.requiredRounds}。结果不代表终身最佳或跨日独立验证，不提供正式95%区间。</p>${a.boundary?'<p class="warn">领先点位于搜索边界，最佳点可能仍在范围外；不外推未测数值。</p>':''}${[...(a.warnings||[]),...(s.warnings||[])].map(w=>`<p class="warn">${esc(w)}</p>`).join('')}
    <p class="tiny">工程最低数据线：每任务有效时长≥11.9秒，点选每块至少2次命中与3次射击才支持可信比较；零命中仍保留，不能用极小数制造优势。所有正式左键都计入射击次数；双击保护仅拒绝微调80ms、切换/转向100ms以内的过早命中，不删除误点。跟枪按真实时间加权。12秒末尾未完成目标按右删失记录，保留全部12秒作分母，不额外计超时。</p>
    ${full?`<div class="tablewrap"><table><thead><tr><th>cm/360</th><th>相对角增益</th><th>综合相对表现</th>${TASKS.map(t=>`<th>${NAMES[t]}</th>`).join('')}<th>方向一致性</th><th>费力/疼痛</th><th>检查</th></tr></thead><tbody>${rowHtml}</tbody></table></div><div class="row">${ready?`<button class="primary" data-single-action="adopt" data-cm="${rec.cm}">采用此候选，进入跨游戏换算</button>`:''}<button data-single-action="keep">保留原灵敏度</button><button data-single-action="export">导出备份</button></div>`:'<button data-single-action="resume">继续未完成测试</button>'}
    <details><summary>四项原始表现（粗筛与复测分列）</summary><div class="tablewrap"><table><thead><tr><th>阶段</th><th>条件</th><th>任务</th><th>命中/秒或跟枪占比</th><th>命中率</th><th>命中/射击</th><th>获取时间</th><th>超时</th><th>RMS</th></tr></thead><tbody>${raw}</tbody></table></div></details>
    ${full?`<details><summary>各轮变化与冻结规则</summary><p>${esc(rules(s))}</p>${a.rows.map(x=>`<p>${fmt(x.cm,2)} cm/360：${x.rounds.map(r=>`第${r.round}轮 ${fmt(r.relative,3)}×`).join('；')}；范围 ${x.range?x.range.map(y=>fmt(y,3)).join(' ～ '):'不足'}</p>`).join('')}<p>基准状态变化：${esc(driftText(a.drift))}。不据此删除后半程成绩。</p><p>表现接近的已测试候选：${a.near.map(x=>fmt(x.cm,2)).join('、')||'样本不足'}；未测中间值不构成已验证区间。</p></details>`:''}<p class="tiny space">基准保留原测量不确定性。请在烽火地带和全面战场的正常游戏中复核；不强制再完成6天才能使用本次结果。</p></div>`;return true;
  }
  function click(e){const b=e.target.closest('[data-single-action]');if(!b||b.disabled)return;const a=b.dataset.singleAction;e.preventDefault();if(a==='start20')start('20min');else if(a==='start10')start('10min');else if(a==='resume')resume();else if(a==='lock')requestLock();else if(a==='rate')rate($('singleEffort').value,$('singlePain').value);else if(a==='extend')extend();else if(a==='close'){if(live)pause('用户暂停');B.closeStage();renderLab();}else if(a==='results'){B.closeStage();renderResults();B.go('results');}else if(a==='settings')B.go('setup');else if(a==='practice')$('practiceBtn').click();else if(a==='export')B.exportJSON();else if(a==='adopt')B.adoptCm(+b.dataset.cm,activeStudy().configSnapshot.dpi);else if(a==='abandon')abandon();else if(a==='abandon-device')abandon('设备、DPI或输入路径已改变');else if(a==='history')selectHistory($('singleHistory').value);else if(a==='keep')B.adoptCm(activeStudy().configSnapshot.baseCm,activeStudy().configSnapshot.dpi);}
  doc.addEventListener('mousemove',mousemove);B.getArena().addEventListener('mousedown',mousedown);doc.addEventListener('keydown',keydown);doc.addEventListener('click',click);
  function recoverLoaded(persist=false){
    const restored=activeStudy();if(restored?.runtime&&!TERMINAL.includes(restored.runtime.phase)){
      const r=restored.runtime;if(r.phase==='task'&&(r.engaged||r.elapsed>0||r.partial)){restored.attempts.push({groupId:restored.groups[r.groupIndex]?.id,task:restored.groups[r.groupIndex]?.taskOrder[r.taskIndex],valid:false,reason:'网页刷新或导入，当前任务中断',created:iso(),partial:r.partial||null});restored.timing.faultMs+=r.elapsed;r.elapsed=0;r.partial=null;}
      r.paused=true;r.engaged=false;r.pauseStartedAt??=r.lastActiveAt;restored.segments.push({startedAt:iso(),reason:'刷新或导入后恢复'});if(persist)save();
    }
  }
  function onWorkspaceLoaded(){release();storageFailed=false;recoverLoaded(true);renderLab();renderResults();}
  recoverLoaded();
  function dispose(){disposed=true;stopFrame();doc.removeEventListener?.('mousemove',mousemove);B.getArena().removeEventListener?.('mousedown',mousedown);doc.removeEventListener?.('keydown',keydown);doc.removeEventListener?.('click',click);}
  return{isActive,onLocked,pause,renderLab,renderResults,activeStudy,dispose,start,resume,rate,extend,requestLock,onWorkspaceLoaded,selectHistory,abandon};
}
root.SensSessionApp={create};if(typeof module!=='undefined'&&module.exports)module.exports=root.SensSessionApp;
})(typeof globalThis!=='undefined'?globalThis:window);
