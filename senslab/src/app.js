/* SensLab Personal. No remote requests, analytics, or external dependencies. */
(function(){
'use strict';
const ORIGINAL='<!doctype html>\n'+document.documentElement.outerHTML;
const MULTIFILE=!!document.querySelector('script[src="app.js"]');
const M=SensMath,$=id=>document.getElementById(id),KEY='senslab.personal.v1';
const TEST_RESET_REVISION='user-reset-20261017-v102-1';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(x,n=2)=>Number.isFinite(x)?x.toFixed(n):'—';
const pct=(x,n=1)=>Number.isFinite(x)?(x*100).toFixed(n)+'%':'—';
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const randomSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0];
const today=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const env=()=>({ua:navigator.userAgent,dpr:devicePixelRatio,w:innerWidth,h:innerHeight,sw:screen.width,sh:screen.height});
const sameEnv=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Viewport and FOV affect task geometry, not the physical input calibration.
const inputCompatible=(a,b)=>!!a&&!!b&&a.ua===b.ua&&a.dpr===b.dpr;
const inputChanges=(a,b)=>!a||!b?['缺少输入环境']:['ua','dpr'].filter(k=>a[k]!==b[k]).map(k=>k==='ua'?'浏览器/输入路径':'系统或浏览器缩放');
let singleApp=null,migrationReady=true,protectedStored=null;
const MIGRATION_BACKUP=KEY+'.pre-single-v1',DEEP_MIGRATION_BACKUP=KEY+'.pre-deep-v2';
const defaults=()=>({schema:'senslab-personal/1',settings:null,calibration:null,calibrationDraft:null,studies:[],active:null,singleStudies:[],singleActive:null,storageVersion:3,mappings:[],field:[],testResetRevision:TEST_RESET_REVISION});
function clearRecordedTests(source){return{...defaults(),settings:source.settings??null,mappings:source.mappings??[]};}
let data=defaults(),view='home',reportPhase='explore',run=null,calSession=null,rawMode='unknown',lockIntent=null,expectedUnlock=false,restTimer=null,toastTimer=null;
const arena=$('arena'),ctx=arena.getContext('2d',{alpha:false}),stage=$('stage');
let canvasW=innerWidth,canvasH=innerHeight,calResult=null,flash=0,flashGood=true;
let lockEpoch=0,lockPending=null;
/* SENSLAB_V102_APPLIED */
(function core(M){
 const legacy=M.calibration;
 const EPS=1e-12;
 M.calibrationSample=function(r){
  if(!r||r.method!=='net-projection-v2'||!['x','y'].includes(r.axis)||![1,-1].includes(r.dir)||!['slow','fast'].includes(r.speed))return '记录结构无效';
  if(![r.dx,r.dy,r.cm,r.ms,r.motionEvents].every(Number.isFinite)||r.cm<5||r.cm>30)return '距离或输入数值无效';
  const net=r.axis==='x'?r.dx:r.dy,other=r.axis==='x'?r.dy:r.dx;
  if(Math.abs(net)<50||r.motionEvents<2)return '未收到足够的有效移动。按空格开始后，再移动鼠标。';
  if(net*r.dir<=0)return '移动方向与提示相反。只重做这一条即可。';
  if(r.ms<40)return '移动记录过短。请自然地滑动，不要瞬间抬起或旋转鼠标。';
  if(Math.abs(other)>Math.abs(net))return '主要移动到了另一方向。横向用左右标记，纵向用前后标记；鼠标朝向保持不变。';
  return '';
 };
 M.calibration=function(rows){
  if(!Array.isArray(rows))return{ok:false};
  if(!rows.some(r=>r?.method==='net-projection-v2'))return legacy.call(this,rows);
  const issues=[],bad=rows.map((r,i)=>this.calibrationSample(r)?i:-1).filter(i=>i>=0);
  if(rows.length!==12||bad.length)return{method:'net-projection-v2',ok:false,issues:['有缺失或无效记录。'],bad};
  const expected=[...Array.from({length:2},()=>[['x',1,'slow'],['x',-1,'slow'],['x',1,'fast'],['x',-1,'fast']]).flat(),['y',1,'slow'],['y',-1,'slow'],['y',1,'fast'],['y',-1,'fast']];
  if(rows.some((r,i)=>r.axis!==expected[i][0]||r.dir!==expected[i][1]||r.speed!==expected[i][2]||r.cm!==rows[0].cm))return{ok:false,issues:['记录顺序或标记间距不一致。']};
  const gain=r=>Math.abs(r.axis==='x'?r.dx:r.dy)/r.cm;
  const x=rows.filter(r=>r.axis==='x'),y=rows.filter(r=>r.axis==='y');
  const ux=this.median(x.map(gain)),uy=this.median(y.map(gain));
  const groups=['x','y'].map(axis=>{
   const a=rows.filter(r=>r.axis===axis),slow=a.filter(r=>r.speed==='slow'),fast=a.filter(r=>r.speed==='fast');
   return{axis,slowMs:this.median(slow.map(r=>r.ms)),fastMs:this.median(fast.map(r=>r.ms)),cv:this.cv(a.map(gain)),speedError:Math.abs(this.median(fast.map(gain))/this.median(slow.map(gain))-1),speedContrast:this.median(slow.map(r=>r.ms/r.cm))/this.median(fast.map(r=>r.ms/r.cm))};
  });
  for(const g of groups){const n=g.axis==='x'?'横向':'纵向';if(g.cv>.05+EPS)issues.push(n+'重复测量差异超过5%，请检查端点距离；表中标出了偏离中位数较大的记录。');if(g.speedError>.05+EPS)issues.push(n+'快慢两组的单位/厘米相差超过5%。可能是端点、鼠标朝向或加速影响，不直接断定原因。');if(g.speedContrast<1.5-EPS)issues.push(n+'快慢速度还不够区分。请核对本轴的慢速和快速耗时；慢速可约2秒，快速约0.5–1秒。只有确实操作有误时才重测对应记录。');}
  const cv=Math.max(...groups.map(g=>g.cv)),speedError=Math.max(...groups.map(g=>g.speedError)),speedContrast=Math.min(...groups.map(g=>g.speedContrast));
  return{method:'net-projection-v2',ux,uy,cv,speedError,speedContrast,pathGood:true,groups,issues,bad:[],ok:issues.length===0};
 };
})(M);
function validateBackup(d){
 const fail=()=>{throw Error('备份结构或数值不合法，请使用本工具导出的完整JSON。')};
 if(!d||d.schema!=='senslab-personal/1'||!Array.isArray(d.studies)||d.studies.length>40||!Array.isArray(d.field)||d.field.length>5000||!Array.isArray(d.mappings)||d.mappings.length>100)fail();
 const num=(x,a,b)=>Number.isFinite(x)&&x>=a&&x<=b;
 const config=c=>c&&num(c.dpi,100,64000)&&num(c.baseCm,8,160)&&num(c.fov,30,150)&&['horizontal','vertical','h43'].includes(c.fovType)&&num(c.swipe,5,100)&&Array.isArray(c.weights)&&c.weights.length===4&&c.weights.every(x=>num(x,.001,1))&&Math.abs(c.weights.reduce((a,b)=>a+b,0)-1)<.0001&&num(c.margin,.01,.1)&&num(c.taskDrop,.01,.3)&&num(c.accDrop,0,.2)&&num(c.maxEffort,1,8);
 if(d.settings&&!config(d.settings))fail();
 if(d.storageVersion!==undefined&&![2,3].includes(d.storageVersion))fail();
 if(d.singleStudies!==undefined){if(!Array.isArray(d.singleStudies)||d.singleStudies.length>100)fail();for(const s of d.singleStudies){SensSession.validateStudy(s);if(!s.runtime||!s.timing||!s.inputCheck||!config(s.configSnapshot)||!s.calSnapshot?.env||!Array.isArray(s.calSnapshot.rows)||!M.calibration(s.calSnapshot.rows).ok)fail();}}
 if(d.singleActive&&!d.singleStudies?.some(s=>s.id===d.singleActive))fail();
 if(d.calibration&&(!num(d.calibration.ux,1,1e6)||!num(d.calibration.uy,1,1e6)||!d.calibration.env||d.calibration.raw!=='requested'||!Array.isArray(d.calibration.rows)||d.calibration.rows.length!==12||!M.calibration(d.calibration.rows).ok))fail();
 for(const s of d.studies){if(!s||typeof s.id!=='string'||!config(s.config)||!Array.isArray(s.candidates)||s.candidates.length>7||s.candidates.length<3||!Array.isArray(s.sessions)||s.sessions.length>120||!s.cal||!s.cal.env||!num(s.cal.ux,1,1e6)||!num(s.cal.uy,1,1e6)||!num(s.seed,0,4294967295))fail();
 const ids=s.candidates.map(x=>x.id);if(new Set(ids).size!==ids.length||s.candidates.filter(c=>c.baseline).length!==1)fail();for(const c of s.candidates)if(typeof c.id!=='string'||!/^c[0-9]+$/.test(c.id)||!num(c.cm,5,250))fail();
 if(s.finalists&&(!Array.isArray(s.finalists)||s.finalists.length>3||s.finalists.length<2||new Set(s.finalists.map(c=>c.id)).size!==s.finalists.length||s.finalists.some(c=>!ids.includes(c.id)||s.candidates.find(k=>k.id===c.id).cm!==c.cm||s.candidates.find(k=>k.id===c.id).baseline!==c.baseline)||!s.finalists.some(c=>c.id===s.candidates.find(k=>k.baseline).id)))fail();
 for(const x of s.sessions){if(!x||!['explore','confirm'].includes(x.phase)||typeof x.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x.day)||!Array.isArray(x.order)||x.order.length>7||x.order.some(i=>!ids.includes(i))||!Array.isArray(x.taskOrder)||x.taskOrder.length!==4||new Set(x.taskOrder).size!==4||x.taskOrder.some(t=>!M.TASKS.includes(t))||!x.blocks||!x.ratings||!x.warmed)fail();
 for(const id of Object.keys(x.blocks)){if(!ids.includes(id))fail();for(const t of Object.keys(x.blocks[id])){if(!M.TASKS.includes(t))fail();const b=x.blocks[id][t];if(!b||!num(b.score,0,1000)||!num(b.duration,0,1e7)||!num(b.accuracy,0,1)||!Array.isArray(b.trials)||b.trials.length>100||!Array.isArray(b.trace)||b.trace.length>2000)fail()}}
 for(const r of Object.values(x.ratings))if(!r||!num(r.effort,0,10)||typeof r.pain!=='boolean'||!(r.lifts===null||num(r.lifts,0,10000)))fail();}
 }
 if(d.active&&!d.studies.some(s=>s.id===d.active))fail();
 for(const p of d.mappings)if(typeof p.name!=='string'||p.name.length>100||!num(p.dpi,100,64000)||!Array.isArray(p.samples)||p.samples.length<3||p.samples.length>100||p.samples.some(x=>!num(x.s,0,1e6)||!num(x.cm,.01,1e5)))fail();
 for(const f of d.field)if(!f||typeof f.study!=='string'||typeof f.candidate!=='string'||typeof f.mode!=='string'||typeof f.day!=='string'||!num(f.effort,0,10)||!num(f.minutes,10,240)||typeof f.notes!=='string'||f.notes.length>1500||!num(f.limited,0,1000)||!num(f.overshoot,0,1000)||typeof f.pain!=='boolean')fail();
 return d;
}
try{
 const stored=localStorage.getItem(KEY);
 protectedStored=stored;
 if(stored){
  const previous=validateBackup(JSON.parse(stored));data=previous;
  if(previous.storageVersion!==3){
   const migrated={...previous,storageVersion:3,singleStudies:previous.singleStudies||[],singleActive:previous.singleActive||null};
   try{if(!localStorage.getItem(MIGRATION_BACKUP))localStorage.setItem(MIGRATION_BACKUP,stored);if(!localStorage.getItem(DEEP_MIGRATION_BACKUP))localStorage.setItem(DEEP_MIGRATION_BACKUP,stored);localStorage.setItem(KEY,JSON.stringify(migrated));data=migrated;}
   catch(e){migrationReady=false;throw Error('升级前备份或保存失败；原工作区保留，请先导出JSON。');}
  }
 }
 data.singleStudies??=[];data.singleActive??=null;
 protectedStored=null;
}catch(e){migrationReady=false;console.warn('Local workspace read failed',e);$('storageWarning').style.display='block';$('storageWarning').textContent='未能读取或升级本地记录，已阻止保存覆盖。请点击导出JSON保存原始存储，再检查数据或导入有效备份。'}
data.singleStudies??=[];data.singleActive??=null;
function save(){if(!migrationReady){toast('原存储未能读取或安全升级，已阻止覆盖。请导出JSON后检查原始数据或导入有效备份。',true);return false}try{localStorage.setItem(KEY,JSON.stringify(data));$('storageWarning').style.display='none';return true}catch(e){$('storageWarning').style.display='block';toast('本地存储未成功。请立即导出备份。',true);return false}}
function toast(t,bad=false){$('toast').textContent=t;$('toast').style.display='block';$('toast').style.borderColor=bad?'#995b5b':'#57714a';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',6500)}
function download(name,text,type='application/json'){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
const study=()=>data.studies.find(s=>s.id===data.active)||null;
const unfinished=s=>s?.sessions.findLast(x=>!x.complete&&!x.abandoned)||null;
function calibrationStatus(){
 const cal=data.calibration,d=data.calibrationDraft;
 const state=(title,detail,ready=false)=>({title,detail,ready});
 if(!cal){
  const rows=Array.isArray(d?.rows)?d.rows:[],count=rows.filter(Boolean).length;
  if(count===12){const q=M.calibration(rows);return state(q.ok?'12/12 · 待确认保存':'12/12 · 需核对测量',q.ok?'12条测量检查已通过。点击“查看校准报告”，验证输入后沿用这组记录保存，无需再测12条。':'12条记录已收齐，但以下检查未通过：'+(q.issues||['记录无效']).join(' '));}
  return state('待完成校准',`已保留 ${count}/12 条，请继续未完成的记录。`);
 }
 if(!cal.ok||!Array.isArray(cal.rows)||!M.calibration(cal.rows).ok)return state('测量需核对','已有测量尚未通过质量检查，请查看校准报告。');
 if(cal.raw!=='requested')return state('待验证输入','测量已完成，但原始输入请求未确认。请查看报告并验证输入。');
 if(!inputCompatible(cal.env,env()))return state('校准保留 · 输入环境变化',`${inputChanges(cal.env,env()).join('、')}与采样时不同，请恢复输入环境或重新校准。窗口大小/FOV本身不要求重测尺子。`);
 if(cal.deviceNotes!==undefined&&cal.deviceNotes!==(data.settings?.environment||''))return state('校准保留 · 设备说明变化','设备说明已变化，请到设备页确认是否只修改了备注；实际设备或输入路径改变时需重新校准。');
 if(!data.settings)return state('校准已完成 · 待保存设置',`12/12条校准已通过，校准DPI为 ${cal.dpi}。请填写并保存设备设置，无需重做校准。`);
 if(cal.dpi!==data.settings.dpi)return state('校准已完成 · DPI不一致',`校准使用 ${cal.dpi} DPI，已保存设置为 ${data.settings.dpi} DPI。若只改了表单但未保存，请保存正确设置；若实际鼠标DPI已变，请重新校准。`);
 return state('已通过','12/12条输入校准已通过，可以进入正式实验。',true);
}
const calibrationReady=()=>calibrationStatus().ready;
function go(v){if(!$(v)?.classList.contains('view'))return;view=v;document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===v));document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));render();window.scrollTo({top:0,behavior:'instant'});if(v==='home')drawPreview()}
function fillSettings(){const c=data.settings;if(!c){$('baseCm').value='75.2';$('swipe').value='20';$('baseVerified').checked=false;$('environment').value='鼠标垫有效范围47.6×39.7cm；右手，鼠标自然略朝左；横向舒适行程约20cm（估计）';return;}['dpi','baseCm','fov','fovType','swipe','environment','margin','taskDrop','accDrop','maxEffort'].forEach(k=>{if($(k))$(k).value=['margin','taskDrop','accDrop'].includes(k)?c[k]*100:c[k]});c.weights.forEach((x,i)=>$('w'+i).value=+(x*100).toFixed(3));$('baseVerified').checked=true;$('swipeEstimated').checked=c.swipeEstimated??c.swipe===20;$('convertDpi').value=c.dpi;$('mappingDpi').value=c.dpi;}
function readSettings(){
 if(!$('settingsForm').reportValidity())throw Error('请完整填写并确认实测数据。');
 const weights=[0,1,2,3].map(i=>+$('w'+i).value);if(weights.some(w=>!Number.isFinite(w)||w<1)||Math.abs(weights.reduce((a,b)=>a+b)-100)>.01)throw Error('四项权重都必须大于零，且总和为100%。');
 const c={dpi:+$('dpi').value,baseCm:+$('baseCm').value,fov:+$('fov').value,fovType:$('fovType').value,swipe:+$('swipe').value,environment:$('environment').value.trim(),weights:weights.map(w=>w/100),margin:+$('margin').value/100,taskDrop:+$('taskDrop').value/100,accDrop:+$('accDrop').value/100,maxEffort:+$('maxEffort').value};M.candidates(c.baseCm);return c;
}
$('confirmDeviceUnchanged').onclick=()=>{if(!data.calibration)return toast('没有可沿用的物理校准。',true);if(!confirm('确认仅修改了文字备注，鼠标、DPI和输入路径均未改变？'))return;data.calibration.deviceNotes=data.settings?.environment||'';if(save()){render();toast(calibrationStatus().detail)}};
$('settingsForm').addEventListener('submit',e=>{e.preventDefault();$('setupError').textContent='';try{data.settings={...readSettings(),swipeEstimated:$('swipeEstimated').checked};data.parameterSources={dpi:'用户保存',baseCm:'用户确认的游戏测量',swipe:$('swipeEstimated').checked?'估计，仅操作范围提示':'用户保存，仅操作范围提示',updated:new Date().toISOString()};const persisted=save();render();if(persisted)toast('设置已保存，仅用于新实验；正在进行的实验规则不变。'+calibrationStatus().detail)}catch(e){$('setupError').textContent=e.message}});
$('useMeasurement').onclick=()=>{try{const a=$('measureDistances').value.split(/[,，\s]+/).filter(Boolean).map(Number);if(a.length<3||a.some(x=>!Number.isFinite(x)||x<=0))throw Error('至少填写3个正数距离。');const cv=M.cv(a),cm=M.median(a)*360/+$('measureAngle').value;$('measureResult').textContent=`中位数换算：${fmt(cm,3)} cm/360；重复变异${pct(cv)}。${cv>.05?'差异偏大，请重测。':'请同时核对游戏内转角。'}`;if(cv<=.05)$('baseCm').value=cm.toFixed(3)}catch(e){$('measureResult').textContent=e.message}};
function render(){
 const s=study(),a=s?M.analyze(s,s.finalists?'confirm':'explore'):null;
 $('dpiBadge').textContent=(data.settings?.dpi||1600)+' DPI';
 $('homeBase').innerHTML=(data.settings?fmt(data.settings.baseCm,2):'—')+' <small>cm / 360°</small>';
 $('homeBaseNote').textContent=calibrationStatus().detail;
 $('homeDays').innerHTML=(data.singleStudies||[]).filter(x=>x.status==='completed').length+' <small>已完成单次实验</small>';
 $('homePhase').textContent='默认120分钟深度实验 · 可选10/20分钟模式';
 $('homeRecommendation').textContent='在结果页查看本次已测试候选';
 $('settingsState').textContent=s?'实验已锁定':data.settings?'设置已保存':'';
 const cal=data.calibration,status=calibrationStatus();$('calBadge').textContent=status.title;
 $('calSummary').textContent=(cal?`横向 ${fmt(cal.ux,2)} / 纵向 ${fmt(cal.uy,2)} 单位/cm。`:'')+status.detail;
 $('archiveCount').textContent=`已归档 ${data.studies.filter(x=>x.archived).length} 个实验（包含在JSON备份中）`;
 renderLab();if(view==='results')renderResults();if(view==='convert')renderConvert();if(view==='field')renderField();
}
function renderLab(){
 const s=study(),ss=unfinished(s);let done=0,total=20;
 if(ss){total=ss.order.length*4;done=ss.order.reduce((n,id)=>n+M.TASKS.filter(t=>ss.blocks[id]?.[t]?.valid).length,0)}
 $('labProgress').style.width=100*done/total+'%';
 $('phaseBadge').textContent=s?(s.finalists?'确认 / 6日':'探索'):'尚未开始';
 const a=s?M.analyze(s,s.finalists?'confirm':'explore'):null;
 $('labTitle').textContent=!s?'建立你的第一轮实验':ss?`会话进行中 · ${done}/${total}任务`:`已完成${a.sessions}次会话 · ${a.days}个测试日`;
 $('labNext').textContent=ss?nextDescription(s,ss):s?'完整一轮后再查看结果。正式确认阶段同一天只计一次新会话。':(calibrationReady()?'校准已就绪，确认当前设备和身体状态后即可开始。':calibrationStatus().detail);
 $('runBtn').textContent=!s?'创建并开始实验 →':ss?'继续下一项 →':s.finalists&&a.days>=6?'确认阶段已完成':'开始新会话 →';
 $('runBtn').disabled=!!(s?.finalists&&a.days>=6&&!ss);
 if(s)$('labSummary').textContent=`基准与分析规则已冻结。${s.finalists?'候选已锁定；只使用锁定后的新数据。':`本轮以${s.candidates.length}个候选探索；至少3天后才能锁定确认。建议做满${s.candidates.length}天，以平衡条件的出现位置。`}`;
}
function nextState(s,ss){for(const id of ss.order){if(!ss.warmed[id])return{type:'warmup',id};for(const t of ss.taskOrder)if(!ss.blocks[id]?.[t]?.valid)return{type:t,id};if(!ss.ratings[id])return{type:'rating',id}}return{type:'complete'}}
function nextDescription(s,ss){const n=nextState(s,ss);if(n.type==='complete')return'本轮已完成';return`条件 ${ss.order.indexOf(n.id)+1}/${ss.order.length} · ${n.type==='warmup'?'30秒适应（不计分）':n.type==='rating'?'记录操作感受':M.NAMES[n.type]}`}
function createStudy(){if(!data.settings)throw Error('先保存设备设置。');if(!calibrationReady())throw Error(calibrationStatus().detail);if(data.studies.length>=40)throw Error('实验数量过多。请导出备份后清理工作区。');const s={id:uid(),created:new Date().toISOString(),seed:randomSeed(),config:structuredClone(data.settings),cal:structuredClone(data.calibration),candidates:M.candidates(data.settings.baseCm),finalists:null,sessions:[],invalid:[],archived:false};data.studies.push(s);data.active=s.id;save();return s;}
function createSession(s){const phase=s.finalists?'confirm':'explore',done=s.sessions.filter(x=>x.complete&&x.phase===phase);if(s.sessions.length>=120)throw Error('当前实验会话数已达上限。请导出、归档后开启新实验。');if(phase==='confirm'&&s.sessions.some(x=>x.phase==='explore'&&x.day===today()))throw Error('今天已进行探索，独立确认从下一个新测试日开始。');if(phase==='confirm'&&new Set(done.map(x=>x.day)).size>=6)throw Error('计划中的6日确认已完成，请进行游戏内复核。');if(phase==='confirm'&&done.some(x=>x.day===today()))throw Error('今天的确认会话已完成。独立确认要求6个不同测试日，今天可做游戏内复核。');const ids=(s.finalists||s.candidates).map(x=>x.id),i=s.sessions.filter(x=>x.phase===phase&&!x.abandoned).length;const ss={id:uid(),phase,day:today(),started:new Date().toISOString(),order:M.order(ids,s.seed+(phase==='confirm'?91:0),i),taskOrder:M.order(M.TASKS,s.seed+113,i),seed:randomSeed(),blocks:{},ratings:{},warmed:{},complete:false,restUntil:0};s.sessions.push(ss);save();return ss;}
function launchNext(){try{
 $('labError').textContent='';if(!$('sessionCheck').checked)throw Error('请先确认当前设备和身体状态。');let s=study()||createStudy();if(s.sessions.some(x=>x.day===today()&&Object.values(x.ratings).some(r=>r.pain))||data.field.some(f=>f.day===today()&&f.pain))throw Error('今天已记录疼痛或明显不适，请停止测试，不继续追求成绩。');if(innerWidth<800||matchMedia('(pointer: coarse)').matches)throw Error('正式瞄准实验需要桌面鼠标与至少800px宽的固定窗口。');if(!sameEnv(s.cal.env,env()))throw Error('窗口、缩放或浏览器环境已变化。请恢复原环境；无法恢复时应归档并重新校准。');if(s.cal.dpi!==s.config.dpi||s.cal.raw!=='requested')throw Error('实验校准与DPI不一致。');let ss=unfinished(s);if(ss&&ss.day!==today()){ss.abandoned=true;ss.abandonReason='跨日未完成，保留原记录但不参与分析';save();ss=null}if(!ss)ss=createSession(s);if(Date.now()<ss.restUntil)throw Error(`请再休息${Math.ceil((ss.restUntil-Date.now())/1000)}秒，或稍后继续。`);const n=nextState(s,ss);if(n.type==='complete'){completeSession(s,ss);return}if(n.type==='rating'){showRating(s,ss,n.id);return}openStage();const name=n.type==='warmup'?'条件适应（不计分）':M.NAMES[n.type];const desc=n.type==='track'||n.type==='warmup'?'持续移动鼠标，让中心准星留在运动目标内；不需要按住开火。':'移动鼠标转动视角，瞄准目标后单击左键。未命中可继续修正；超时也计入任务耗时。';lockIntent={kind:'task',s,ss,n};modal(`<div class="eyebrow">条件 ${ss.order.indexOf(n.id)+1} / ${ss.order.length}</div><h2 class="space">${name}</h2><p>${desc}</p><p>ESC退出会使当前任务无效，但保留已完成的其他任务。每个条件具有相同目标规则；当前数值在完整会话结束前隐藏。</p><div class="row"><button class="primary" data-action="acquire">锁定鼠标并开始</button><button data-action="closeStage">稍后继续</button></div>`);renderLab();
 }catch(e){$('labError').textContent=e.message;toast(e.message,true)}}
