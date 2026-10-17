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
  let frame=null, live=null, disposed=false, storageFailed=false,held=false,lastEscapeAt=-Infinity;
  const state=()=>B.getData();
  const activeStudy=()=>state().singleStudies?.find(x=>x.id===state().singleActive)||null;
  const runtime=()=>activeStudy()?.runtime;
  const deep=(s=activeStudy())=>s?.mode==='120min';
  const protocol=()=>activeStudy()?.protocolConfig||S.protocol('120min');
  const taskRules=()=>deep()?activeStudy().protocolConfig.taskRules:null;
  const quality=()=>deep()?activeStudy().qualityRules:{maxFrameGapMs:250,maxLongFrameMs:100,maxLongFrames:3,traceIntervalMs:200,clickMinimumMs:{micro:80,switch:100,turn:100}};
  const modeLabel=s=>deep(s)?'120分钟深度实验':s.mode==='20min'?'本次会话内多轮复测':'快速局部筛选';
  const restPhase=r=>deep()&&['initialRest','screenRest','stageRest','postRest'].includes(r.phase);
  const practicePhase=r=>deep()&&['tutorial','warmup','adapt'].includes(r.phase);
  const meta=(s,g=group())=>deep(s)?S.recordMeta(s,g||null,s.sessionSegment):{};
  function segment(s,reason,extra={}){if(deep(s))s.sessionSegment=(s.sessionSegment||1)+1;s.segments.push({startedAt:iso(),reason,...extra,...(deep(s)?{sessionId:s.sessionId,sessionSegment:s.sessionSegment}:{})});}
  function interruptionType(reason){return clock.wall()-lastEscapeAt<1000?'user':/卡顿|异常|失焦|锁定丢失|切换标签|窗口|显示|存储|刷新|输入|DPI|设备|浏览器/.test(reason)?'technical':'user';}
  const isActive=()=>!!activeStudy()&&!TERMINAL.includes(runtime()?.phase)&&!!runtime()?.engaged;
  const iso=()=>new Date(clock.wall()).toISOString();
  const candidate=(s,g)=>s.candidates.find(c=>c.id===g.candidateId);
  const group=()=>{const s=activeStudy();return s?.groups[s.runtime.groupIndex]||null;};
  function stopFrame(){if(frame!==null)clock.caf(frame);frame=null;}
  function release(){held=false;live=null;stopFrame();B.releaseLock();}
  function save(){
    if(B.save()!==false){storageFailed=false;return true;}
    storageFailed=true;const r=runtime(),s=activeStudy();if(r){if(live&&live.phase==='task'&&r.phase==='task'&&live.task===group().taskOrder[r.taskIndex]){s.attempts.push({groupId:group().id,task:live.task,...meta(s),type:'technical',reason:'存储失败，当前任务中断',created:iso(),valid:false,partial:partial(live)});s.timing.faultMs+=r.elapsed;r.elapsed=0;r.partial=null;}if(!TERMINAL.includes(r.phase)){r.paused=true;r.pauseStartedAt??=clock.wall();}r.engaged=false;r.lastActiveAt=clock.wall();}
    release();B.modal('<h2>数据尚未写入浏览器</h2><p>已完成数据仍在本页内存中。请先导出备份，检查存储后继续；关闭页面可能丢失未保存内容。</p><div class="row"><button data-single-action="export">导出备份</button><button data-single-action="resume">重试保存并继续</button></div>');return false;
  }
  function rules(s){const c=s.configSnapshot;return `权重 ${c.weights.map(x=>Math.round(x*100)+'%').join(' / ')}；实用差异 ${fmt(c.margin*100,1)}%；单项下降上限 ${fmt(c.taskDrop*100,1)}%；微调命中率下降 ${fmt(c.accDrop*100,1)} 个百分点；费力度 ≤${c.maxEffort}。`;}
  function setupNote(){const d=state(),c=d.settings;return c?`${c.dpi} DPI · 基准约 ${fmt(c.baseCm,2)} cm/360 · 舒适横向行程 ${fmt(c.swipe,1)} cm（${(c.swipeEstimated??c.swipe===20)?'估计':'当前填写值'}，仅作范围提示）`:'基础设置尚未保存；可保留现有值后继续。';}
  function start(mode='120min'){
    if(storageFailed&&!save())return false;
    const unfinished=state().singleStudies?.find(x=>x.runtime&&!TERMINAL.includes(x.runtime.phase));if(unfinished){state().singleActive=unfinished.id;B.toast('已有未完成测试，请继续该测试；已完成成绩不会因重开而被挑选替换。',true);renderLab();return false;}
    if(painToday()){B.toast('今天已经记录疼痛或明显不适，请停止今天的正式测试；已有记录保留。',true);return false;}
    const status=B.calibrationStatus();if(!status.ready){B.toast(status.detail||status.title,true);renderLab();return false;}
    const d=state();if(!d.settings||!d.calibration||!B.inputCompatible(d.calibration.env,B.getEnv())||d.calibration.dpi!==d.settings.dpi){B.toast('DPI或物理输入校准不匹配，请查看具体设备提示；已有记录保留。',true);return false;}
    const s=S.createStudy({mode,config:structuredClone(d.settings),calibration:structuredClone(d.calibration),seed:seed(),id:B.uid(),now:iso(),provenance:{settings:'saved',parameterSources:structuredClone(d.parameterSources||{}),swipeEstimated:d.settings.swipeEstimated??d.settings.swipe===20,measurementNote:'基准保留原测量值；弧线和端点带来测量不确定性，不增加显示精度。'}});
    s.runtime={phase:'familiar',groupIndex:0,taskIndex:0,elapsed:0,extraAdapt:0,paused:true,engaged:false,lastActiveAt:clock.wall(),createdWall:clock.wall()};
    s.timing={plannedElapsedMs:0,activeMs:0,extraAdaptMs:0,ratingExtraMs:0,pauseMs:0,faultMs:0,waitMs:0};
    s.inputCheck={events:0,dx:0,dy:0};s.segments=[{startedAt:iso(),reason:'开始单次测试'}];
    if(deep(s)){s.runtime.phase='preflight';s.runtime.preflightStartedAt=clock.wall();s.runtime.paused=false;s.runtime.practiceIndex=0;s.runtime.extraRest=0;s.timing.extraRestMs=0;s.preflightSavedSeconds=0;s.sessionSegment=1;s.segments[0].sessionId=s.sessionId;s.segments[0].sessionSegment=1;s.interruptions=[];}
    (d.singleStudies??=[]).push(s);d.singleActive=s.id;
    if(!save())return false;showResume();renderLab();return true;
  }
  function seed(){return root.crypto?.getRandomValues?root.crypto.getRandomValues(new Uint32Array(1))[0]:Math.floor(Math.random()*4294967296);}
  function remaining(s){const completed=Object.values(s.results).reduce((n,r)=>n+TASKS.filter(t=>r.tasks?.[t]?.valid).length,0),future=s.retest?0:(deep(s)||s.mode==='20min'?9:4)*4;return Math.max(0,s.groups.length*4+future-completed);}
  function elapsedWall(s){return Math.max(0,(s.completedAt?Date.parse(s.completedAt):clock.wall())-s.runtime.createdWall);}
  function painToday(){
    const today=new Date(clock.wall()).toDateString();let found=false;
    function walk(v,date,depth=0){if(found||!v||typeof v!=='object'||depth>12)return;const stamp=v.answeredAt||v.completedAt||v.day||v.created||v.date||v.startedAt||date;if((v.pain===true||v.pain==='yes')&&stamp&&new Date(stamp).toDateString()===today){found=true;return;}for(const x of Object.values(v))if(x&&typeof x==='object')walk(x,stamp,depth+1);}
    walk(state().singleStudies);walk(state().studies);walk(state().field);return found;
  }
  function historyMarkup(){const all=state().singleStudies||[];return all.length>1?`<label class="space">单次实验历史<select id="singleHistory">${all.map(x=>`<option value="${esc(x.id)}" ${x.id===state().singleActive?'selected':''}>${esc(new Date(x.created).toLocaleString())} · ${deep(x)?'120分钟':x.mode==='20min'?'20分钟':'10分钟'} · ${x.runtime.phase==='done'?'完成':x.runtime.phase==='stopped'?'不适停止':x.runtime.phase==='abandoned'?'已结束（不完整）':'未完成'}</option>`).join('')}</select></label><button data-single-action="history">查看所选记录</button>`:'';}
  function selectHistory(id){const s=activeStudy();if(isActive()||live||s&&!TERMINAL.includes(s.runtime.phase)){B.toast('请先完成当前测试；测试期间不切换记录。',true);return false;}const found=state().singleStudies.find(x=>x.id===id);if(!found)return false;state().singleActive=id;if(!save())return false;renderLab();renderResults();B.go('results');return true;}
  function markRound(){const s=activeStudy(),r=s.runtime,g=group(),key=g.stage+'-'+g.round;if(r.roundKey!==key){r.roundKey=key;r.roundPlannedStart=s.timing.plannedElapsedMs;r.roundEnv=structuredClone(B.getEnv());}}
  function renderLab(){
    const el=$('singleLabRoot');if(!el)return;const s=activeStudy(),status=B.calibrationStatus(),pending=s&&!TERMINAL.includes(s.runtime.phase),c=state().settings;
    el.innerHTML=`<div class="card space"><div class="eyebrow">DEEP SESSION · 同日分阶段比较</div><h2>120分钟深度实验</h2><p>${c?esc(c.dpi+' DPI / 约 '+fmt(c.baseCm,2)+' cm/360'):'设备设置待确认'} / ${esc(status.title)} / ${s?modeLabel(s):'120分钟深度实验'}</p><p>约105分钟测试与休息，另预留15分钟查看报告和换算。分阶段比较候选，输出本次会话中的可用建议。复测完成立即显示报告，不等待满120分钟。</p>
    <div class="row space">${pending?'<button class="primary" data-single-action="resume">继续未完成实验</button>':'<button class="primary" data-single-action="start120">开始深度实验</button>'}${pending?'<button data-single-action="abandon">结束本次并保留记录</button>':''}<button data-single-action="practice">不计分练习</button></div>
    <details class="space"><summary>查看保存设置、规则与120分钟安排</summary><p>${esc(setupNote())}</p><p>${s?esc(rules(s)):'沿用已保存的权重、实用差异及舒适度标准；开始前显示并确认冻结规则。'}</p><table><thead><tr><th>阶段</th><th>计划</th><th>内容</th></tr></thead><tbody><tr><td>核对与共同热身</td><td>15分钟</td><td>120秒核对可提前确认；4×（30秒教程＋120秒基准热身）；180秒休息</td></tr><tr><td>粗筛</td><td>35分钟</td><td>4×8分钟；3次条件间60秒休息</td></tr><tr><td>阶段休息</td><td>10分钟</td><td>释放鼠标、放松手臂，不展示条件成绩</td></tr><tr><td>配对复测</td><td>45分钟</td><td>3条件×3轮×5分钟；每块含独立30秒组后休息</td></tr><tr><td>报告与换算</td><td>预留15分钟</td><td>不强制倒计时，结果立即可见</td></tr></tbody></table><p>粗筛8分钟块：180秒适应＋4×60秒任务＋3×10秒过渡＋30秒评分。复测5分钟块：60秒再适应＋4×45秒任务＋3×5秒过渡＋15秒评分＋30秒休息。</p><p>仅1个合适挑战候选时采用2条件4轮，复测40分钟；没有合适挑战候选时如实报告不足。普通疲劳可延长休息，评分等待和额外练习单独计时。180秒或60秒适应不保证充分适应。</p><p>这是工程设计的个人流程，不是论文验证的标准120分钟流程。同日轮次不等于独立测试日，数值遮蔽不是真正双盲。保留测量不确定性；舒适行程估计不参与评分或硬性淘汰。</p><button data-single-action="settings">查看设备与校准</button></details>
    <details class="space"><summary>其他时长：10分钟与20分钟</summary><div class="row"><button data-single-action="start20">开始20分钟完整测试</button><button data-single-action="start10">开始10分钟快速测试</button></div><p>原有单场协议继续保留；旧多日记录位于下方高级历史，不会改写为深度实验成绩。</p></details>${historyMarkup()}
    <p class="${status.ready?'accent':'warn'}">${esc(status.detail||status.title)}</p>${s?`<div class="notice"><strong>${modeLabel(s)}</strong> · 计划 ${fmt(effectivePlan(s)/60,1)} 分钟${deep(s)?'（含报告预留15分钟；测试与休息约'+fmt((s.measurementSeconds-(s.preflightSavedSeconds||0))/60,1)+'分钟）':''} · 实际经过 ${fmt(elapsedWall(s)/60000,1)} 分钟 · 额外主动/等待/故障时间 ${fmt(extra(s)/1000,0)} 秒 · 尚余 ${remaining(s)} 项正式任务（粗筛阶段包含预计复测）。${s.preflightSavedSeconds?'环境核对提前完成，计划已减少'+fmt(s.preflightSavedSeconds,0)+'秒。':''}${s.retest?.noComparison?'没有可比较挑战候选，不伪造复测。':s.retest&&s.retest.candidateIds.length<(deep(s)||s.mode==='20min'?3:2)?'按实际候选数量执行预定义分支，计划已更新。':''}${s.runtime.phase==='done'?'本次已结束，可查看报告。':s.runtime.phase==='stopped'?'已因不适停止，记录保留。':s.runtime.phase==='abandoned'?'本次已主动结束，记录不完整并保留。':s.runtime.paused?'已暂停，点击继续。':''}</div><button data-single-action="results">查看本次进度与报告</button>`:''}</div>`;
  }
  function extra(s){const t=s.timing;return t.extraAdaptMs+t.ratingExtraMs+t.pauseMs+t.faultMs+t.waitMs+(t.extraRestMs||0);}
  function effectivePlan(s){return s.plannedSeconds-(s.preflightSavedSeconds||0);}
  function showPreflight(){const s=activeStudy();B.openStage();B.modal(`<h2>环境核对 · 直接复用已保存校准</h2><p>${esc(setupNote())}</p><p>请核对鼠标实际DPI、鼠标设备与输入路径是否仍与校准时相同。网页无法自动检测硬件是否更换。</p><p>${esc(rules(s))}</p>${(s.candidateWarnings||[]).map(w=>`<p class="warn">${esc(w)}</p>`).join('')}<label><input type="checkbox" id="singleHardwareSame"> 我确认设备、实际DPI及输入路径未变，并使用以上冻结规则</label><p>核对阅读预留120秒，可随时确认完成；提前完成会扣减预计时长。接下来每项30秒教程＋120秒基准热身，共600秒，随后休息180秒。不会重新要求尺子校准。</p><p>预先公开的工程质量规则（不是论文常数）：有效时长至少达到计划99%；点选每块至少3次命中、5次射击才支持比较。单帧间隔超过250ms，或累计3次超过100ms，当前任务中断。固定结束时未完成目标右删失，全部任务时间保留作分母；微调80ms、切换/转向100ms内的过早点击仍计射击次数，只不计命中。</p><button class="primary" data-single-action="preflight">已核对，进入教程与共同热身</button><button data-single-action="close">稍后继续</button><p id="singlePreflightError" class="bad"></p>`);}
  function confirmPreflight(){const s=activeStudy(),r=s?.runtime;if(!s||r.phase!=='preflight')return false;if(!$('singleHardwareSame')?.checked){$('singlePreflightError').textContent='请明确确认实际设备和DPI未变；网页不能代替这项确认。';return false;}if(blockChangedInput(s))return false;const elapsed=Math.max(0,clock.wall()-r.preflightStartedAt),budget=protocol().preflightSeconds*1000;s.preflightSavedSeconds=Math.max(0,budget-elapsed)/1000;s.timing.plannedElapsedMs+=Math.min(elapsed,budget);s.timing.waitMs+=Math.max(0,elapsed-budget);s.preflight={confirmedAt:iso(),elapsedMs:elapsed,hardwareUnchanged:true,ruleSnapshot:structuredClone(s.configSnapshot)};r.phase='tutorial';r.practiceIndex=0;r.elapsed=0;r.extraAdapt=0;r.paused=true;r.engaged=false;r.lastActiveAt=clock.wall();if(save())showResume();renderLab();return true;}
  function beginRest(phase,seconds,next){const s=activeStudy(),r=s.runtime;release();r.phase=phase;r.elapsed=0;r.restPlannedMs=seconds*1000;r.extraRest=0;r.restNext=next;r.paused=false;r.engaged=false;r.lastActiveAt=clock.wall();if(save()){B.openStage();showPlannedRest();makeLive();}}
  function showPlannedRest(){const r=runtime(),name={initialRest:'共同热身后休息',screenRest:'粗筛条件间休息',stageRest:'阶段休息 · 10分钟',postRest:'复测组后休息'}[r.phase];B.modal(`<h2>${name}</h2><p>请离开瞄准任务，放松手臂。鼠标已释放；此处不展示条件成绩，也不安排瞄准练习。</p><p>还剩 <strong id="singleRestTime">${Math.ceil((r.restPlannedMs+(r.extraRest||0)-r.elapsed)/1000)}</strong> 秒。计划休息不会因评分慢而取消。</p><button data-single-action="extend-rest">普通疲劳，再休息1分钟</button><button data-single-action="close">主动暂停，稍后继续</button>`);}
  function extendRest(){const s=activeStudy(),r=s?.runtime;if(!s||!restPhase(r))return false;r.extraRest=(r.extraRest||0)+60000;(s.extensions??=[]).push({...meta(s),runtimePhase:r.phase,seconds:60,type:'rest',created:iso()});save();B.toast('已增加1分钟休息，额外时间会单独记录。');return true;}
  function finishRest(){const s=activeStudy(),r=s.runtime,next=r.restNext;s.timing.plannedElapsedMs+=r.restPlannedMs;s.timing.extraRestMs+=(r.extraRest||0);release();r.elapsed=0;r.extraRest=0;if(next==='nextGroup'){advanceGroup();return;}r.phase='adapt';r.taskIndex=0;r.paused=true;r.engaged=false;r.lastActiveAt=clock.wall();markRound();if(save()){showResume();renderLab();}}
  function consumeRest(ms){const s=activeStudy(),r=s.runtime,used=Math.min(ms,Math.max(0,r.restPlannedMs+(r.extraRest||0)-r.elapsed)),over=Math.max(0,ms-used);stepTime(used);if(over){s.timing.waitMs+=over;r.restOverrunMs=(r.restOverrunMs||0)+over;}}
  function resolveRestOverrun(){const s=activeStudy(),r=s.runtime,over=r.restOverrunMs||0;delete r.restOverrunMs;if(over<=LONG_GAP)return false;segment(s,'计划休息结束后的额外长间隔',{gapMs:over});if(!['postRest','screenRest'].includes(r.phase))return false;s.timing.plannedElapsedMs+=r.restPlannedMs;s.timing.extraRestMs+=r.extraRest||0;r.elapsed=0;r.extraRest=0;release();restartRound('计划休息结束后长时间离开，重做本比较轮');r.paused=true;r.engaged=false;r.lastActiveAt=clock.wall();if(save()){showResume();renderLab();}return true;}
  function finishRatingRest(){const g=group();if(deep()&&(g.postRestSeconds||0)>0){const r=runtime();activeStudy().timing.plannedElapsedMs+=r.restRemaining||0;r.restRemaining=0;beginRest('postRest',g.postRestSeconds,'nextGroup');}else advanceGroup();}
  function showResume(){
    const s=activeStudy();if(!s)return;
    const r=s.runtime;if(TERMINAL.includes(r.phase)){B.closeStage();renderResults();B.go('results');return;}
    if(r.phase==='preflight'){r.paused=false;showPreflight();return;}
    if(restPhase(r)){r.paused=false;B.openStage();showPlannedRest();makeLive();return;}
    if(r.phase==='rating'){showRating();return;}
    if(r.phase==='ratingRest'){B.openStage();r.engaged=false;r.paused=false;showRest();makeLive();return;}
    B.openStage();r.engaged=false;r.paused=true;r.waitStartedAt??=clock.wall();
    const g=group(), name=r.phase==='tutorial'?`${NAMES[TASKS[r.practiceIndex]]} · 30秒操作教程`:r.phase==='warmup'?`${NAMES[TASKS[r.practiceIndex]]} · 120秒基准热身`:r.phase==='familiar'?'40秒共同熟悉与输入检查':r.phase==='stageRest'?'粗筛完成 · 40秒阶段休息':`${g.stage==='screen'?'粗筛':'复测第'+g.round+'轮'} · 条件${candidate(s,g).label}`;
    B.modal(`<h2>${name}</h2><p>系统箭头会隐藏；屏幕中央白色准星是瞄准点。鼠标转动视角。微调、切换、转向用左键；跟枪只需持续覆盖目标。</p><p>每项正式任务${g.taskSeconds}秒，零命中也会保留；Esc/失焦只中断当前任务。这只是数值遮蔽，不是真正双盲；手感仍可能被识别。</p><div class="row"><button class="primary" data-single-action="lock">锁定鼠标并继续</button>${['adapt','familiar','tutorial','warmup'].includes(r.phase)?'<button data-single-action="extend">还没适应，延长练习15秒</button>':''}<button data-single-action="close">稍后继续</button></div>`);
  }
  function resume(){
    const s=activeStudy();if(!s)return;
    if(storageFailed&&!save())return;
    if(TERMINAL.includes(s.runtime.phase)){showResume();return;}
    if(!TERMINAL.includes(s.runtime.phase)&&blockChangedInput(s))return;
    const r=s.runtime,gap=Math.max(0,clock.wall()-(r.lastActiveAt||clock.wall())),manuallyPaused=r.pauseStartedAt!==undefined;
    if(restPhase(r)&&!manuallyPaused){consumeRest(gap);if(resolveRestOverrun())return;}
    if(r.pauseStartedAt!==undefined){const pausedFor=Math.max(0,clock.wall()-r.pauseStartedAt);s.timing.pauseMs+=pausedFor;if(r.phase==='rating'&&Number.isFinite(r.ratingStartedAt))r.ratingStartedAt+=pausedFor;if(r.phase==='preflight'&&Number.isFinite(r.preflightStartedAt))r.preflightStartedAt+=pausedFor;delete r.pauseStartedAt;r.lastActiveAt=clock.wall();}
    if(gap>LONG_GAP&&(!restPhase(r)||manuallyPaused)){segment(s,'超过5分钟后恢复（工程分段阈值）',{gapMs:gap});restartRound('长间隔恢复，重做本比较轮');}r.lastActiveAt=clock.wall();
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
    if(['preflight','rating','ratingRest',...TERMINAL].includes(s.runtime.phase)||restPhase(s.runtime)){B.releaseLock();return false;}
    if(blockChangedInput(s))return false;
    s.runtime.paused=false;
    if(B.getRawMode()!=='requested'){pause('未确认原始输入，正式测试不开始');return false;}
    if(!B.inputCompatible(s.calSnapshot.env,B.getEnv())||s.calSnapshot.dpi!==s.configSnapshot.dpi){pause('设备、DPI或输入路径发生变化，请检查校准；已有记录保留');return false;}
    const old=s.runtime.roundEnv,now=B.getEnv();if(old&&['w','h','sw','sh'].some(k=>old[k]!==now[k])&&!['preflight','tutorial','warmup','familiar','stageRest'].includes(s.runtime.phase)){segment(s,'恢复时显示尺寸变化');restartRound('恢复时显示尺寸变化，重做本比较轮');}
    const r=s.runtime;if(['rating','ratingRest',...TERMINAL].includes(r.phase)){B.releaseLock();return false;}if(r.waitStartedAt!==undefined){s.timing.waitMs+=Math.max(0,clock.wall()-r.waitStartedAt);delete r.waitStartedAt;}
    r.paused=false;r.engaged=true;r.lastActiveAt=clock.wall();B.hideModal();makeLive();return true;
  }
  function phaseSeconds(){const s=activeStudy(),r=s.runtime,g=group();return r.phase==='tutorial'?protocol().tutorialSecondsEach:r.phase==='warmup'?protocol().warmupSecondsEach:restPhase(r)?(r.restPlannedMs||0)/1000:r.phase==='familiar'?40:r.phase==='stageRest'?40:r.phase==='adapt'?g.adaptSeconds:r.phase==='task'?g.taskSeconds:r.phase==='transition'?g.transitionSeconds:r.phase==='ratingRest'?(r.restRemaining||0)/1000:0;}
  function practiceTask(){const r=runtime();return r.phase==='adapt'?TASKS[Math.floor(r.elapsed/(group().adaptSeconds*250))%4]:TASKS[r.practiceIndex||0];}
  function makeLive(){
    stopFrame();const s=activeStudy(),r=s.runtime,g=group(),task=r.phase==='task'?g.taskOrder[r.taskIndex]:practicePhase(r)?practiceTask():'track';
    const sourceSeed=deep(s)&&practicePhase(r)?(r.phase==='adapt'?(g.adaptSeed??g.adaptationSeed):(s.practiceSeed??s.seed+918273))+(r.phase==='tutorial'?1231:r.phase==='warmup'?3457:0):(g?.seed||s.seed);
    const rng=M.rng(sourceSeed+(TASKS.indexOf(task)+3)*7321),nodeCount=Math.ceil((Math.max(phaseSeconds(),g?.taskSeconds||0)+(r.extraAdapt||0)/1000+5)/1.15)+5;
    live={acquireTotalMs:0,owner:s.id,phase:r.phase,task,y:0,p:0,start:clock.now(),previous:clock.now(),env:structuredClone(B.getEnv()),radius:M.rad(1.1),target:M.vec(0,0),rng,nodes:Array.from({length:80},()=>({y:(rng()-.5)*1.65,p:(rng()-.5)*.4})),hits:0,shots:0,index:0,trials:[],trialStart:0,trialShots:0,onTime:0,sqTime:0,integrated:0,pathCm:0,frames:[],longFrames:0,trace:[],lastTrace:0,savedSecond:-1};
    if(deep(s)){const rules=taskRules().track;live.radius=M.rad(rules.radiusDegrees);live.lastWall=clock.wall();live.nodes=Array.from({length:nodeCount},()=>({y:(rng()-.5)*rules.horizontalSpanRadians,p:(rng()-.5)*rules.verticalSpanRadians}));live.practiceOffset=r.phase==='adapt'?Math.floor(r.elapsed/(g.adaptSeconds*250))*(g.adaptSeconds*250):0;}
    if((r.phase==='task'||practicePhase(r))&&task!=='track')spawn(live,r.elapsed);
    schedule(live);
  }
  function schedule(owner){frame=clock.raf(now=>{if(disposed||live!==owner)return;frame=null;try{tick(now);}catch(e){pause('场景或输入处理异常：'+e.message);}});}
  function stepTime(dt){const s=activeStudy(),r=s.runtime;r.elapsed+=dt;s.timing.activeMs+=dt;r.lastActiveAt=clock.wall();}
  function tick(now){
    const l=live,s=activeStudy();if(!l||!s||s.id!==l.owner)return;
    const r=s.runtime,dt=Math.max(0,now-l.previous);l.previous=now;
    if(restPhase(r)){
      const wallStep=Math.max(0,clock.wall()-l.lastWall);l.lastWall=clock.wall();consumeRest(wallStep);if(resolveRestOverrun())return;
      if($('singleRestTime'))$('singleRestTime').textContent=Math.ceil(Math.max(0,r.restPlannedMs+(r.extraRest||0)-r.elapsed)/1000);
      const second=Math.floor(r.elapsed/1000);if(second!==l.savedSecond){l.savedSecond=second;if(!save())return;}
      if(r.elapsed>=r.restPlannedMs+(r.extraRest||0)){finishRest();return;}schedule(l);return;
    }
    if(r.phase==='ratingRest'){
      stepTime(Math.min(dt,Math.max(0,phaseSeconds()*1000-r.elapsed)));
      if($('singleRestTime'))$('singleRestTime').textContent=Math.ceil(Math.max(0,phaseSeconds()*1000-r.elapsed)/1000);
      if(r.elapsed>=phaseSeconds()*1000){finishRatingRest();return;}schedule(l);return;
    }
    if(doc.pointerLockElement!==B.getArena()){pause('鼠标锁定丢失');return;}
    const current=B.getEnv();if(JSON.stringify(current)!==JSON.stringify(l.env)){pause('显示环境变化，当前任务暂停',{restartRound:true});return;}
    const q=quality();if(dt>q.maxFrameGapMs||dt>q.maxLongFrameMs&&++l.longFrames>=q.maxLongFrames){pause('显著卡顿，当前任务作为故障中断');return;}
    if(dt>0)l.frames.push(dt);
    const base=phaseSeconds()*1000,limit=base+(['adapt','familiar','tutorial','warmup'].includes(r.phase)?r.extraAdapt:0),step=Math.min(dt,Math.max(0,limit-r.elapsed));
    stepTime(step);
    if(practicePhase(r)&&practiceTask()!==l.task&&r.elapsed<limit){makeLive();return;}
    if(r.phase==='task'||practicePhase(r)){
      const elapsed=r.elapsed;
      if(l.task==='track'){
        l.target=tracking(l,(elapsed-(l.practiceOffset||0))/1000);const error=M.angle(M.vec(l.y,l.p),l.target);
        l.onTime+=(error<=l.radius?step:0);l.sqTime+=error*error*step;l.integrated+=step;
        if(elapsed-l.lastTrace>=q.traceIntervalMs){l.trace.push(deep(s)?[+elapsed.toFixed(1),+M.deg(error).toFixed(4)]:[elapsed,M.deg(error)]);l.lastTrace=elapsed;}
      }else if(elapsed<limit&&elapsed-l.trialStart>=(taskRules()?.[l.task]?.timeoutMs??(l.task==='turn'?5000:4000)))trial(false,elapsed,true);
    }else if(['adapt','familiar'].includes(r.phase))l.target=tracking(l,(r.elapsed%30000)/1000);
    const g=group(),cand=g?candidate(s,g):s.candidates.find(c=>c.baseline);
    $('hudTitle').textContent=r.phase==='task'?NAMES[l.task]:r.phase==='tutorial'?NAMES[l.task]+' · 教程不计分':r.phase==='warmup'?NAMES[l.task]+' · 基准热身不计分':r.phase==='familiar'?'共同熟悉 · 不计分':r.phase==='adapt'?NAMES[l.task]+' · 条件适应不计分':r.phase==='transition'?'任务过渡 · 不计分':'阶段休息 · 不计分';
    $('hudDetail').textContent=`${g&&!['familiar','tutorial','warmup'].includes(r.phase)?`${g.stage==='screen'?'粗筛':'复测第'+g.round+'轮'} · 条件${cand.label} · `:''}计划 ${fmt(effectivePlan(s)/60,1)} 分钟 · 剩余 ${remaining(s)} 项`;
    $('hudRight').textContent=Math.max(0,(limit-r.elapsed)/1000).toFixed(1)+' s';
    $('hudInput').textContent=`原始输入已请求 · ${s.inputCheck.events} 次移动事件（不代替物理校准）`;
    const upcoming=practicePhase(r)?l.task:r.phase==='transition'?g.taskOrder[r.taskIndex+1]:r.phase==='adapt'?g.taskOrder[0]:l.task,operation=upcoming==='track'?'准星持续覆盖目标，无需开火':'准星瞄准目标后左键单击';
    $('stageHelp').textContent=`系统箭头已隐藏 · 中央准星瞄准 · ${['adapt','transition'].includes(r.phase)&&!practicePhase(r)?'接下来 '+NAMES[upcoming]+'：':''}${operation} · ${['adapt','familiar','tutorial','warmup'].includes(r.phase)?'E再练15秒 · ':''}Esc暂停`;
    B.drawScene(B.ctx,current.w,current.h,l.y,l.p,['task','adapt','familiar','tutorial','warmup'].includes(r.phase)?l.target:null,l.radius,B.actualHFov(s.configSnapshot,current.w,current.h));
    const second=Math.floor(r.elapsed/1000);if(second!==l.savedSecond){l.savedSecond=second;r.partial=r.phase==='task'?partial(l):null;if(!save())return;}
    if(r.elapsed>=limit){finishPhase();return;}schedule(l);
  }
  function partial(l){return{...meta(activeStudy()),task:l.task,elapsed:runtime().elapsed,hits:l.hits,shots:l.shots,trials:structuredClone(l.trials),trace:structuredClone(l.trace),pathCm:l.pathCm};}
  function finishPhase(){
    const s=activeStudy(),r=s.runtime,l=live,g=group();if(!l)return;
    if(r.phase==='task'){
      if(l.task!=='track')l.trials.push({index:l.index,hit:false,censored:true,ms:r.elapsed-l.trialStart,shots:l.trialShots});
      const duration=g.taskSeconds*1000,accuracy=l.task==='track'?l.onTime/duration:l.hits/Math.max(1,l.shots);
      const b={...meta(s,g),valid:true,task:l.task,duration,actualDuration:r.elapsed,score:l.task==='track'?accuracy:l.hits/g.taskSeconds,accuracy,hits:l.hits,shots:l.shots,timeouts:l.trials.filter(x=>x.timeout).length,meanAcquireMs:l.hits?l.acquireTotalMs/l.hits:null,rmsDeg:l.task==='track'?M.deg(Math.sqrt(l.sqTime/duration)):null,coveredMs:l.onTime,integratedMs:l.integrated,pathCm:l.pathCm,trials:l.trials,trace:l.trace,frameFps:1000/M.median(l.frames),frameP95:M.quantile(l.frames,.95),raw:B.getRawMode(),inputQuality:{raw:B.getRawMode(),longFrames:l.longFrames,frameCount:l.frames.length,traceIntervalMs:200},seed:g.seed,env:l.env,created:iso(),unfinishedTarget:'right-censored-at-'+g.taskSeconds+'s'};
      const result=s.results[g.id]??={...meta(s,g),tasks:{},env:l.env};
      if(!result.tasks[l.task])result.tasks[l.task]=b;
      s.timing.plannedElapsedMs+=duration;r.partial=null;
      if(r.taskIndex<3){r.phase='transition';r.elapsed=0;}else{r.phase='rating';r.elapsed=0;r.ratingStartedAt=clock.wall();r.engaged=false;release();if(save())showRating();return;}
    }else if(deep(s)&&['tutorial','warmup'].includes(r.phase)){
      if(s.inputCheck.events<2){s.timing.faultMs+=r.elapsed;r.elapsed=0;pause('没有收到足够鼠标输入；请确认设备并重新进行本项教程');return;}
      s.timing.plannedElapsedMs+=phaseSeconds()*1000;s.timing.extraAdaptMs+=Math.max(0,r.elapsed-phaseSeconds()*1000);(s.familiarization??=[]).push({...meta(s),phase:r.phase,conditionId:s.candidates.find(c=>c.baseline).id,seed:s.practiceSeed,task:TASKS[r.practiceIndex],seconds:r.elapsed/1000,created:iso()});r.extraAdapt=0;r.elapsed=0;
      if(r.phase==='tutorial')r.phase='warmup';else if(r.practiceIndex<3){r.practiceIndex++;r.phase='tutorial';}else{beginRest('initialRest',protocol().initialRestSeconds,'adapt');return;}
    }else if(r.phase==='familiar'){
      if(s.inputCheck.events<2){s.timing.faultMs+=r.elapsed;r.elapsed=0;pause('40秒内没有收到足够鼠标移动；这只是输入检查，重新熟悉后再进入正式计分');return;}
      s.timing.plannedElapsedMs+=40000;s.timing.extraAdaptMs+=Math.max(0,r.elapsed-40000);r.phase='adapt';r.elapsed=0;r.extraAdapt=0;markRound();
    }else if(r.phase==='adapt'){
      s.timing.plannedElapsedMs+=g.adaptSeconds*1000;s.timing.extraAdaptMs+=Math.max(0,r.elapsed-g.adaptSeconds*1000);(s.results[g.id]??={...meta(s,g),tasks:{}}).adaptMs=r.elapsed;r.phase='task';r.taskIndex=0;r.elapsed=0;r.extraAdapt=0;
    }else if(r.phase==='transition'){s.timing.plannedElapsedMs+=g.transitionSeconds*1000;r.phase='task';r.taskIndex++;r.elapsed=0;}
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
    const result=s.results[g.id];result.rating={...meta(s,g),effort:+effort,pain:pain==='yes',answeredAt:iso()};result.completedAt=iso();result.ratingMs=elapsed;
    s.timing.ratingExtraMs+=Math.max(0,elapsed-budget);s.timing.plannedElapsedMs+=Math.min(elapsed,budget);
    if(pain==='yes'){r.phase='stopped';r.engaged=false;s.status='stopped';s.stoppedReason='疼痛或明显不适';s.completedAt=iso();if(!save())return false;B.modal('<h2>已记录不适，测试停止</h2><p>请停止今天的测试。已完成记录保留，不通过舒适度守门线；不必为了凑满计划继续。</p><button data-single-action="results">查看已有记录</button>');renderLab();return true;}
    r.restRemaining=Math.max(0,budget-elapsed);r.phase='ratingRest';r.elapsed=0;r.engaged=false;if(!save())return false;
    if(r.restRemaining===0)finishRatingRest();else{showRest();makeLive();}return true;
  }
  function advanceGroup(){
    const s=activeStudy(),r=s.runtime,g=group();s.timing.plannedElapsedMs+=r.restRemaining||0;r.restRemaining=0;r.groupIndex++;r.taskIndex=0;r.elapsed=0;release();
    if(g.stage==='screen'&&r.groupIndex===s.groups.length){S.freezeRetest(s,{now:iso()});if(deep(s)){if(s.retest?.noComparison||s.noComparison){finishStudy();return;}beginRest('stageRest',protocol().stageRestSeconds,'adapt');return;}r.phase='stageRest';}
    else if(r.groupIndex>=s.groups.length){finishStudy();return;}
    else if(deep(s)&&g.stage==='screen'){beginRest('screenRest',g.betweenRestSeconds??protocol().screenRestSeconds,'adapt');return;}
    else{r.phase='adapt';markRound();}
    r.paused=true;r.engaged=false;r.lastActiveAt=clock.wall();r.waitStartedAt=clock.wall();if(save()){showResume();renderLab();}
  }
  function finishStudy(){const s=activeStudy(),r=s.runtime;r.phase='done';s.status=(s.retest?.noComparison||s.noComparison)?'insufficient':'completed';s.completedAt=iso();r.engaged=false;r.paused=false;release();if(save()){B.closeStage();renderLab();renderResults();B.go('results');}}
  function restartRound(reason){
    const s=activeStudy(),r=s.runtime,g=group();if(!g||['preflight','tutorial','warmup','initialRest','familiar','stageRest'].includes(r.phase))return;
    const ids=s.groups.filter(x=>x.stage===g.stage&&x.round===g.round).map(x=>x.id);
    const records={};for(const id of ids)if(s.results[id]){records[id]=structuredClone(s.results[id]);delete s.results[id];}
    const spent=Math.max(0,s.timing.plannedElapsedMs-(r.roundPlannedStart??s.timing.plannedElapsedMs));
    s.timing.faultMs+=spent+((['adapt','transition','ratingRest'].includes(r.phase)||restPhase(r))?r.elapsed:0);s.timing.plannedElapsedMs-=spent;
    (s.discardedRounds??=[]).push({stage:g.stage,round:g.round,reason,created:iso(),records});
    r.groupIndex=s.groups.findIndex(x=>x.id===ids[0]);r.taskIndex=0;r.phase='adapt';r.elapsed=0;r.extraAdapt=0;r.roundEnv=structuredClone(B.getEnv());
    s.warnings??=[];s.warnings.push(reason+'；原轮全部记录保留在备份中，不混入新的配对轮。');
  }
  function pause(reason,options={}){
    const s=activeStudy(),r=s?.runtime;if(!s||TERMINAL.includes(r.phase))return;
    if(restPhase(r)&&!r.paused&&/失焦|切换标签页|鼠标锁定丢失/.test(reason))return;
    if(r.paused&&!live)return;
    if(restPhase(r)&&live){consumeRest(Math.max(0,clock.wall()-live.lastWall));live.lastWall=clock.wall();if(resolveRestOverrun())return;}
    if(deep(s))(s.interruptions??=[]).push({...meta(s),runtimePhase:r.phase,type:options.type||interruptionType(reason),reason,elapsed:r.elapsed,created:iso()});
    if(live&&r.phase==='task'){
      s.attempts.push({...meta(s),type:options.type||interruptionType(reason),groupId:group().id,task:live.task,reason,created:iso(),valid:false,partial:partial(live)});s.timing.faultMs+=r.elapsed;r.elapsed=0;r.partial=null;
    }
    if(!r.paused||r.pauseStartedAt===undefined){r.lastActiveAt=clock.wall();r.pauseStartedAt=clock.wall();}delete r.waitStartedAt;r.paused=true;r.engaged=false;release();
    if(options.restartRound||/窗口|视野|FOV|显示环境/.test(reason)){segment(s,reason);restartRound(reason);}
    if(!save())return;
    B.modal(`<h2>本次测试已暂停</h2><p>${esc(reason)}。已完成任务保留；当前中断任务及原因也会保存，不按得分选择重测。</p><p>恢复超过5分钟将分段记录；复测阶段重做当前配对轮，保留旧轮历史。窗口变化不自动清除物理校准。</p><div class="row"><button class="primary" data-single-action="resume">准备好，继续</button>${['adapt','familiar','tutorial','warmup'].includes(r.phase)?'<button data-single-action="extend">还没适应，延长练习15秒</button>':''}<button data-single-action="close">稍后继续</button></div>`);renderLab();
  }
  function abandon(reason='用户主动结束本次测试'){
    const s=activeStudy();if(!s||TERMINAL.includes(s.runtime.phase))return false;
    const confirm=B.confirm||root.confirm;if(!confirm||!confirm('结束本次并保留记录？已完成成绩和中断记录全部保留，本次标记为不完整，不给换敏推荐。原因：'+reason))return false;
    pause(reason);const r=s.runtime;if(r.pauseStartedAt!==undefined){s.timing.pauseMs+=Math.max(0,clock.wall()-r.pauseStartedAt);delete r.pauseStartedAt;}
    release();r.phase='abandoned';r.paused=false;r.engaged=false;s.status='abandoned';s.abandonedReason=String(reason).slice(0,1000);s.completedAt=iso();
    if(!save())return false;B.closeStage();renderLab();renderResults();B.go('results');return true;
  }
  function extend(){const s=activeStudy(),r=s?.runtime;if(!r||!['adapt','familiar','tutorial','warmup'].includes(r.phase))return;r.extraAdapt+=15000;(s.extensions??=[]).push({...meta(s),...(deep(s)?{runtimePhase:r.phase}:{phase:r.phase}),groupId:group()?.id,seconds:15,created:iso()});save();B.toast('已增加15秒不计分练习，实际流程将延长。');}
  function spawn(l,t){const rules=taskRules()?.[l.task],sets=rules?.anglesDegrees||(l.task==='micro'?[2,4,7]:l.task==='switch'?[15,30,45]:[90,120,160]),a=M.rad(sets[l.index%sets.length]);let phi=l.task==='turn'?(l.rng()<.5?0:Math.PI)+(l.rng()-.5)*.07:l.rng()*2*Math.PI;l.radius=M.rad(rules?rules.radiiDegrees[l.index%rules.radiiDegrees.length]:l.task==='micro'?(l.index%2?.5:.3):l.task==='switch'?(l.index%2?1.1:.8):2);const fallback=deep()?(l.rng()<.5?0:Math.PI):null;l.target=M.relative(l.y,l.p,a,phi);if(Math.abs(l.target[1])>Math.sin(M.rad(65)))l.target=M.relative(l.y,l.p,a,deep()?fallback:l.rng()<.5?0:Math.PI);l.amplitude=M.deg(a);l.trialStart=t;l.trialShots=0;}
  function trial(hit,t,timeout=false){const l=live,error=M.deg(M.angle(M.vec(l.y,l.p),l.target));l.trials.push(deep()?{index:l.index,hit,ms:+(t-l.trialStart).toFixed(1),shots:l.trialShots,errorDeg:+error.toFixed(4),...(timeout?{timeout:true}:{})}:{index:l.index,hit,timeout,ms:t-l.trialStart,shots:l.trialShots,errorDeg:error,amplitude:l.amplitude,radiusDeg:M.deg(l.radius)});if(hit){l.hits++;l.acquireTotalMs+=t-l.trialStart;}l.index++;spawn(l,t);}
  function cat(a,b,c,d,t){return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);}
  function tracking(l,sec){const rules=taskRules()?.track,v=sec/(rules?.pathStepSeconds||1.15),k=Math.floor(v),t=v-k,n=l.nodes;while(k+3>=n.length)n.push({y:(l.rng()-.5)*(rules?.horizontalSpanRadians||1.65),p:(l.rng()-.5)*(rules?.verticalSpanRadians||.4)});return M.vec(cat(n[k].y,n[k+1].y,n[k+2].y,n[k+3].y,t),cat(n[k].p,n[k+1].p,n[k+2].p,n[k+3].p,t));}
  function mousemove(e){
    if(!isActive()||!live||doc.pointerLockElement!==B.getArena())return;
    const dx=e.movementX,dy=e.movementY;if(!Number.isFinite(dx)||!Number.isFinite(dy)){pause('输入事件含非有限数值');return;}
    if(!dx&&!dy)return;const s=activeStudy(),l=live,g=group(),cm=['familiar','tutorial','warmup'].includes(runtime().phase)?s.configSnapshot.baseCm:g?candidate(s,g).cm:s.configSnapshot.baseCm;
    s.inputCheck.events++;s.inputCheck.dx+=Math.abs(dx);s.inputCheck.dy+=Math.abs(dy);
    l.y+=dx/s.calSnapshot.ux*2*Math.PI/cm;l.y=Math.atan2(Math.sin(l.y),Math.cos(l.y));l.p=M.clamp(l.p-dy/s.calSnapshot.uy*2*Math.PI/cm,-M.rad(85),M.rad(85));l.pathCm+=Math.hypot(dx/s.calSnapshot.ux,dy/s.calSnapshot.uy);
  }
  function mousedown(e){if(e.button!==0||!isActive()||!live||(!practicePhase(runtime())&&runtime().phase!=='task')||live.task==='track'||doc.pointerLockElement!==B.getArena())return;e.preventDefault();if(e.isTrusted===false||held){activeStudy().inputCheck.ignoredRepeatedClicks=(activeStudy().inputCheck.ignoredRepeatedClicks||0)+1;return;}held=true;const t=runtime().elapsed;live.shots++;live.trialShots++;if(t-live.trialStart<quality().clickMinimumMs[live.task])return;if(M.angle(M.vec(live.y,live.p),live.target)<=live.radius)trial(true,t);}
  function mouseup(e){if(e.button===0)held=false;}
  function keydown(e){if(e.code==='Escape')lastEscapeAt=clock.wall();if(isActive()&&e.code==='KeyE'&&!e.repeat){e.preventDefault();extend();}}
  function driftText(d){if(!d)return'尚无足够基准记录';const f=x=>Number.isFinite(x)?fmt(x*100,1)+'%':'数据不足';return '粗筛到复测均值 '+f(d.screenToRetest)+'，首轮到末轮复测 '+f(d.roundChange)+'。'+(d.note||'');}
  function segmentDetails(s){if(!deep(s))return'';return `<p>本次保存为 ${s.sessionSegment} 个会话片段。休息超时、刷新及恢复均保留，不能将分段记录描述为连续105分钟，也不构成跨日独立验证。</p><details><summary>查看会话片段与中断原因</summary>${s.segments.map((x,i)=>`<p>片段 ${x.sessionSegment||i+1} · ${esc(x.startedAt)} · ${esc(x.reason)}</p>`).join('')}${(s.interruptions||[]).map(x=>`<p>${x.type==='user'?'主动暂停':'技术中断'} · ${esc(x.created)} · ${esc(x.reason)}</p>`).join('')||'<p>没有记录主动暂停或技术中断。</p>'}</details>`;}
  function renderResults(){
    const el=$('singleResultsRoot'),s=activeStudy();if(!el)return false;
    if(!s){el.innerHTML='<div class="card space"><h2>单次测试结果</h2><p>还没有单次实验。旧多日实验保留在下方高级历史中。</p></div>';return false;}
    if(deep(s)&&!TERMINAL.includes(s.runtime.phase)){const count=Object.values(s.results).reduce((n,x)=>n+Object.keys(x.tasks||{}).length,0);el.innerHTML=`<div class="card space"><h2>深度实验进行中</h2><p>已保存 ${count} 项正式任务，尚余 ${remaining(s)} 项。当前阶段：${esc({preflight:'环境核对',tutorial:'任务教程',warmup:'共同热身',initialRest:'热身后休息',screenRest:'条件间休息',stageRest:'阶段休息',postRest:'组后休息',adapt:'适应',task:'正式任务',transition:'任务过渡',rating:'评分',ratingRest:'评分后短休'}[s.runtime.phase]||s.runtime.phase)}。</p><p>为减少后续预期影响，测试结束前不展示条件成绩。全部原始记录已保留，主动导出备份仍可获得数据。</p><p>已记录 ${(s.interruptions||[]).length} 次中断，${s.sessionSegment} 个会话片段。计划 ${fmt(effectivePlan(s)/60,1)} 分钟，实际经过 ${fmt(elapsedWall(s)/60000,1)} 分钟。</p><button data-single-action="resume">继续未完成实验</button><button data-single-action="export">导出完整备份</button><button data-single-action="abandon">结束本次并保留记录</button></div>`;return true;}
    const a=S.analyze(s,'retest'),rec=a.recommendation,full=TERMINAL.includes(s.runtime.phase),ready=s.runtime.phase==='done'&&rec.action==='try-candidate';
    const headline=s.runtime.phase==='abandoned'?'本次已结束：记录不完整，不作换敏推荐':s.runtime.phase==='stopped'?'因疼痛或不适停止：不作换敏推荐':!full?'测试尚未完成：当前仅显示记录':rec.action==='insufficient'?'本次数据不足：尚不能判断换敏收益':ready?`本次更值得游戏试用：约 ${fmt(rec.cm,2)} cm/360`:'当前证据支持保留原灵敏度';
    const rowHtml=a.rows.map(x=>`<tr><td>${fmt(x.cm,2)}${x.baseline?' · 基准':''}</td><td>${fmt(x.angleGain,3)}×（${fmt(x.angleGainChange*100,1)}%）</td><td>${fmt(x.relative,3)}</td>${x.taskRatios.map(y=>`<td>${Number.isFinite(y)?fmt((y-1)*100,1)+'%':'缺少有效配对'}</td>`).join('')}<td>${x.positiveRounds}/${a.requiredRounds}轮向上</td><td>${fmt(x.effort,1)} / 疼痛${x.pains}</td><td>${esc([...(x.gateReasons||[]),...(x.missingReasons||[])].join('；')||'通过本次工程检查')}</td></tr>`).join('');
    const raw=s.groups.map(g=>{const result=s.results[g.id];if(!result)return'';return TASKS.map(t=>{const b=result.tasks?.[t];return b?`<tr><td>${g.stage==='screen'?'粗筛':'复测第'+g.round+'轮'}</td><td>${full?fmt(candidate(s,g).cm,2):'条件'+candidate(s,g).label}</td><td>${NAMES[t]}</td><td>${fmt(b.score,3)}</td><td>${fmt(b.accuracy*100,1)}%</td><td>${b.hits}/${b.shots}</td><td>${fmt(b.meanAcquireMs,0)}ms</td><td>${b.timeouts}</td><td>${fmt(b.rmsDeg,2)}°</td></tr>`:'';}).join('');}).join('');
    el.innerHTML=`<div class="card space"><div class="eyebrow">${modeLabel(s)}</div><h2>${headline}</h2><p class="space">${esc(s.runtime.phase==='abandoned'?s.abandonedReason:full?rec.reason:'完成预定复测后才作最终判断。粗筛成绩不会混入复测比较。')}</p><p>计划 ${fmt(effectivePlan(s)/60,1)} 分钟；实际经过 ${fmt(elapsedWall(s)/60000,1)} 分钟；已完成配对轮 ${a.pairedRounds}/${a.requiredRounds}。结果不代表终身最佳或跨日独立验证，不提供正式95%区间。</p>${segmentDetails(s)}${a.boundary?'<p class="warn">领先点位于搜索边界，最佳点可能仍在范围外；不外推未测数值。</p>':''}${[...(a.warnings||[]),...(s.warnings||[])].map(w=>`<p class="warn">${esc(w)}</p>`).join('')}
    <p class="tiny">工程最低数据线：${deep(s)?'每任务有效时长≥计划的99%，点选每块至少3次命中与5次射击':'每任务有效时长≥11.9秒，点选每块至少2次命中与3次射击'}才支持可信比较；零命中仍保留，不能用极小数制造优势。所有正式左键都计入射击次数；双击保护仅拒绝微调80ms、切换/转向100ms以内的过早命中，不删除误点。拒绝未松开鼠标的重复按下事件和不可信合成事件；无法识别所有外部宏。跟枪按真实时间加权。${deep(s)?'60/45秒':'12秒'}末尾未完成目标按右删失记录，保留全部任务时长作分母，不额外计超时。</p>
    ${full?`<div class="tablewrap"><table><thead><tr><th>cm/360</th><th>相对角增益</th><th>综合相对表现</th>${TASKS.map(t=>`<th>${NAMES[t]}</th>`).join('')}<th>方向一致性</th><th>费力/疼痛</th><th>检查</th></tr></thead><tbody>${rowHtml}</tbody></table></div><div class="row">${ready?`<button class="primary" data-single-action="adopt" data-cm="${rec.cm}">采用此候选，进入跨游戏换算</button>`:''}<button data-single-action="keep">保留原灵敏度</button><button data-single-action="report">导出本次报告</button><button data-single-action="export">导出备份</button></div>`:'<button data-single-action="resume">继续未完成测试</button>'}
    <details><summary>四项原始表现（粗筛与复测分列）</summary><div class="tablewrap"><table><thead><tr><th>阶段</th><th>条件</th><th>任务</th><th>命中/秒或跟枪占比</th><th>命中率</th><th>命中/射击</th><th>获取时间</th><th>超时</th><th>RMS</th></tr></thead><tbody>${raw}</tbody></table></div></details>
    ${full?`<details><summary>各轮变化与冻结规则</summary><p>${esc(rules(s))}</p>${a.rows.map(x=>`<p>${fmt(x.cm,2)} cm/360：${x.rounds.map(r=>`第${r.round}轮 ${fmt(r.relative,3)}×`).join('；')}；中位表现 ${fmt(x.medianRelative,3)}×；观察范围（不是置信区间） ${x.range?x.range.map(y=>fmt(y,3)).join(' ～ '):'不足'}</p>`).join('')}<p>基准状态变化：${esc(driftText(a.drift))}。不据此删除后半程成绩。</p><p>表现接近的已测试候选：${a.near.map(x=>fmt(x.cm,2)).join('、')||'样本不足'}；未测中间值不构成已验证区间。</p></details>`:''}<p class="tiny space">基准保留原测量不确定性。请在烽火地带和全面战场的正常游戏中复核；不强制再完成6天才能使用本次结果。</p></div>`;return true;
  }
  function click(e){const b=e.target.closest('[data-single-action]');if(!b||b.disabled)return;const a=b.dataset.singleAction;e.preventDefault();if(a==='start120')start('120min');else if(a==='preflight')confirmPreflight();else if(a==='extend-rest')extendRest();else if(a==='report')B.exportSessionReport?.(activeStudy());else if(a==='start20')start('20min');else if(a==='start10')start('10min');else if(a==='resume')resume();else if(a==='lock')requestLock();else if(a==='rate')rate($('singleEffort').value,$('singlePain').value);else if(a==='extend')extend();else if(a==='close'){if(live)pause('用户暂停');B.closeStage();renderLab();}else if(a==='results'){B.closeStage();renderResults();B.go('results');}else if(a==='settings')B.go('setup');else if(a==='practice')$('practiceBtn').click();else if(a==='export')B.exportJSON();else if(a==='adopt')B.adoptCm(+b.dataset.cm,activeStudy().configSnapshot.dpi);else if(a==='abandon')abandon();else if(a==='abandon-device')abandon('设备、DPI或输入路径已改变');else if(a==='history')selectHistory($('singleHistory').value);else if(a==='keep')B.adoptCm(activeStudy().configSnapshot.baseCm,activeStudy().configSnapshot.dpi);}
  doc.addEventListener('mouseup',mouseup);doc.addEventListener('mousemove',mousemove);B.getArena().addEventListener('mousedown',mousedown);doc.addEventListener('keydown',keydown);doc.addEventListener('click',click);
  function recoverLoaded(persist=false){
    const restored=activeStudy();if(restored?.runtime&&!TERMINAL.includes(restored.runtime.phase)){
      const r=restored.runtime,plannedRest=restPhase(r)&&!r.paused;if(plannedRest){consumeRest(Math.max(0,clock.wall()-r.lastActiveAt));r.lastActiveAt=clock.wall();}
      if(r.phase==='task'&&(r.engaged||r.elapsed>0||r.partial)){restored.attempts.push({...meta(restored),type:'technical',groupId:restored.groups[r.groupIndex]?.id,task:restored.groups[r.groupIndex]?.taskOrder[r.taskIndex],valid:false,reason:'网页刷新或导入，当前任务中断',created:iso(),partial:r.partial||null});restored.timing.faultMs+=r.elapsed;r.elapsed=0;r.partial=null;}
      r.paused=true;r.engaged=false;if(!plannedRest)r.pauseStartedAt??=r.lastActiveAt;segment(restored,'刷新或导入后恢复');if(persist)save();
    }
  }
  function onWorkspaceLoaded(){release();storageFailed=false;recoverLoaded(true);renderLab();renderResults();}
  recoverLoaded();
  function dispose(){disposed=true;stopFrame();doc.removeEventListener?.('mouseup',mouseup);doc.removeEventListener?.('mousemove',mousemove);B.getArena().removeEventListener?.('mousedown',mousedown);doc.removeEventListener?.('keydown',keydown);doc.removeEventListener?.('click',click);}
  return{isActive,onLocked,pause,renderLab,renderResults,activeStudy,dispose,start,resume,rate,extend,requestLock,onWorkspaceLoaded,selectHistory,abandon,confirmPreflight,extendRest};
}
root.SensSessionApp={create};if(typeof module!=='undefined'&&module.exports)module.exports=root.SensSessionApp;
})(typeof globalThis!=='undefined'?globalThis:window);