$('runBtn').onclick=launchNext;
function completeSession(s,ss){ss.complete=true;ss.completed=new Date().toISOString();save();closeStage();reportPhase=ss.phase;toast('整轮已完成，数据已保存。现在可以查看结果。');go('results')}
$('archiveBtn').onclick=()=>{const s=study();if(!s)return toast('当前没有正在进行的实验。');if(!confirm('归档会保留全部原数据，但停止当前实验。新实验不会混用旧数据。继续？'))return;s.archived=true;data.active=null;save();render();toast('已归档。现在可修改设置、重新校准并创建新实验。')};
function showRating(s,ss,id){openStage();modal(`<div class="eyebrow">条件 ${ss.order.indexOf(id)+1} / ${ss.order.length}</div><h2 class="space">先记录感受，再看成绩</h2><p>请给整个条件的四项任务评分，不要推测它是高敏还是低敏。抬鼠标次数无法可靠地由网页自动识别，只接受你的观察。</p><div class="formgrid"><label>费力度（0–10）<select id="ratingEffort">${ratingOptions()}</select></label><label>观察到的抬鼠标次数（可留空）<input id="ratingLifts" type="number" min="0" max="10000" placeholder="不确定可留空"></label></div><label class="check"><input id="ratingPain" type="checkbox">出现疼痛或明显不适</label><button class="primary" data-action="saveRating" data-candidate="${esc(id)}">保存此条件记录</button><div id="ratingError" class="inline-error"></div>`)}
function ratingOptions(){return'<option value="">请选择</option>'+Array.from({length:11},(_,i)=>`<option value="${i}">${i}${i===0?' · 非常轻松':i===10?' · 极费力':''}</option>`).join('')}
function saveRating(id){const s=study(),ss=unfinished(s);if(!ss)return;const ef=$('ratingEffort').value,lifts=$('ratingLifts').value,pain=$('ratingPain').checked;if(ef===''||(lifts!==''&&(!Number.isInteger(+lifts)||+lifts<0||+lifts>10000))){$('ratingError').textContent='请选择费力度；抬鼠标次数可空，但填写时须为非负整数。';return}ss.ratings[id]={effort:+ef,lifts:lifts===''?null:+lifts,pain};save();if(pain){closeStage();toast('已记录不适。请停止今天的测试。该条件不通过舒适度守门线。',true);render();return}if(nextState(s,ss).type==='complete')completeSession(s,ss);else{closeStage();render();toast('操作感受已保存。可继续下一条件，也可稍后继续。')}}
function openStage(){stage.classList.add('open');resizeCanvas();$('hudTitle').textContent='SensLab';$('hudDetail').textContent='';$('hudRight').textContent='';$('hudInput').textContent='';$('stageHelp').textContent='';}
function modal(html){$('modal').innerHTML=html;$('veil').classList.remove('hide');requestAnimationFrame(()=>$('modal').querySelector('button,input,select')?.focus())}
function hideModal(){$('veil').classList.add('hide')}
function unlock(){expectedUnlock=true;if(document.pointerLockElement)document.exitPointerLock()}
function closeStage(){singleApp?.pause('用户返回，已完成小任务保留');lockEpoch++;if(run)abortRun('用户退出，当前任务无效');run=null;calSession=null;lockIntent=null;unlock();stage.classList.remove('open');render()}
async function acquire(plain=false){
 if(lockPending)return toast('鼠标锁定请求仍在处理，请稍后再试。');
 const intent=lockIntent;if(!intent||!stage.classList.contains('open'))return;
 const token={epoch:++lockEpoch,intent};lockPending=token;
 const current=()=>token.epoch===lockEpoch&&lockIntent===intent&&stage.classList.contains('open');
 try{let result=plain?arena.requestPointerLock():arena.requestPointerLock({unadjustedMovement:true});if(result&&typeof result.then==='function'){await result;rawMode=plain?'fallback':'requested'}else{await new Promise(r=>setTimeout(r,150));rawMode='unconfirmed'}
 if(!current()){unlock();return}
 if(document.pointerLockElement!==arena)throw Error('浏览器没有允许鼠标锁定。请检查权限后重试。');
 if(rawMode!=='requested'&&lockIntent?.kind!=='practice'){unlock();throw Error('无法确认原始输入请求。正式校准/测试要求支持unadjustedMovement的桌面浏览器；此环境仅可练习。')}
 hideModal();if(lockIntent?.kind==='calibration')beginCalibration();else if(lockIntent?.kind==='practice')beginPractice();else if(lockIntent?.kind==='task')beginRun(lockIntent.s,lockIntent.ss,lockIntent.n);else if(lockIntent?.kind==='single')singleApp.onLocked();
 }catch(e){unlock();if(!current())return;modal(`<h2>鼠标锁定未就绪</h2><p>${esc(e.message)}</p><p>请使用桌面Chrome或Edge，允许鼠标锁定，并直接打开网页而不是嵌入预览。浏览器拒绝后需再次点击按钮，不能自动重试。</p><div class="row"><button data-action="acquire" class="primary">再次请求</button>${lockIntent?.kind==='practice'?'<button data-action="fallbackPractice">普通输入练习</button>':''}<button data-action="closeStage">返回</button></div>`)}
 finally{if(lockPending===token)lockPending=null}
}
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===arena){const pending=lockPending&&lockPending.epoch===lockEpoch&&lockPending.intent===lockIntent;if(!stage.classList.contains('open')||(!pending&&!run&&!calSession&&!singleApp?.isActive())){unlock();return}expectedUnlock=false;return}if(expectedUnlock){expectedUnlock=false;return}singleApp?.pause('鼠标锁定丢失，当前小任务中断');if(run)abortRun('鼠标锁定丢失，当前任务无效');if(calSession){calSession=null;modal('<h2>校准已中断</h2><p>当前正在移动的一条未保存；已完成的记录已保留，同一环境可继续。</p><button data-action="closeStage">返回并重试</button>')}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){singleApp?.pause('切换标签页，当前小任务中断');if(run)abortRun('切换标签页，当前任务无效')}});window.addEventListener('blur',()=>{singleApp?.pause('窗口失焦，当前小任务中断');if(run)abortRun('窗口失焦，当前任务无效')});
window.addEventListener('resize',()=>{singleApp?.pause('窗口尺寸变化：暂停当前任务；目标投影/FOV发生变化，物理校准和已完成数据保留');resizeCanvas();if(run)abortRun('窗口尺寸变化，当前任务无效');if(calSession){calSession=null;unlock();modal('<h2>窗口发生变化</h2><p>记录已保留。恢复原窗口可继续；换新窗口应重新采样。</p><button data-action="closeStage">返回</button>')}if(view==='home')drawPreview()});
function resizeCanvas(){canvasW=innerWidth;canvasH=innerHeight;const dpr=Math.min(devicePixelRatio,2);arena.width=Math.round(canvasW*dpr);arena.height=Math.round(canvasH*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
const CAL_STEPS=[...Array.from({length:2},()=>[{axis:'x',dir:1,speed:'slow'},{axis:'x',dir:-1,speed:'slow'},{axis:'x',dir:1,speed:'fast'},{axis:'x',dir:-1,speed:'fast'}]).flat(),{axis:'y',dir:1,speed:'slow'},{axis:'y',dir:-1,speed:'slow'},{axis:'y',dir:1,speed:'fast'},{axis:'y',dir:-1,speed:'fast'}];
$('calibrateBtn').onclick=()=>{if(study()){toast('实验已锁定。请先归档实验再重新校准，或恢复原窗口环境。',true);return}const cm=+$('calDistance').value,dpi=+$('dpi').value;if(!(cm>=5&&cm<=30&&dpi>=100&&dpi<=64000))return toast('请填写有效距离和DPI。',true);openStage();lockIntent={kind:'calibration',cm,dpi,environment:env()};modal(`<div class="eyebrow">PHYSICAL INPUT CALIBRATION</div><h2 class="space">把两条标记相隔 ${fmt(cm,1)} cm</h2><p>把鼠标传感器对齐起点，按空格开始，沿指定方向平移到终点，再按空格结束。每次都从一条标记到另一条标记；不把回程、旋转或抬鼠标算进去。</p><p>慢速匀速移动，快速明显加快；两类耗时需形成差异。共12次。用空格控制，Backspace重做上一条，ESC退出。</p><div class="row"><button class="primary" data-action="acquire">锁定鼠标，进入校准</button><button data-action="closeStage">返回</button></div>`)};
function beginCalibration(){calSession={index:0,rows:[],active:false,...lockIntent};run=null;calibrationDisplay()}
function calibrationDisplay(message=''){const c=calSession;if(!c)return;const st=CAL_STEPS[c.index],direction=st.axis==='x'?(st.dir>0?'向右 →':'向左 ←'):(st.dir>0?'向下 ↓':'向上 ↑');$('hudTitle').textContent=`校准 ${c.index+1} / 12`;$('hudDetail').textContent=`${st.axis==='x'?'横向':'纵向'} · ${st.speed==='slow'?'慢速':'快速'} · ${direction}`;$('hudRight').textContent=fmt(c.cm,1)+' cm';$('hudInput').textContent='原始输入已请求 · 等待物理复核';$('stageHelp').textContent=message||`${c.active?'正在记录，到终点后按空格结束':'对齐起点后按空格开始'} · Backspace重做上一条 · ESC退出`;drawScene(ctx,canvasW,canvasH,0,0,M.vec(.15,.08),.025,100);ctx.fillStyle='#eef2f7';ctx.font='600 29px "Segoe UI","Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillText(`${st.speed==='slow'?'慢速':'快速'} ${direction}`,canvasW/2,canvasH/2-70);ctx.font='16px "Segoe UI","Microsoft YaHei",sans-serif';ctx.fillStyle='#c3f17c';ctx.fillText(c.active?'记录中 · 到终点按空格':'准备好后按空格',canvasW/2,canvasH/2+80)}
function calibrationSpace(){const c=calSession;if(!c)return;if(!inputCompatible(c.environment,env())){calSession=null;unlock();modal('<h2>环境已变化</h2><p>请返回并重新校准。</p><button data-action="closeStage">返回</button>');return}if(!c.active){c.active=true;c.started=performance.now();c.dx=0;c.dy=0;c.pathX=0;c.pathY=0;calibrationDisplay();return}c.active=false;const st=CAL_STEPS[c.index],signed=st.axis==='x'?c.dx:c.dy,units=Math.abs(signed),path=st.axis==='x'?c.pathX:c.pathY,cross=st.axis==='x'?c.pathY:c.pathX,ms=performance.now()-c.started;
 if(signed*st.dir<=0||units<50||units/path<.97||cross/units>.1||ms<60){calibrationDisplay('本条未通过：检查方向、回程或横向偏移。对齐后按空格重做本条。');return}
 c.rows.push({...st,cm:c.cm,units,path,cross,ms});c.index++;if(c.index===CAL_STEPS.length){finishCalibration(c);return}calibrationDisplay('上一条已记录。先对齐新的起点，再按空格开始。')}
function finishCalibration(c){calSession=null;calResult={...M.calibration(c.rows),rows:c.rows,env:c.environment,dpi:c.dpi,raw:rawMode,created:new Date().toISOString()};const ok=calResult.ok&&sameEnv(calResult.env,env())&&rawMode==='requested';unlock();if(ok){data.calibration=calResult;save()}
 modal(`<div class="eyebrow">INPUT QUALITY REPORT</div><h2 class="space">${ok?'校准通过并已保存':'校准需要重做'}</h2><div class="big">${fmt(calResult.ux,1)} <span class="tiny muted">横向单位/cm</span></div><p>纵向：${fmt(calResult.uy,1)} 单位/cm<br>重复变异：${pct(calResult.cv)}（≤5%）<br>快慢差异：${pct(calResult.speedError)}（≤5%）<br>慢/快耗时比：${fmt(calResult.speedContrast,2)}（≥1.5）</p><p>${ok?'后续保持DPI、窗口、缩放与设备不变。实际游戏还需要独立的cm/360复核。':'请检查距离标记、鼠标旋转、快慢区分以及系统/驱动加速。阈值是工程质检线，不是绝对准确性证明。'}</p><button class="primary" data-action="closeStage">返回设置</button>`);render()}
document.addEventListener('keydown',e=>{if(!stage.classList.contains('open'))return;if(calSession&&e.code==='Space'){e.preventDefault();if(!e.repeat)calibrationSpace()}if(calSession&&e.code==='Backspace'){e.preventDefault();if(calSession.active){calSession.active=false}else if(calSession.index>0){calSession.index--;calSession.rows.pop()}calibrationDisplay('本条重新开始。对齐起点后按空格。')}if(e.code==='Escape'&&!document.pointerLockElement&&!run&&!calSession)closeStage()});
function actualHFov(c,w=canvasW,h=canvasH){if(c.fovType==='vertical')return M.deg(2*Math.atan(Math.tan(M.rad(c.fov)/2)*w/h));if(c.fovType==='h43')return M.deg(2*Math.atan(Math.tan(M.rad(c.fov)/2)*(w/h)/(4/3)));return c.fov}
function beginPractice(){const s=study(),c=s?.config||data.settings||{dpi:1600,baseCm:40,fov:100,fovType:'horizontal'};const cal=s?.cal||data.calibration||{ux:c.dpi/2.54,uy:c.dpi/2.54};beginRun(null,null,{type:'practice',id:'practice'},c,cal)}
$('practiceBtn').onclick=()=>{openStage();lockIntent={kind:'practice'};modal('<h2>不计分练习</h2><p>体验第一人称跟枪与鼠标锁定。没有校准时只使用名义DPI近似；本轮绝不用于推荐，也不会替代正式输入校准。</p><div class="row"><button class="primary" data-action="acquire">开始练习</button><button data-action="closeStage">返回</button></div>')};
function beginRun(s,ss,n,practiceConfig,practiceCal){
 const c=s?.config||practiceConfig,cal=s?.cal||practiceCal,candidate=s?.candidates.find(x=>x.id===n.id)||{cm:c.baseCm};
 const idx=M.TASKS.indexOf(n.type),r=M.rng((ss?.seed||randomSeed())+(idx+3)*7321),nodes=Array.from({length:80},()=>({y:(r()-.5)*1.65,p:(r()-.5)*.4}));
 run={s,ss,n,c,cal,cm:candidate.cm,y:0,p:0,rng:r,nodes,target:M.vec(0,0),radius:M.rad(1.1),created:performance.now(),start:null,prev:null,lastTrace:0,trialStart:null,index:0,hits:0,shots:0,trialShots:0,trials:[],trace:[],frames:[],onTime:0,sqTime:0,integrated:0,pathCm:0,longFrames:0,invalid:null,duration:(n.type==='warmup'?30:n.type==='practice'?30:n.type==='track'?25:null),count:n.type==='turn'?12:18,env:env()};
 $('hudTitle').textContent=n.type==='practice'?'自由练习 · 不计分':n.type==='warmup'?'条件适应 · 不计分':M.NAMES[n.type];$('hudDetail').textContent=n.type==='practice'?'不生成推荐':`数值遮蔽 · 条件 ${(ss.order.indexOf(n.id)+1)}/${ss.order.length}`;$('hudInput').textContent=rawMode==='requested'?'原始输入已请求':'普通输入 · 仅练习';$('stageHelp').textContent='准星固定，移动鼠标转动视角 · ESC退出当前任务';requestAnimationFrame(tick);
}
function spawnTarget(r,now){const t=r.n.type,sets=t==='micro'?[2,4,7]:t==='switch'?[15,30,45]:[90,120,160],a=M.rad(sets[r.index%3]);let phi;if(t==='turn')phi=(r.rng()<.5?0:Math.PI)+(r.rng()-.5)*.07;else phi=r.rng()*2*Math.PI;r.radius=M.rad(t==='micro'?(r.index%2?.5:.3):t==='switch'?(r.index%2?1.1:.8):2);r.target=M.relative(r.y,r.p,a,phi);if(Math.abs(r.target[1])>Math.sin(M.rad(65))){phi=r.rng()<.5?0:Math.PI;r.target=M.relative(r.y,r.p,a,phi)}r.trialStart=now;r.trialShots=0;r.targetAmplitude=M.deg(a)}
function cat(a,b,c,d,t){return.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)}
function trackingTarget(r,sec){const x=sec/1.15,k=Math.floor(x),t=x-k,n=r.nodes,i=k+1;const y=cat(n[k].y,n[i].y,n[i+1].y,n[i+2].y,t),p=cat(n[k].p,n[i].p,n[i+1].p,n[i+2].p,t);return M.vec(y,p)}
function tick(now){const r=run;if(!r)return;const wait=now-r.created;if(wait<3000){$('hudRight').textContent=String(Math.ceil((3000-wait)/1000));drawScene(ctx,canvasW,canvasH,r.y,r.p,null,.02,actualHFov(r.c));requestAnimationFrame(tick);return}
 if(!r.start){r.start=now;r.prev=now;r.y=0;r.p=0;if(!r.duration)spawnTarget(r,now)}
 if(!sameEnv(r.env,env())){abortRun('显示环境变化，当前任务无效');return}
 const elapsed=now-r.start,dt=now-r.prev;r.prev=now;
 if(dt>250){abortRun('检测到超过250ms的显示中断，当前任务无效');return}if(dt>0)r.frames.push(dt);if(dt>100)r.longFrames++;
 if(r.longFrames>=3){abortRun('连续测试存在多次显著卡顿，当前任务无效');return}
 if(r.duration){r.target=trackingTarget(r,elapsed/1000);const error=M.angle(M.vec(r.y,r.p),r.target),step=Math.max(0,Math.min(dt,r.duration*1000-r.integrated));r.onTime+=(error<=r.radius?step:0);r.sqTime+=error*error*step;r.integrated+=step;if(elapsed-r.lastTrace>=200){r.trace.push([+elapsed.toFixed(1),+M.deg(error).toFixed(4)]);r.lastTrace=elapsed}$('hudRight').textContent=Math.max(0,r.duration-elapsed/1000).toFixed(1)+' s';if(elapsed>=r.duration*1000){finishRun(now);return}}
 else{const limit=r.n.type==='turn'?5000:4000;if(now-r.trialStart>=limit){endTrial(false,now,limit);if(!run)return}$('hudRight').textContent=`${Math.min(r.index+1,r.count)} / ${r.count}`}
 drawScene(ctx,canvasW,canvasH,r.y,r.p,r.target,r.radius,actualHFov(r.c));if(flash>now){ctx.strokeStyle=flashGood?'#c3f17c':'#fc9c9c';ctx.lineWidth=2;ctx.strokeRect(canvasW/2-11,canvasH/2-11,22,22)}requestAnimationFrame(tick);
}
function endTrial(hit,now,timeout=null){const r=run;if(!r||r.duration)return;const error=M.deg(M.angle(M.vec(r.y,r.p),r.target));r.trials.push({index:r.index,hit,ms:timeout??now-r.trialStart,shots:r.trialShots,errorDeg:error,amplitude:r.targetAmplitude,radiusDeg:M.deg(r.radius)});if(hit)r.hits++;r.index++;if(r.index>=r.count){finishRun(now);return}spawnTarget(r,now)}
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==arena)return;const dx=e.movementX,dy=e.movementY;if(!Number.isFinite(dx)||!Number.isFinite(dy))return;
 if(calSession?.active){calSession.dx+=dx;calSession.dy+=dy;calSession.pathX+=Math.abs(dx);calSession.pathY+=Math.abs(dy);return}
 if(run){const r=run;r.y+=dx/r.cal.ux*2*Math.PI/r.cm;r.y=Math.atan2(Math.sin(r.y),Math.cos(r.y));r.p=M.clamp(r.p-dy/r.cal.uy*2*Math.PI/r.cm,-M.rad(85),M.rad(85));if(r.start)r.pathCm+=Math.hypot(dx/r.cal.ux,dy/r.cal.uy)}
});
arena.addEventListener('mousedown',e=>{if(e.button!==0||!run||!run.start||run.duration||document.pointerLockElement!==arena)return;e.preventDefault();const r=run,now=performance.now();if(now-r.trialStart<(r.n.type==='micro'?80:100))return;r.shots++;r.trialShots++;const hit=M.angle(M.vec(r.y,r.p),r.target)<=r.radius;flash=now+100;flashGood=hit;if(hit)endTrial(true,now)});arena.addEventListener('contextmenu',e=>e.preventDefault());
function finishRun(now){const r=run;if(!r)return;run=null;unlock();
 if(r.n.type==='practice'){modal(`<h2>练习完成</h2><p>这次练习未存入实验，也没有生成推荐值。</p><p>${esc(calibrationStatus().detail)}</p><button class="primary" data-action="closeStage">返回</button>`);return}
 const fps=1000/M.median(r.frames),frameP95=M.quantile(r.frames,.95);if(!Number.isFinite(fps)||fps<45){invalidate(r,'显示帧率不足45FPS，当前任务无效');return}
 if(r.n.type==='warmup'){r.ss.warmed[r.n.id]=true;save();modal('<h2>适应完成</h2><p>本轮未计分。下一项将开始正式记录。</p><button class="primary" data-action="nextTask">继续下一项</button><button data-action="closeStage">稍后继续</button>');return}
 const duration=r.duration?r.integrated:now-r.start,accuracy=r.duration?r.onTime/Math.max(1,r.integrated):r.hits/Math.max(1,r.shots),score=r.duration?accuracy:r.hits/(duration/1000);
 const b={valid:true,task:r.n.type,created:new Date().toISOString(),duration,score,accuracy,hits:r.hits,shots:r.shots,completed:r.index,timeouts:r.trials.filter(t=>!t.hit).length,meanAcquireMs:r.trials.length?M.mean(r.trials.map(t=>t.ms)):null,rmsDeg:r.duration?M.deg(Math.sqrt(r.sqTime/Math.max(1,r.integrated))):null,pathCm:r.pathCm,frameFps:fps,frameP95,raw:rawMode,trials:r.trials,trace:r.trace,seed:r.ss.seed,env:r.env};
 (r.ss.blocks[r.n.id]??={})[r.n.type]=b;r.ss.restUntil=Date.now()+20000;save();modal('<div class="eyebrow">SAVED LOCALLY</div><h2 class="space">任务完成，已保存。</h2><p>一整轮结束后统一查看数据，避免中途结果影响操作预期。先放松握持，短暂休息。</p><button class="primary" data-action="nextTask" id="restNext" disabled>休息20秒</button><button data-action="closeStage">稍后继续</button>');clearInterval(restTimer);restTimer=setInterval(()=>{const btn=$('restNext');if(!btn){clearInterval(restTimer);return}const t=Math.max(0,Math.ceil((r.ss.restUntil-Date.now())/1000));btn.textContent=t?`休息${t}秒`:'继续下一项';btn.disabled=t>0;if(!t)clearInterval(restTimer)},500);renderLab();
}
function invalidate(r,reason){if(r.s){r.s.invalid??=[];r.s.invalid.push({day:today(),session:r.ss.id,candidate:r.n.id,task:r.n.type,reason,created:new Date().toISOString(),trials:r.trials});save()}modal(`<h2>本任务不计入结果</h2><p>${esc(reason)}</p><p>此前已完成任务仍然保留。恢复环境后重新做当前任务；无效轮次原因记录在JSON备份中。</p><button class="primary" data-action="closeStage">返回检查</button>`);renderLab()}
function abortRun(reason){const r=run;if(!r)return;run=null;unlock();if(r.n.type==='practice'){modal(`<h2>练习已结束</h2><p>${esc(reason)}</p><button data-action="closeStage">返回</button>`);return}invalidate(r,reason)}
function project(v,b,w,h,fov){const z=M.dot(v,b.f);if(z<=.015)return null;const f=w/(2*Math.tan(M.rad(fov)/2));return{x:w/2+f*M.dot(v,b.r)/z,y:h/2-f*M.dot(v,b.u)/z,z,f}}
function drawScene(c,w,h,y,p,target,radius,fov){
 c.fillStyle='#0c131c';c.fillRect(0,0,w,h);const b=M.basis(y,p);c.strokeStyle='#263743';c.lineWidth=1;
 function path(vectors){c.beginPath();let last=null;for(const v of vectors){const q=project(v,b,w,h,fov);if(!q||q.x<-w||q.x>2*w||q.y<-h||q.y>2*h){last=null;continue}if(last&&Math.abs(q.x-last.x)<w*.55)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);last=q}c.stroke()}
 for(const lat of[-45,-25,0,25,45])path(Array.from({length:73},(_,i)=>M.vec(M.rad(i*5),M.rad(lat))));
 for(let a=0;a<360;a+=30)path(Array.from({length:25},(_,i)=>M.vec(M.rad(a),M.rad(-72+i*6))));
 if(target){const q=project(target,b,w,h,fov);if(q&&q.x>0&&q.x<w&&q.y>0&&q.y<h){const ty=Math.atan2(target[0],target[2]),tp=Math.asin(M.clamp(target[1],-1,1)),tb=M.basis(ty,tp);c.beginPath();let started=false;for(let i=0;i<=32;i++){const a=i/32*2*Math.PI,v=target.map((x,k)=>x*Math.cos(radius)+(tb.r[k]*Math.cos(a)+tb.u[k]*Math.sin(a))*Math.sin(radius)),v2=project(v,b,w,h,fov);if(!v2)continue;if(!started){c.moveTo(v2.x,v2.y);started=true}else c.lineTo(v2.x,v2.y)}c.closePath();c.fillStyle='#88d3df';c.fill();c.strokeStyle='#c9f8ff';c.lineWidth=1;c.stroke();c.beginPath();c.arc(q.x,q.y,2,0,Math.PI*2);c.fillStyle='#345c67';c.fill()}
 else{const tx=M.dot(target,b.r),ty=-M.dot(target,b.u),ang=Math.atan2(ty,Math.abs(tx)<1e-8?1e-8:tx);const xx=w/2+Math.cos(ang)*w*.4,yy=h/2+Math.sin(ang)*h*.35;c.save();c.translate(xx,yy);c.rotate(ang);c.fillStyle='#88d3df';c.beginPath();c.moveTo(12,0);c.lineTo(-6,-6);c.lineTo(-6,6);c.closePath();c.fill();c.restore();c.fillStyle='#9bb1c4';c.textAlign='center';c.font='12px sans-serif';c.fillText(`${Math.round(M.deg(M.angle(b.f,target)))}°`,xx,yy+24)}}
 c.strokeStyle='#f0f4f8';c.lineWidth=1.5;c.beginPath();c.moveTo(w/2-8,h/2);c.lineTo(w/2-3,h/2);c.moveTo(w/2+3,h/2);c.lineTo(w/2+8,h/2);c.moveTo(w/2,h/2-8);c.lineTo(w/2,h/2-3);c.moveTo(w/2,h/2+3);c.lineTo(w/2,h/2+8);c.stroke();c.fillStyle='#f0f4f8';c.fillRect(w/2-.7,h/2-.7,1.4,1.4)
}
function drawPreview(){const can=$('preview'),w=can.clientWidth,h=can.clientHeight;if(!w||!h)return;can.width=w*2;can.height=h*2;const c=can.getContext('2d');c.scale(2,2);drawScene(c,w,h,-.1,-.04,M.vec(.22,.12),.045,95)}

function signed(x,n=1){return Number.isFinite(x)?`${x>0?'+':''}${(x*100).toFixed(n)}%`:'—'}
function edgeLeader(s,a){if(!a.leader)return false;const cms=s.candidates.map(c=>c.cm);return a.leader.cm===Math.min(...cms)||a.leader.cm===Math.max(...cms)}
function chartSVG(rows){const rr=rows.filter(r=>Number.isFinite(r.relative));if(!rr.length)return'';const w=820,h=270,l=60,r=25,t=25,b=55;let xmin=Math.log(Math.min(...rr.map(x=>x.cm))),xmax=Math.log(Math.max(...rr.map(x=>x.cm)));if(xmin===xmax){xmin-=.1;xmax+=.1}let ymin=Math.min(.95,...rr.map(x=>x.ci?1+x.ci[0]:x.relative)),ymax=Math.max(1.05,...rr.map(x=>x.ci?1+x.ci[1]:x.relative));const pad=(ymax-ymin)*.16;ymin=Math.max(0,ymin-pad);ymax+=pad;const X=x=>l+(Math.log(x)-xmin)/(xmax-xmin)*(w-l-r),Y=y=>h-b-(y-ymin)/(ymax-ymin)*(h-b-t);let v=`<svg class="reportchart" viewBox="0 0 ${w} ${h}" role="img" aria-label="已测灵敏度的综合表现及按日重采样区间，不连接未测数值">`;
 for(let i=0;i<5;i++){const z=ymin+(ymax-ymin)*i/4;v+=`<path d="M${l} ${Y(z)}H${w-r}" stroke="#293642"/><text x="${l-10}" y="${Y(z)+4}" fill="#9dacba" font-size="11" text-anchor="end">${fmt(z,2)}</text>`}
 v+=`<path d="M${l} ${Y(1)}H${w-r}" stroke="#9ca9b6" stroke-dasharray="5 5"/>`;
 for(const z of rr){const x=X(z.cm),y=Y(z.relative),color=z.gates?'#c3f17c':'#efb36f';if(z.ci)v+=`<path d="M${x} ${Y(1+z.ci[0])}V${Y(1+z.ci[1])} M${x-5} ${Y(1+z.ci[0])}h10 M${x-5} ${Y(1+z.ci[1])}h10" stroke="${color}" stroke-width="1.5"/>`;v+=`<circle cx="${x}" cy="${y}" r="5" fill="${color}"/><text x="${x}" y="${h-b+22}" fill="#c7d1db" font-size="11" text-anchor="middle">${fmt(z.cm,1)}${z.baseline?'*':''}</text>`}
 return v+`<text x="${w/2}" y="${h-8}" text-anchor="middle" font-size="11" fill="#9dacba">cm / 360°（对数横轴） · * 原基准 · 仅离散实测点</text></svg>`;
}
function renderResults(){const s=study();if(!s){$('resultsBody').innerHTML='<div class="empty"><h3>尚无个人实验数据</h3><p>你的1600 DPI只是设备设置，不足以计算最佳灵敏度。</p><button class="primary space" data-go="setup">先测量与校准 →</button></div>';return}const phase=reportPhase,a=M.analyze(s,phase);$('showExplore').classList.toggle('primary',phase==='explore');$('showConfirm').classList.toggle('primary',phase==='confirm');
 if(phase==='confirm'&&!s.finalists){$('resultsBody').innerHTML='<div class="empty"><h3>确认阶段尚未开始</h3><p>至少完成3个不同测试日的探索，再锁定包含原基准的候选。建议探索5日以平衡位置。</p><button class="space" data-action="showExplore">查看探索结果</button></div>';return}
 const partial=s.sessions.filter(x=>x.phase===phase&&!x.complete).length;
 if(!a.sessions){$('resultsBody').innerHTML=`<div class="empty"><h3>${phase==='confirm'?'等待锁定后的新测试日':'尚无完整会话'}</h3><p>已保存${partial}次未完成或中断会话，不进入选优统计。完成所有条件、四项任务及感受评分后才计入。</p><button class="primary space" data-go="lab">进入实验 →</button></div>`;return}
 const minDays=phase==='confirm'?6:3,adequate=a.rows.length&&a.rows.every(r=>r.days>=minDays),edge=edgeLeader(s,a);let headline,explain;
 if(!adequate){headline=`证据积累中 · ${a.days}/${minDays} 日`;explain='下表仅为当前描述。数据不足、零基准表现或缺少配对日期时，不给出确认结论。'}
 else if(!a.leader){headline='没有候选通过全部守门条件';explain='请先检查舒适度、精度损失和任务难度。不要从未通过的候选中强行选择“最高分”。'}
 else if(phase==='explore'){headline=`探索领先：${fmt(a.leader.cm,2)} cm/360`;explain=edge?'领先条件处于搜索边缘，应先扩展范围。当前不能宣称找到全局最优。':'这是用于选择确认候选的探索性结果，不能作为独立验证。'}
 else{const improved=a.rows.filter(r=>!r.baseline&&r.gates&&r.ci&&r.ci[0]>s.config.margin).sort((x,y)=>y.relative-x.relative);if(improved.length){headline=`确认支持候选：${fmt(improved[0].cm,2)} cm/360`;explain=`在本次四项任务和已测条件内，相对基准的调整区间下限超过预设${pct(s.config.margin)}改善线。仍需三角洲两种模式的游戏内复核。`}else{headline='尚无充分证据要求替换原基准';explain='新数据没有证明其他候选相对基准超过预设实用改善线。这不等于候选完全等效，也不排除游戏内舒适度上的差别。'}}
 let html=`<div class="card space"><div class="eyebrow">${phase==='explore'?'EXPLORATORY RESULTS':'INDEPENDENT CONFIRMATION'}</div><h2 class="space">${headline}</h2><p class="sub">${explain}</p><div class="legend"><span>${a.sessions} 次完整会话 / ${a.days} 个不同日期</span><span>${partial} 次不完整会话被排除</span><span>${s.invalid?.length||0} 次无效任务已记录</span></div>${chartSVG(a.rows)}</div>`;
 html+=`<div class="tablewrap"><table><thead><tr><th>cm/360</th><th>综合比值</th><th>对基准的调整区间</th>${M.TASKS.map(t=>`<th>${M.NAMES[t]}比值</th>`).join('')}<th>微调命中率差</th><th>费力度</th><th>守门条件</th></tr></thead><tbody>`;
 for(const r of a.rows){let reason=[];if(r.pains)reason.push('疼痛/不适');if(r.effort>s.config.maxEffort)reason.push('费力');if(r.accDiff< -s.config.accDrop)reason.push('精度');if(r.taskRatios.some(x=>x<1-s.config.taskDrop))reason.push('单项退步');if(r.relative===null)reason.push('无有效配对');html+=`<tr class="${r.gates?'good':''}"><td>${fmt(r.cm,3)}${r.baseline?' · 基准':''}</td><td>${fmt(r.relative,3)}</td><td>${r.baseline?'参照 = 0%':r.ci?`${signed(r.ci[0])} ～ ${signed(r.ci[1])}`:'少于3日 / 未计算'}</td>${r.taskRatios.map(v=>`<td>${fmt(v,3)}</td>`).join('')}<td>${Number.isFinite(r.accDiff)?(r.accDiff*100).toFixed(1)+' 个百分点':'—'}</td><td>${fmt(r.effort,1)}/10</td><td>${r.gates?'通过':esc(reason.join('、')||'无数据')}</td></tr>`}
 html+='</tbody></table></div><p class="tiny muted">区间在log比值空间按日重采样，非基准比较使用Bonferroni调整；小样本区间仍不稳定，不是严格等效检验。基准某任务为零时该配对不估计比值；候选为零时使用计算下限并由单项守门线排除。</p>';
 if(a.near.length&&adequate){html+=`<div class="card space"><h3>已测近优候选（不是连续“最优区间”）</h3><p class="sub">${a.near.map(r=>fmt(r.cm,2)).join('、')} cm/360。它们的点估计距领先值不超过${pct(s.config.margin)}，但尚未证明统计等效。${a.anchor?`按“靠近原基准优先”的预声明规则，保守锚点为${fmt(a.anchor.cm,2)}。`:''}</p><div class="row">${a.near.map(r=>`<button data-action="adoptCm" data-cm="${r.cm}">${fmt(r.cm,2)} → 换算</button>`).join('')}</div></div>`}
 if(phase==='explore'&&!s.finalists){html+=`<div class="card space"><h3>下一步：${edge?'扩展边界，或继续收集数据':'冻结候选，开始新数据确认'}</h3><p class="sub">原基准必须保留；另外选出最多2个通过守门条件的探索领先值。确认需要6个不同的新测试日，不把今天的探索再作为确认。冻结后不按中途结果改变候选或提前宣告成功。</p><div class="row"><button class="primary" data-action="lockConfirm" ${!adequate||!a.leader||edge?'disabled':''}>锁定候选，转入6日确认</button>${edge&&adequate?'<button data-action="expandSearch">以边缘领先值扩展新实验</button>':''}${!edge&&adequate&&a.leader&&!s.refinedFrom?'<button data-action="refineSearch">先细化领先区域（建议）</button>':''}</div></div>`}
 if(phase==='confirm'&&adequate)html+='<div class="notice">确认阶段的计划数据已完成。不要因结果不满意反复增加同阶段样本；需要更多数据时另建实验并预先声明新计划。下一步在游戏里按相同时段复核。</div><button class="primary" data-go="field">记录游戏内复核 →</button>';
 html+=`<details class="space"><summary>展开每个完整会话的原始摘要</summary><div class="tablewrap"><table><thead><tr><th>日期 / 条件</th><th>任务</th><th>有效命中/秒 或 跟枪占比</th><th>命中率/占比</th><th>超时</th><th>平均获取ms</th><th>跟踪RMS°</th><th>显示FPS</th></tr></thead><tbody>${s.sessions.filter(x=>x.phase===phase&&x.complete).map(ss=>ss.order.map(id=>M.TASKS.map(t=>{const b=ss.blocks[id][t],c=s.candidates.find(c=>c.id===id);return`<tr><td>${esc(ss.day)} / ${fmt(c.cm,2)}</td><td>${M.NAMES[t]}</td><td>${fmt(b.score,3)}</td><td>${pct(b.accuracy)}</td><td>${b.timeouts||0}</td><td>${fmt(b.meanAcquireMs,0)}</td><td>${fmt(b.rmsDeg,2)}</td><td>${fmt(b.frameFps,1)}</td></tr>`}).join('')).join('')).join('')}</tbody></table></div></details>`;
 $('resultsBody').innerHTML=html;
}
function lockConfirm(){const s=study();if(!s||s.finalists)return;const a=M.analyze(s,'explore'),base=a.rows.find(r=>r.baseline);if(unfinished(s))return toast('请先完成当前会话；不能在尚未完成的条件之间挑选候选。',true);if(a.rows.some(r=>r.days<3)||edgeLeader(s,a)||!base?.gates)return toast('需要至少3日有效配对、非边缘领先，并且基准没有不适/费力问题。',true);const others=a.rows.filter(r=>!r.baseline&&r.gates).sort((x,y)=>y.relative-x.relative).slice(0,2);if(!others.length)return toast('没有其他候选通过守门线。请保留基准或归档后重新设计范围。',true);if(!confirm(`冻结 ${[base,...others].map(r=>fmt(r.cm,2)).join(' / ')} cm/360。随后收集6个不同日期的新数据，今天的探索不再当确认。继续？`))return;s.finalists=[base,...others].map(({id,cm,baseline})=>({id,cm,baseline}));s.lockedAt=new Date().toISOString();s.lockedDay=today();save();reportPhase='confirm';go('results');toast('候选已冻结。下一个新测试日开始独立确认。')}
function refineSearch(){const s=study(),a=s&&M.analyze(s,'explore');if(!s||!a.leader||a.rows.some(r=>r.days<3)||s.finalists)return;if(unfinished(s))return toast('请先完成当前会话。',true);if(!confirm('将当前实验归档，在领先值附近用约5%间隔重新探索，并继续保留原基准。新数据与旧数据分开。继续？'))return;if(data.studies.length>=40)return toast('实验数达到上限。',true);const cms=[...new Set([.9,.95,1,1.05,1.1].map(k=>+(a.leader.cm*k).toFixed(3)).concat(s.config.baseCm))].filter(x=>x>=5&&x<=250).sort((a,b)=>a-b);s.archived=true;const n={id:uid(),created:new Date().toISOString(),seed:randomSeed(),config:structuredClone(s.config),cal:structuredClone(s.cal),candidates:cms.map((cm,i)=>({id:'c'+i,cm,baseline:cm===s.config.baseCm})),sessions:[],finalists:null,archived:false,refinedFrom:s.id};data.studies.push(n);data.active=n.id;save();reportPhase='explore';go('lab');toast('细化探索已创建，旧数据保留。')};
function expandSearch(){const s=study(),a=s&&M.analyze(s,'explore');if(!s||!a.leader||!edgeLeader(s,a))return;const center=a.leader.cm,base=s.config.baseCm,cms=[...new Set([center*.64,center*.8,center,center*1.25,center*1.5625,base].filter(x=>x>=5&&x<=250).map(x=>+x.toFixed(3)))].sort((a,b)=>a-b);if(!confirm('扩展会保留并归档当前实验，创建完全独立的新探索数据集；原基准继续保留。继续？'))return;if(data.studies.length>=40)return toast('实验数达到上限，请导出后另开工作区。',true);s.archived=true;const n={id:uid(),created:new Date().toISOString(),config:structuredClone(s.config),cal:structuredClone(s.cal),seed:randomSeed(),candidates:cms.map((cm,i)=>({id:'c'+i,cm,baseline:Math.abs(cm-base)<.001})),sessions:[],finalists:null,archived:false,expandedFrom:s.id};data.studies.push(n);data.active=n.id;save();reportPhase='explore';go('lab');toast('已创建扩展范围；旧数据不会混入新实验。')}
$('showExplore').onclick=()=>{reportPhase='explore';renderResults()};$('showConfirm').onclick=()=>{reportPhase='confirm';renderResults()};
const PRESETS=[{name:'三角洲行动 · Delta Force',yaw:.03,note:'KovaaK参考yaw 0.03；必须核对游戏版本与基础灵敏度，再用尺子验证。开镜单独标定。'},{name:'无畏契约 · Valorant',yaw:.06996,note:'KovaaK官方换算器参考标度；应用后实测复核'},{name:'Apex Legends',yaw:.022,note:'默认yaw、腰射；不自动匹配ADS'},{name:'CS2',yaw:.022,note:'默认m_yaw；非默认yaw请用自定义项'},{name:'Overwatch 2',yaw:.0066,note:'腰射参考标度；英雄开镜另行标定'},{name:'Source / Quake 默认标度',yaw:.022,note:'仅适用于确实使用此yaw的游戏配置'}];
function renderConvert(){const cm=+$('convertCm').value,dpi=+$('convertDpi').value,ok=cm>0&&dpi>=100&&dpi<=64000;let html='<table><thead><tr><th>游戏 / 配置</th><th>游戏内灵敏度</th><th>适用条件</th></tr></thead><tbody>';for(const p of PRESETS)html+=`<tr><td>${p.name}</td><td class="accent">${ok?fmt(M.sensitivity(cm,dpi,p.yaw),6):'先填写目标cm/360'}</td><td class="wrap muted">${p.note}</td></tr>`;html+='<tr><td>Aimlabs</td><td>选择对应游戏配置</td><td class="wrap muted">选择上述同一游戏配置和DPI后填换算值；不要把不同配置的数字直接比较。</td></tr><tr><td>任何预设不匹配 / 其他游戏</td><td>使用下方实测映射</td><td class="wrap muted">实测优先，不把参考yaw当作每个版本或倍率的保证。</td></tr></tbody></table><p class="tiny muted">参考：<a href="https://kovaaks.com/kovaaks/sens-converter" target="_blank" rel="noopener noreferrer">KovaaK官方换算器</a>、<a href="https://kovaaks.com/kovaaks/sens-converter/valorant-to-delta-force" target="_blank" rel="noopener noreferrer">三角洲参考标度</a>。这些是训练工具开发者的参考数据，不是每个游戏版本的官方保证。</p>';$('convertTable').innerHTML=html;
 $('customMaps').innerHTML=data.mappings.length?data.mappings.map(p=>{let result='填写目标距离后换算',err=false;if(ok)try{result=fmt(M.mapping(p.samples,cm,dpi,p.dpi),6)}catch(e){result=e.message;err=true}return`<div class="logcard"><div class="row"><h3>${esc(p.name)}</h3><span class="chip">${p.dpi} DPI测量 · ${p.samples.length}点</span><button class="ghost tiny danger" data-action="deleteMap" data-id="${esc(p.id)}">删除</button></div><p class="${err?'warn':'accent'} space">目标游戏内数值：${result}</p><p class="tiny muted">仅在实测范围内插值；FOV、瞄具和其他倍率须保持与配置名记载一致。</p></div>`}).join(''):'<p class="tiny muted space">尚无实测映射。示例仅是输入格式，不是三角洲参数。</p>';
 const yaw=+$('customYaw').value;try{$('yawResult').value=ok&&yaw>0?fmt(M.sensitivity(cm,dpi,yaw),7):'—'}catch(e){$('yawResult').value=e.message}
 try{$('adsResult').value=ok?fmt(M.focalCm(cm,+$('hipFov').value,+$('adsFov').value,+$('monitorPoint').value),3)+' cm/360':'—'}catch(e){$('adsResult').value=e.message}
 const measured=+$('verifyCm').value;$('verifyOutput').value=ok&&measured>0?`${pct(Math.abs(measured/cm-1),2)} · ${Math.abs(measured/cm-1)<=.03?'通过工程距离复核；仍需实战验证':'超过3%，请复测或补充映射点'}`:'—';
}
['convertCm','convertDpi','customYaw','hipFov','adsFov','monitorPoint','verifyCm'].forEach(id=>$(id).addEventListener('input',renderConvert));
$('saveMapping').onclick=()=>{try{$('mappingError').textContent='';const name=$('gameName').value.trim(),dpi=+$('mappingDpi').value;const lines=$('mappingSamples').value.trim().split(/\n+/),samples=lines.map(line=>{const a=line.trim().split(/[,，\s]+/).map(Number);if(a.length!==2)throw Error('每行恰好填写两个数：游戏内灵敏度, cm/360。');return{s:a[0],cm:a[1]}});if(!name||name.length>100||!(dpi>=100&&dpi<=64000)||samples.length<3||samples.length>100||samples.some(x=>!Number.isFinite(x.s)||!Number.isFinite(x.cm)||x.s<0||x.s>1e6||x.cm<=0||x.cm>1e5))throw Error('请填写配置名称、有效DPI和至少3个有效实测点。');M.mapping(samples,M.median(samples.map(x=>x.cm)),dpi,dpi);if(data.mappings.length>=100)throw Error('映射数已达上限，请导出并整理。');data.mappings.push({id:uid(),name,dpi,samples,created:new Date().toISOString()});save();renderConvert();toast('实测映射已保存。请到游戏中重新测量换算误差。')}catch(e){$('mappingError').textContent=e.message}};
const MODES={operations:'三角洲 · 烽火地带',warfare:'三角洲 · 全面战场',apex:'Apex Legends',valorant:'无畏契约',other:'其他游戏'};
const observationStudy=()=>{const current=singleApp?.activeStudy();return current?(['done','stopped','abandoned'].includes(current.runtime.phase)?current:null):study();};
function fieldCoverage(s){if(typeof s?.protocolVersion==='string'&&s.protocolVersion.startsWith('senslab-session/'))return '<div class="notice">本次单次实验仅建议在真实游戏中复核；无需额外连续测试6天。以下观察独立保存，不回填或改变本次网页复测结果。</div>';if(!s?.finalists)return'<div class="notice">先锁定候选。当前可以记实战观察，但探索期观察不能代替锁定后的对照复核。</div>';let h='<div class="tablewrap"><table><thead><tr><th>候选</th><th>烽火地带</th><th>全面战场</th></tr></thead><tbody>';for(const c of s.finalists){h+=`<tr><td>${fmt(c.cm,2)}${c.baseline?' 基准':''}</td>`;for(const mode of['operations','warfare']){const logs=data.field.filter(f=>f.study===s.id&&f.candidate===c.id&&f.mode===mode&&f.created>=s.lockedAt),days=new Set(logs.map(x=>x.day)).size,byLength=new Map();for(const f of logs){const k=String(f.minutes);if(!byLength.has(k))byLength.set(k,new Set());byLength.get(k).add(f.day)}const covered=[...byLength.values()].some(v=>v.size>=2),pain=logs.some(x=>x.pain);h+=`<td class="${pain?'bad':covered?'accent':'muted'}">${logs.length}时段 / ${days}天${pain?' · 存在不适':covered?' · 覆盖✓':' · 待补齐'}</td>`}h+='</tr>'}return h+'</tbody></table></div><p class="tiny muted">覆盖✓要求同一条件/模式在至少2天各有相同时长时段。不同条件之间还需人工核对时长、装备与场景；覆盖完整不自动证明某条件更好。</p>'}
function renderField(){const s=observationStudy(),val=$('fieldCandidate').value,candidates=s?(s.finalists||s.candidates):[];$('fieldCandidate').innerHTML='<option value="">请选择实验条件</option>'+candidates.map(c=>`<option value="${esc(c.id)}">${fmt(c.cm,3)} cm/360${c.baseline?' · 原基准':''}</option>`).join('');if(candidates.some(c=>c.id===val))$('fieldCandidate').value=val;$('fieldCoverage').innerHTML=s?fieldCoverage(s):singleApp?.activeStudy()?'本次单次测试尚未结束，暂不显示条件数值或绑定游戏复核。完成后再记录真实游戏表现。':'尚无实验。请先完成设备校准并创建实验。';const logs=data.field.filter(f=>!s||f.study===s.id).slice().reverse();$('fieldLog').innerHTML=logs.length?logs.slice(0,100).map(f=>`<div class="logcard"><div class="row"><h3>${esc(f.day)} · ${esc(MODES[f.mode]||f.mode)}</h3><span class="chip">${fmt(f.cm,2)} cm/360 · ${f.minutes}分钟</span></div><p class="space">费力${f.effort}/10 · 行程受限${f.limited}次 · 微调/过冲困难${f.overshoot}次${f.pain?' · <span class="bad">存在不适</span>':''}</p><p>${esc(f.notes||'未填写补充观察')}</p></div>`).join(''):'<div class="empty">尚无游戏内真实记录。不会自动用网页成绩填充。</div>'}
$('fieldForm').onsubmit=e=>{e.preventDefault();try{$('fieldError').textContent='';if(!$('fieldForm').reportValidity())return;const s=observationStudy(),id=$('fieldCandidate').value,c=s?.candidates.find(x=>x.id===id);if(!c)throw Error('请选择当前实验中的真实条件。');const f={id:uid(),study:s.id,candidate:id,cm:c.cm,protocolVersion:s.protocolVersion||'legacy-multiday-v1',phase:s.protocolVersion?'single-session':s.finalists?'confirm':'explore',mode:$('fieldMode').value,minutes:+$('fieldMinutes').value,effort:+$('fieldEffort').value,limited:+$('fieldLimited').value,overshoot:+$('fieldOvershoot').value,notes:$('fieldNotes').value.trim(),pain:$('fieldPain').checked,day:today(),created:new Date().toISOString()};if(!Number.isInteger(f.limited)||!Number.isInteger(f.overshoot))throw Error('观察次数应为整数。');if(data.field.length>=5000)throw Error('记录数达到上限，请先导出归档。');data.field.push(f);save();$('fieldNotes').value='';$('fieldPain').checked=false;renderField();toast(f.pain?'已记录不适，请停止当前测试；记录不等于诊断。':'真实观察已保存。',f.pain)}catch(e){$('fieldError').textContent=e.message}};
function exportJSON(){if(!migrationReady&&protectedStored!==null){download(`senslab-original-storage-${today()}.json`,protectedStored);return}download(`senslab-backup-${today()}.json`,JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2))}
function exportSessionReport(s){
 if(!s||s.id!==singleApp?.activeStudy()?.id)return toast('请先打开要导出的实验报告。',true);
 singleApp.renderResults();const content=$('singleResultsRoot').cloneNode(true);
 content.querySelectorAll('button,select').forEach(n=>n.remove());content.querySelectorAll('details').forEach(n=>n.open=true);
 const snapshot=s.configSnapshot,cal=s.calSnapshot;
 const header=`<h1>SensLab Personal · 本次实验报告</h1><p>协议 ${esc(s.protocolVersion)} · 模式 ${esc(s.mode)} · 实验 ${esc(s.sessionId||s.id)}</p><p>创建 ${esc(s.created)} · 结束 ${esc(s.completedAt||'尚未结束')} · 导出 ${esc(new Date().toISOString())}</p><p>冻结环境：${snapshot.dpi} DPI，基准约 ${fmt(snapshot.baseCm,2)} cm/360，${fmt(snapshot.fov,1)}° ${esc(snapshot.fovType)}。校准输入：${esc(cal.raw)}。舒适行程 ${fmt(snapshot.swipe,1)} cm（${s.provenance?.swipeEstimated?'估计':'保存值'}，仅提示）。</p>`;
 const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>SensLab 本次实验报告</title><style>body{font:16px/1.7 system-ui,sans-serif;margin:40px auto;padding:0 24px;max-width:1200px;color:#17212b}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ccd3da;padding:9px;text-align:left}h1{font-size:26px}h2{font-size:22px}.warn{color:#854900}.tablewrap{overflow:auto}details{margin:18px 0}summary{font-weight:bold}@media print{body{margin:0}table{font-size:10px}}</style>'+header+content.innerHTML+'<p>本文件只包含所选实验的描述报告；完整逐次输入、无效尝试、会话片段与快照可从应用另行导出JSON。单次同日结果不等于跨日独立验证，不保证游戏表现提升。</p></html>';
 download(`senslab-report-${s.mode}-${today()}.html`,html,'text/html;charset=utf-8');
}
function csvCell(x){let v=x===null||x===undefined?'':String(x);if(/^[=+@\-\t\r]/.test(v)&&!Number.isFinite(x))v="'"+v;return'"'+v.replace(/"/g,'""')+'"'}
function exportCSV(){
 const header=['protocolVersion','mode','study','phase','day','session','session_complete','candidate_cm360','baseline','task','valid','score','accuracy','duration_ms','hits','shots','timeouts','acquire_ms','rms_deg','path_cm','display_fps','display_frame_p95_ms','effort','lifts','pain','round','target_seed','adaptation_seconds','group_planned_seconds','attempt_count','interruption_reasons','sessionId','sessionSegment','conditionId','input_quality','actual_task_ms','tracking_covered_ms','adaptation_seed','post_rest_seconds','interruption_types','protocol_planned_seconds','measurement_planned_seconds','report_reserve_seconds'];
 const lines=[header];
 for(const s of data.studies)for(const ss of s.sessions)for(const id of Object.keys(ss.blocks))for(const t of M.TASKS){
  const b=ss.blocks[id][t];if(!b)continue;const c=s.candidates.find(x=>x.id===id),r=ss.ratings[id]||{};
  const row=['legacy-multiday-v1','multiday',s.id,ss.phase,ss.day,ss.id,!!ss.complete,c.cm,c.baseline,t,b.valid,b.score,b.accuracy,b.duration,b.hits,b.shots,b.timeouts,b.meanAcquireMs,b.rmsDeg,b.pathCm,b.frameFps,b.frameP95,r.effort,r.lifts,r.pain,'','','','','','',ss.id,'',id,b.raw||'',b.duration,'','','','','','',''];lines.push(row);
 }
 for(const st of data.singleStudies||[])for(const group of st.groups||[]){
  const result=st.results?.[group.id];if(!result)continue;const c=st.candidates.find(c=>c.id===group.candidateId),attempts=(st.attempts||[]).filter(a=>a.groupId===group.id);
  for(const [task,b] of Object.entries(result.tasks||{})){const interruptionTypes=[...new Set([...attempts,...(st.interruptions||[]).filter(a=>a.phase===group.stage&&a.round===group.round&&a.conditionId===group.candidateId&&a.sessionSegment===(b.sessionSegment??result.sessionSegment))].map(a=>a.type||a.interruptionType||'').filter(Boolean))].join(' | ');lines.push([st.protocolVersion,st.mode,st.id,group.stage,'',group.id,!!result.rating,c?.cm,c?.baseline,task,b.valid,b.score,b.accuracy,b.duration,b.hits,b.shots,b.timeouts,b.meanAcquireMs,b.rmsDeg,b.pathCm,b.frameFps,b.frameP95,result.rating?.effort,null,result.rating?.pain,group.round,group.seed,group.adaptSeconds,group.plannedSeconds,attempts.length,attempts.filter(a=>a.reason).map(a=>a.reason).join(' | '),b.sessionId||st.sessionId||st.id,b.sessionSegment??result.sessionSegment??'',b.conditionId||group.conditionId||group.candidateId,JSON.stringify(b.inputQuality||{raw:b.raw}),b.actualDuration??b.duration,b.coveredMs??b.onTime??(task==='track'&&Number.isFinite(b.accuracy)?b.duration*b.accuracy:null),group.adaptSeed??group.adaptationSeed??'',group.postRestSeconds??0,interruptionTypes,st.plannedSeconds,st.measurementSeconds??st.plannedSeconds,st.reportReserveSeconds??0]);}
 }
 download(`senslab-blocks-${today()}.csv`,'\ufeff'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');toast('已导出带协议、会话片段和轮次的任务CSV；逐次输入、中断原记录和完整快照见JSON。');
}
$('exportBtn').onclick=exportJSON;$('csvBtn').onclick=exportCSV;$('printBtn').onclick=()=>window.print();$('importBtn').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>15*1024*1024)throw Error('备份超过15MiB，请检查文件。');const d=validateBackup(JSON.parse(await f.text()));if(!confirm('导入将替换当前工作区。确认已导出当前数据并继续？'))return;const restored={...d,storageVersion:3,singleStudies:d.singleStudies||[],singleActive:d.singleActive||null,testResetRevision:TEST_RESET_REVISION};singleApp?.pause('导入工作区');const current=localStorage.getItem(KEY);if(current)localStorage.setItem(KEY+'.pre-import',current);localStorage.setItem(KEY,JSON.stringify(restored));data=restored;migrationReady=true;protectedStored=null;singleApp?.onWorkspaceLoaded?.();fillSettings();reportPhase='explore';render();toast('备份已导入，旧协议与单次实验分别保留。'+calibrationStatus().detail)}catch(e){toast('导入失败：'+e.message,true)}finally{$('importFile').value=''}};
$('sourceBtn').onclick=()=>{if(!MULTIFILE)download('SensLab-Personal.html',ORIGINAL,'text/html;charset=utf-8');else toast('当前是多文件开发版。运行 python build.py 后使用生成的 SensLab-Personal.html。',true)};
$('resetBtn').onclick=()=>{if(!confirm('清空此浏览器工作区？所有实验、映射和记录将移除，且不能撤销。请先导出JSON。'))return;singleApp?.pause('用户确认清空工作区');const fresh=defaults();try{localStorage.setItem(KEY,JSON.stringify(fresh))}catch(e){toast('清空未能保存，原记录仍保留。',true);return}data=fresh;migrationReady=true;protectedStored=null;singleApp?.onWorkspaceLoaded?.();closeStage();$('settingsForm').reset();$('convertCm').value='';render();go('home');toast('本机数据已清空。')};
$('fullscreenBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();toast('窗口已变化，当前任务已暂停。物理校准保留；同一比较轮应保持视口和FOV一致。')}catch(e){toast('全屏未获允许；也可固定最大化窗口进行测试。',true)}};
document.addEventListener('click',e=>{const b=e.target.closest('[data-view],[data-go],[data-action]');if(!b||b.disabled)return;if(b.dataset.view||b.dataset.go){go(b.dataset.view||b.dataset.go);return}const action=b.dataset.action;if(action==='acquire')acquire();else if(action==='fallbackPractice')acquire(true);else if(action==='closeStage')closeStage();else if(action==='nextTask'){closeStage();launchNext()}else if(action==='saveRating')saveRating(b.dataset.candidate);else if(action==='showExplore'){reportPhase='explore';renderResults()}else if(action==='lockConfirm')lockConfirm();else if(action==='expandSearch')expandSearch();else if(action==='refineSearch')refineSearch();else if(action==='adoptCm'){$('convertCm').value=b.dataset.cm;$('convertDpi').value=study()?.config.dpi||1600;go('convert')}else if(action==='deleteMap'){if(confirm('删除这条实测映射？')){data.mappings=data.mappings.filter(x=>x.id!==b.dataset.id);save();renderConvert()}}});
if(location.hostname.endsWith('githack.com')){$('hostingNote').classList.remove('hide');$('hostingNote').textContent='当前是第三方共享域名的临时在线入口，不是独立GitHub Pages。请定期导出JSON，勿填写隐私信息；长期建议使用离线网页或部署到自己的域名。'}
(function ui(){
 // Runs inside the original application's lexical scope after its handlers exist.
 const VERSION='net-projection-v2';
 function validDraft(d){return d&&d.method===VERSION&&Array.isArray(d.rows)&&d.rows.length===12&&d.rows.every(r=>r===null||!M.calibrationSample(r))&&d.env&&Number.isFinite(d.dpi)&&Number.isFinite(d.cm);}
 function draftFrom(c){return{method:VERSION,cm:c.cm,dpi:c.dpi,env:c.environment,raw:c.raw||rawMode,rows:structuredClone(c.rows),attempts:(c.attempts||[]).slice(-200),updated:new Date().toISOString()};}
 function keep(c){data.calibrationDraft=draftFrom(c);return save();}
 function label(i){const s=CAL_STEPS[i];return`${i+1}. ${s.axis==='x'?(s.dir>0?'向右':'向左'):(s.dir>0?'向后（靠近身体）':'向前（远离身体）')} / ${s.speed==='slow'?'慢速':'快速'}`;}
 const oldPractice=beginPractice;beginPractice=function(){stage.classList.remove('cal-v2-active');oldPractice();};
 const oldClose=closeStage;closeStage=function(){stage.classList.remove('cal-v2-active');oldClose();};
 function startCalibration(redoIndex,verify=false){
  if(!Number.isInteger(redoIndex)&&!verify&&(data.calibration||validDraft(data.calibrationDraft)&&data.calibrationDraft.rows.every(Boolean))){showSavedCalibration();return;}
  if(study())return toast('实验已锁定。请先导出备份并归档，再重新校准。',true);
  const storedDraft=data.calibrationDraft;
  if(verify&&(!validDraft(storedDraft)||!storedDraft.rows.every(Boolean)||!inputCompatible(storedDraft.env,env())))return toast('请恢复这组记录采样时的窗口与缩放，再验证输入；12条记录仍保留。',true);
  const useDraft=verify||Number.isInteger(redoIndex)&&validDraft(storedDraft);
  const cm=useDraft?storedDraft.cm:+$('calDistance').value,dpi=useDraft?storedDraft.dpi:+$('dpi').value;
  if(!(cm>=5&&cm<=30&&dpi>=100&&dpi<=64000))return toast('请填5–30cm的标记间距和有效DPI。',true);
  const d=data.calibrationDraft,same=validDraft(d)&&d.cm===cm&&d.dpi===dpi&&inputCompatible(d.env,env());
  if(d&&!same&&!confirm('标记间距、DPI或窗口已变化，旧草稿不能混入。本次将重新采样；已有实验记录保留。继续？'))return;
  const rows=same?structuredClone(d.rows):Array(12).fill(null),attempts=same?(d.attempts||[]).slice(-200):[];
  data.calibration=null;data.calibrationDraft={method:VERSION,cm,dpi,env:env(),rows,attempts};save();
  openStage();lockIntent={kind:'calibration',cm,dpi,environment:env(),rows,attempts,redoIndex:Number.isInteger(redoIndex)?redoIndex:null};
  const count=rows.filter(Boolean).length;
  modal(`<div class="eyebrow">容错校准 / v1.0.2</div><h2>量两条线的间距，不考验直线手法</h2><p>准备两条相距 <strong>${fmt(cm,1)} cm</strong> 的平行标记。左右移动时，量左右两线的间距；前后移动时，量前后两线的间距。保持鼠标朝向基本不变，尺子尽量沿鼠标本身的左右/前后方向放置。可在外壳贴一个参照点，起终点都看同一点，不必盯着底部传感器。</p><p><strong>允许轻微斜移、手抖和小幅回调。</strong>计算指定方向的净位移，不累计小抖动，不要求100%水平或垂直。仍要从正确起点到正确终点，不要抬鼠标回中或扭转鼠标。</p><p>对齐起点 → 空格开始 → 滑到终点并停稳 → 空格结束。${count?`已保留 ${count}/12 条记录。`:''}${Number.isInteger(redoIndex)?`这次只重测第 ${redoIndex+1} 条。`:''}快慢只需有区别，不用用力甩。</p><div class="row"><button class="primary" data-action="acquire">${count?'继续 / 重测指定记录':'锁定鼠标，开始校准'}</button><button data-action="closeStage">稍后继续</button></div>`);
 }
 function restartAllTests(){
   if(!confirm('全部重测将删除校准记录和草稿、所有实验成绩（含归档）及游戏复核记录。保留DPI、设备设置和跨游戏换算配置，并从第1条校准重新开始。确定继续？'))return;
   singleApp?.pause('用户确认全部重测');
   const fresh=clearRecordedTests(data);
   try{localStorage.setItem(KEY,JSON.stringify(fresh))}
   catch(e){toast('未能保存清除操作，旧记录仍保留。请检查浏览器存储后重试。',true);return}
   // Clear both persisted results and in-flight owners before any redraw.
   data=fresh;migrationReady=true;protectedStored=null;singleApp?.onWorkspaceLoaded?.();lockEpoch++;run=null;calSession=null;calResult=null;lockIntent=null;
   clearInterval(restTimer);restTimer=null;flash=0;reportPhase='explore';
   closeStage();$('modal').innerHTML='';$('sessionCheck').checked=false;
   $('labError').textContent='';$('setupError').textContent='';$('convertCm').value='';
   $('fieldNotes').value='';$('fieldPain').checked=false;
   $('storageWarning').style.display='none';
   renderResults();renderField();renderConvert();go('setup');
   toast('旧测试记录已清除。保留设备设置，从第1条校准重新开始。');
   startCalibration();
  }
  $('calibrateBtn').onclick=()=>startCalibration();
  document.addEventListener('click',e=>{if(e.target.closest('[data-restart-all]')){e.preventDefault();restartAllTests();}});
 beginCalibration=function(){
  const rows=lockIntent.rows||Array(12).fill(null);const missing=rows.findIndex(r=>!r);
  calSession={...lockIntent,raw:rawMode,rows,index:Number.isInteger(lockIntent.redoIndex)?lockIntent.redoIndex:missing,active:false};run=null;stage.classList.add('cal-v2-active');
  if(calSession.index<0){finishCalibration(calSession);return;}calibrationDisplay();
 };
 calibrationDisplay=function(message=''){
  const c=calSession;if(!c)return;
  $('hudTitle').textContent=`校准 ${c.index+1} / 12`;$('hudDetail').textContent=label(c.index);$('hudRight').textContent=fmt(c.cm,1)+' cm';$('hudInput').textContent=`${c.rows.filter(Boolean).length} 条已保留 · 允许轻微斜移`;
  $('stageHelp').textContent=message||'空格开始/结束 · Backspace重做本条或上一条 · Esc暂停并保留已完成记录';
  ctx.fillStyle='#10151b';ctx.fillRect(0,0,canvasW,canvasH);ctx.textAlign='center';
  ctx.fillStyle='#d6eac7';ctx.font='600 30px system-ui';ctx.fillText(label(c.index),canvasW/2,canvasH/2-90);
  ctx.fillStyle='#edf2f7';ctx.font='22px system-ui';ctx.fillText(c.active?'正在记录：到终点后停稳，再按空格':'对齐桌面起点后，按空格开始',canvasW/2,canvasH/2-20);
  ctx.fillStyle='#aeb9c6';ctx.font='16px system-ui';ctx.fillText('不用瞄准屏幕；看桌面两条标记，保持鼠标朝向不变。',canvasW/2,canvasH/2+40);
  ctx.fillText('中途有轻微抖动没关系。系统不再用轨迹是否笔直判失败。',canvasW/2,canvasH/2+78);
 };
 calibrationSpace=function(){
  const c=calSession;if(!c)return;
  if(!inputCompatible(c.environment,env())){keep(c);calSession=null;unlock();modal('<h2>窗口已变化</h2><p>记录已保留。请恢复原窗口后继续，或在新环境重新采样。</p><button data-action="closeStage">返回</button>');return;}
  if(!c.active){c.active=true;c.started=performance.now();c.dx=0;c.dy=0;c.pathX=0;c.pathY=0;c.motionStart=null;c.motionEnd=null;c.motionEvents=0;c.axisMotionEvents=0;calibrationDisplay();return;}
  c.active=false;const st=CAL_STEPS[c.index],row={...st,method:VERSION,cm:c.cm,dx:c.dx,dy:c.dy,units:Math.abs(st.axis==='x'?c.dx:c.dy),path:st.axis==='x'?c.pathX:c.pathY,cross:st.axis==='x'?c.pathY:c.pathX,ms:c.axisMotionEvents>=2?c.motionEnd-c.motionStart:0,motionEvents:c.motionEvents,axisMotionEvents:c.axisMotionEvents,timingMethod:'primary-axis-v1',elapsedMs:performance.now()-c.started};
  const reason=M.calibrationSample(row);c.attempts=(c.attempts||[]).concat([{index:c.index,row,accepted:!reason,reason,time:new Date().toISOString()}]).slice(-200);
  if(reason){keep(c);calibrationDisplay(reason+' 其他记录不受影响。');return;}
  c.rows[c.index]=row;keep(c);c.index=c.rows.findIndex(r=>!r);
  if(c.index<0){finishCalibration(c);return;}calibrationDisplay('已记录。结束后才把鼠标放到下一条的起点；准备好按空格。');
 };
 function showCalibrationReport(c,result,{saved=false,saveFailed=false}={}){
  const quality=result.ok,environmentOK=inputCompatible(c.environment,env());
  const problems=[...(result.issues||[])];
  if(!environmentOK)problems.push('测量记录保留，但窗口、缩放或浏览器与采样时不同。请恢复采样环境后再使用。');
  if(saveFailed)problems.push('浏览器存储写入失败。本页仍保留测量，请立即导出备份；不能当作已经保存。');
  const title=saveFailed?'测量已完成 · 尚未保存':saved?'校准通过，已保存':quality?'12/12 条测量通过 · 待确认保存':'12/12 条已完成 · 有检查未通过';
  const groups=result.groups||[];
  const groupTable=groups.length?`<div class="tablewrap"><table><thead><tr><th>检查</th><th>横向</th><th>纵向</th><th>要求</th></tr></thead><tbody>${[
   ['重复变异',g=>pct(g.cv,3),'≤5%'],['快慢差异',g=>pct(g.speedError,3),'≤5%'],['慢速耗时中位数',g=>fmt(g.slowMs/1000,3)+'s','参考'],['快速耗时中位数',g=>fmt(g.fastMs/1000,3)+'s','参考'],['慢/快耗时比',g=>fmt(g.speedContrast,3),'≥1.5']
  ].map(([name,format,limit])=>`<tr><td>${name}</td>${groups.map(g=>`<td>${format(g)}</td>`).join('')}<td>${limit}</td></tr>`).join('')}</tbody></table></div>`:'';
  const oldTiming=c.rows.some(r=>r&&r.method===VERSION&&r.timingMethod!=='primary-axis-v1');
  const settingsNote=saved?`<p class="${calibrationReady()?'accent':'warn'}">${esc(calibrationStatus().detail)}</p>`:'';
  modal(`<div class="eyebrow">输入测量报告 / 12 条记录已保留</div><h2>${title}</h2><p>横向 ${fmt(result.ux,1)} / 纵向 ${fmt(result.uy,1)} 单位/cm。完成12条是采样完成；下面逐项显示质量检查结果。</p>${groupTable}${problems.map(x=>`<p class="warn">${esc(x)}</p>`).join('')}${settingsNote}
  ${oldTiming?'<p class="tiny">这组含旧版计时记录：垂直于指定方向的微抖可能被算进耗时。旧记录没有完整事件轨迹，无法事后改算；若只因耗时比不达标，请核对操作后只重测受影响记录。</p>':''}
  <div class="tablewrap" style="max-height:260px;overflow:auto"><table><thead><tr><th>记录</th><th>单位/cm</th><th>偏离本轴中位数</th><th>移动耗时</th>${saved?'':'<th>操作</th>'}</tr></thead><tbody>${c.rows.map((r,i)=>{if(!r)return'';const v=r.method===VERSION?Math.abs(r.axis==='x'?r.dx:r.dy)/r.cm:r.units/r.cm,base=r.axis==='x'?result.ux:result.uy,dev=Math.abs(v/base-1);return`<tr><td>${label(i)}</td><td>${fmt(v,1)}</td><td class="${dev>.05+1e-12?'warn':''}">${pct(dev,2)}</td><td>${fmt(r.ms/1000,3)}s</td>${saved?'':`<td><button data-cal-redo="${i}">只重测此条</button></td>`}</tr>`}).join('')}</tbody></table></div>
  <p class="tiny">不因完成12条就跳过质量检查。重复变异≤5%、快慢差异≤5%、耗时比≥1.5；仅重测确有操作问题的记录，历史尝试保留。</p>
  <div class="row"><button class="primary" data-action="closeStage">${saved?'返回设置 / 开始实验':'返回设置，保留全部记录'}</button>${quality&&environmentOK&&!saved?'<button class="primary" data-cal-verify>验证输入并保存这12条（无需重测）</button>':''}${saved?'<button data-cal-new>重新校准（保留实验记录）</button>':''}<button data-cal-export>导出备份</button><button class="danger" data-restart-all>全部重测</button></div>`);
 }
 function showSavedCalibration(){
  const saved=data.calibration,d=saved||data.calibrationDraft;if(!d||!Array.isArray(d.rows)||!d.rows.every(Boolean))return;
  const c={rows:d.rows,attempts:d.attempts||[],environment:d.env,dpi:d.dpi,cm:d.cm||d.rows[0]?.cm,raw:d.raw};
  const result={...M.calibration(d.rows),raw:d.raw||'unknown'};
  openStage();lockIntent=null;showCalibrationReport(c,result,{saved:!!saved});
 }
 finishCalibration=function(c){
  calSession=null;stage.classList.remove('cal-v2-active');
  calResult={...M.calibration(c.rows),rows:structuredClone(c.rows),attempts:(c.attempts||[]).slice(-200),env:c.environment,dpi:c.dpi,raw:rawMode,deviceNotes:data.settings?.environment||'',created:new Date().toISOString()};
  const ok=calResult.ok&&inputCompatible(c.environment,env())&&rawMode==='requested';
  let saved=false,saveFailed=false;
  if(ok){
   const next={...data,calibration:calResult,calibrationDraft:null};
   try{localStorage.setItem(KEY,JSON.stringify(next));data=next;saved=true;$('storageWarning').style.display='none'}
   catch(e){data.calibrationDraft=draftFrom(c);saveFailed=true;$('storageWarning').style.display='block';}
  }else saveFailed=!keep(c);
  unlock();render();showCalibrationReport(c,calResult,{saved,saveFailed});
 };
 // Time only the instructed axis. Perpendicular jitter must not extend a completed stroke.
 document.addEventListener('mousemove',e=>{const c=calSession;if(!c?.active||document.pointerLockElement!==arena||!Number.isFinite(e.movementX)||!Number.isFinite(e.movementY)||(!e.movementX&&!e.movementY))return;c.motionEvents++;const st=CAL_STEPS[c.index],movement=st.axis==='x'?e.movementX:e.movementY;if(!movement)return;const t=performance.now();if(c.motionStart===null)c.motionStart=t;c.motionEnd=t;c.axisMotionEvents++;},true);
 // Capture prevents the old handler from removing all saved samples on Backspace.
 document.addEventListener('keydown',e=>{if(!calSession||!stage.classList.contains('open')||!['Space','Backspace'].includes(e.code))return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;const c=calSession;if(e.code==='Space'){calibrationSpace();return;}if(c.active)c.active=false;else c.index=Math.max(0,c.index-1);calibrationDisplay('重新对齐起点。下一条新记录会替换该条，旧尝试仍保存在备份里。');},true);
 document.addEventListener('click',e=>{if(e.target.closest('[data-cal-verify]')){e.preventDefault();startCalibration(undefined,true);return;}if(e.target.closest('[data-cal-new]')){e.preventDefault();startCalibration(0);return;}if(e.target.closest('[data-cal-export]')){e.preventDefault();exportJSON();return;}const b=e.target.closest('[data-cal-redo]');if(b){e.preventDefault();startCalibration(Number(b.dataset.calRedo));}});
 const oldRender=render;render=function(){oldRender();const d=data.calibrationDraft;
  $('calibrateBtn').textContent=data.calibration||validDraft(d)&&d.rows.every(Boolean)?'查看校准报告 →':validDraft(d)?'继续未完成的校准 →':'开始容错校准 →';
  if(!study())$('labSummary').textContent='完成校准并保存设备设置后，以当前值为基准建立新实验。';
 };
 function initHelp(){
  const style=document.createElement('style');style.textContent='#modal:has([data-cal-export]){width:min(880px,94vw);max-width:880px}.cal-v2-active #uxReticle,.cal-v2-active #uxCenterTag{display:none!important}.cm-explain{border:1px solid var(--line,#35404c);border-radius:14px;padding:20px;margin:18px 0;background:var(--panel,#151c24)}.cm-explain h3{margin-bottom:12px}.cm-comparison{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}.cm-comparison>div{flex:1;min-width:120px;padding:12px;border-radius:9px;background:rgba(150,170,160,.09)}.cm-explain small{display:block;line-height:1.8;color:var(--muted,#afbcc9)}';document.head.append(style);
  const box=document.createElement('div');box.className='cm-explain';box.id='cmMeaning';box.innerHTML='<h3>cm/360 是什么？就是“转一圈要推多远”。</h3><p><strong>游戏视角转一整圈，鼠标在桌面上平移的距离，单位是厘米。</strong>转的是游戏视角，不是拿鼠标在桌面上画圆。DPI 1600 单独不能说明这个距离，还要结合游戏内灵敏度。</p><div class="cm-comparison"><div><strong>20 cm/360</strong><small>推20厘米转一圈<br>相对更快</small></div><div><strong>40 cm/360</strong><small>推40厘米转一圈<br>转半圈需20厘米</small></div><div><strong>80 cm/360</strong><small>推80厘米转一圈<br>相对更慢</small></div></div><small>这些是解释单位的例子，不是给你的推荐值。数值越小，灵敏度越高。</small><p><strong>游戏转圈测量</strong>回答“当前游戏有多快”；<strong>浏览器尺子校准</strong>回答“网页收到多少输入等于桌面1厘米”。这是两个不同步骤，不要把两者混在一起。</p><button type="button" id="skipCmPractice">还没弄懂？先跳过，体验30秒练习（不计分）</button><p class="tiny">跳过只进入练习，使用示例初始值，不冒充你当前的灵敏度；正式对照实验仍需填写实测值。</p>';
  $('setup').insertBefore(box,$('setup').querySelector('.split'));
  $('skipCmPractice').onclick=()=>{go('lab');$('practiceBtn').click();};
  $('baseCm').parentNode.firstChild.textContent='游戏转一圈所需距离（cm / 360°）';$('baseCm').placeholder='例如测得40厘米就填40；不是填1600';
  const sub=$('setup').querySelector('.sub');sub.textContent='不用像机械导轨一样笔直。理解转圈距离后，再用端点净位移校准网页输入。';
  const calCard=$('calibrateBtn').closest('.card');calCard.querySelector('h3').textContent='浏览器尺子校准 · 允许轻微斜移';
  calCard.querySelector('p').textContent='两条平行标记相距10cm。记录指定方向的净位移，允许小抖动和回调；保持鼠标朝向基本不变，不抬起回中。左右量左右间距，前后量前后间距。';
  if(!data.calibration&&!validDraft(data.calibrationDraft))$('calSummary').textContent='保留12条快慢、左右、前后测量，但不再检查轨迹必须笔直。错误只重测对应条目；Esc暂停后，已完成记录保留。';
  const rail=document.querySelector('.railfoot');if(rail)rail.innerHTML=rail.innerHTML.replace(/v1\.0\.[01](?: · 教程版)?/g,'v1.2.0 · 深度灵敏度比较');
  const guide=$('guide');if(guide){
   const intro=box.cloneNode(true);intro.removeAttribute('id');intro.querySelector('button').remove();guide.insertBefore(intro,guide.querySelector('.split'));intro.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));
   const n=[...guide.querySelectorAll('h3 .number')].find(e=>e.textContent==='04');
   if(n)n.closest('.card').innerHTML='<h3><span class="number">04</span>容错校准：看起点和终点，不追求完美直线</h3><p>先固定窗口/全屏模式。在桌面放两条相隔10cm的平行标记，左右与前后分别准备。保持鼠标朝向基本不变，尺子尽量与鼠标自身方向对齐。允许轻微斜移、手抖和小幅回调。</p><p><strong>对齐起点 → 空格开始 → 滑到终点并停稳 → 空格结束。</strong>结束之后再挪到下一条起点。不要把鼠标抬起来回中，也不要扭转鼠标。不是要求鼠标沿一根细线滑动。</p><p>保留12条记录用于比较两轴和快慢输入。快慢按自己自然的动作区分，不用用力甩。程序用指定方向第一到最后一次移动之间的耗时，垂直方向微抖和按键等待不延长耗时。慢速可约2秒、快速约0.5–1秒，仅为操作示例。</p><p><strong>失败不整组清零：</strong>无输入或方向明显错误只重做本条；总体差异大时，报告会列出全部记录和原因，可以点“只重测此条”。不要反复挑选通过的数值；全部历史尝试保留在JSON中。</p><p><strong>Esc暂停：</strong>保留已完成记录；同一浏览器、网址、DPI、标记距离和窗口下点击校准可继续。DPI、设备或输入路径改变时需重新采样；仅窗口大小改变会暂停当前任务。微抖不再作为失败理由，但端点距离、朝向和原始输入仍需认真核对。</p>';
  }
  const p=document.createElement('div');p.className='notice';p.innerHTML='<strong>v1.0.2 校准修正：</strong>指定方向净位移除以两条平行线的间距。累计横向抖动和路径曲折度只作诊断，不再判失败；快慢耗时由移动事件估计。仍检查重复性与速度相关差异。<a href="https://www.w3.org/TR/pointerlock/" target="_blank" rel="noopener">W3C 相对移动定义</a> / <a href="https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/movementX" target="_blank" rel="noopener">MDN 输入单位限制</a>。本方法是工程实现，尚未经独立硬件实验验证。';$('methods').append(p);
  render();
 }
 document.addEventListener('DOMContentLoaded',initHelp,{once:true});
})();
singleApp=SensSessionApp.create({getData:()=>data,save,calibrationStatus,getEnv:env,inputCompatible,inputChanges,getRawMode:()=>rawMode,getArena:()=>arena,ctx,stage,openStage,closeStage,modal,hideModal,toast,
 requestLock:()=>{lockIntent={kind:'single'};return acquire();},releaseLock:unlock,drawScene,actualHFov,M,go,fmt,pct,esc,uid,exportJSON,exportCSV,exportSessionReport,
 adoptCm:(cm,dpi)=>{$('convertCm').value=cm;$('convertDpi').value=dpi;go('convert');}
});
const renderLegacyLab=renderLab;renderLab=function(){renderLegacyLab();singleApp.renderLab();};
const renderLegacyResults=renderResults;renderResults=function(){renderLegacyResults();singleApp.renderResults();};
$('fieldEffort').innerHTML=ratingOptions();fillSettings();render();drawPreview();go('lab');
document.addEventListener('DOMContentLoaded',()=>{singleApp.renderLab();singleApp.renderResults();},{once:true});

})();
