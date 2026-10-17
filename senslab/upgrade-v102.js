/* SensLab Personal 1.0.2. Reproducible source upgrade, no network or player data.
   Retains legacy calibration validation. New calibration uses signed axis net
   displacement between parallel lines, NOT accumulated perpendicular travel.
   Numerical thresholds below are engineering checks, not scientific constants. */
(function(root){
'use strict';
function core(M){
 const legacy=M.calibration;
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
   return{axis,cv:this.cv(a.map(gain)),speedError:Math.abs(this.median(fast.map(gain))/this.median(slow.map(gain))-1),speedContrast:this.median(slow.map(r=>r.ms/r.cm))/this.median(fast.map(r=>r.ms/r.cm))};
  });
  for(const g of groups){const n=g.axis==='x'?'横向':'纵向';if(g.cv>.05)issues.push(n+'重复测量差异超过5%，请检查端点距离；表中标出了偏离中位数较大的记录。');if(g.speedError>.05)issues.push(n+'快慢两组的单位/厘米相差超过5%。可能是端点、鼠标朝向或加速影响，不直接断定原因。');if(g.speedContrast<1.5)issues.push(n+'快慢速度还不够区分。选一条慢速或快速记录重测；不用重做全部。');}
  const cv=Math.max(...groups.map(g=>g.cv)),speedError=Math.max(...groups.map(g=>g.speedError)),speedContrast=Math.min(...groups.map(g=>g.speedContrast));
  return{method:'net-projection-v2',ux,uy,cv,speedError,speedContrast,pathGood:true,groups,issues,bad:[],ok:issues.length===0};
 };
}
function ui(){
 // Runs inside the original application's lexical scope after its handlers exist.
 const VERSION='net-projection-v2';
 function validDraft(d){return d&&d.method===VERSION&&Array.isArray(d.rows)&&d.rows.length===12&&d.rows.every(r=>r===null||!M.calibrationSample(r))&&d.env&&Number.isFinite(d.dpi)&&Number.isFinite(d.cm);}
 function draftFrom(c){return{method:VERSION,cm:c.cm,dpi:c.dpi,env:c.environment,rows:structuredClone(c.rows),attempts:(c.attempts||[]).slice(-200),updated:new Date().toISOString()};}
 function keep(c){data.calibrationDraft=draftFrom(c);save();}
 function label(i){const s=CAL_STEPS[i];return`${i+1}. ${s.axis==='x'?(s.dir>0?'向右':'向左'):(s.dir>0?'向后（靠近身体）':'向前（远离身体）')} / ${s.speed==='slow'?'慢速':'快速'}`;}
 const oldPractice=beginPractice;beginPractice=function(){stage.classList.remove('cal-v2-active');oldPractice();};
 const oldClose=closeStage;closeStage=function(){stage.classList.remove('cal-v2-active');oldClose();};
 function startCalibration(redoIndex){
  if(study())return toast('实验已锁定。请先导出备份并归档，再重新校准。',true);
  const cm=+$('calDistance').value,dpi=+$('dpi').value;
  if(!(cm>=5&&cm<=30&&dpi>=100&&dpi<=64000))return toast('请填5–30cm的标记间距和有效DPI。',true);
  const d=data.calibrationDraft,same=validDraft(d)&&d.cm===cm&&d.dpi===dpi&&sameEnv(d.env,env());
  if(d&&!same&&!confirm('标记间距、DPI或窗口已变化，旧草稿不能混入。本次将重新采样；已有实验记录保留。继续？'))return;
  const rows=same?structuredClone(d.rows):Array(12).fill(null),attempts=same?(d.attempts||[]).slice(-200):[];
  data.calibration=null;data.calibrationDraft={method:VERSION,cm,dpi,env:env(),rows,attempts};save();
  openStage();lockIntent={kind:'calibration',cm,dpi,environment:env(),rows,attempts,redoIndex:Number.isInteger(redoIndex)?redoIndex:null};
  const count=rows.filter(Boolean).length;
  modal(`<div class="eyebrow">容错校准 / v1.0.2</div><h2>量两条线的间距，不考验直线手法</h2><p>准备两条相距 <strong>${fmt(cm,1)} cm</strong> 的平行标记。左右移动时，量左右两线的间距；前后移动时，量前后两线的间距。保持鼠标朝向基本不变，尺子尽量沿鼠标本身的左右/前后方向放置。可在外壳贴一个参照点，起终点都看同一点，不必盯着底部传感器。</p><p><strong>允许轻微斜移、手抖和小幅回调。</strong>计算指定方向的净位移，不累计小抖动，不要求100%水平或垂直。仍要从正确起点到正确终点，不要抬鼠标回中或扭转鼠标。</p><p>对齐起点 → 空格开始 → 滑到终点并停稳 → 空格结束。${count?`已保留 ${count}/12 条记录。`:''}${Number.isInteger(redoIndex)?`这次只重测第 ${redoIndex+1} 条。`:''}快慢只需有区别，不用用力甩。</p><div class="row"><button class="primary" data-action="acquire">${count?'继续 / 重测指定记录':'锁定鼠标，开始校准'}</button><button data-action="closeStage">稍后继续</button></div>`);
 }
 $('calibrateBtn').onclick=()=>startCalibration();
 beginCalibration=function(){
  const rows=lockIntent.rows||Array(12).fill(null);const missing=rows.findIndex(r=>!r);
  calSession={...lockIntent,rows,index:Number.isInteger(lockIntent.redoIndex)?lockIntent.redoIndex:missing,active:false};run=null;stage.classList.add('cal-v2-active');
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
  if(!sameEnv(c.environment,env())){keep(c);calSession=null;unlock();modal('<h2>窗口已变化</h2><p>记录已保留。请恢复原窗口后继续，或在新环境重新采样。</p><button data-action="closeStage">返回</button>');return;}
  if(!c.active){c.active=true;c.started=performance.now();c.dx=0;c.dy=0;c.pathX=0;c.pathY=0;c.motionStart=null;c.motionEnd=null;c.motionEvents=0;calibrationDisplay();return;}
  c.active=false;const st=CAL_STEPS[c.index],row={...st,method:VERSION,cm:c.cm,dx:c.dx,dy:c.dy,units:Math.abs(st.axis==='x'?c.dx:c.dy),path:st.axis==='x'?c.pathX:c.pathY,cross:st.axis==='x'?c.pathY:c.pathX,ms:c.motionEvents>=2?c.motionEnd-c.motionStart:0,motionEvents:c.motionEvents,elapsedMs:performance.now()-c.started};
  const reason=M.calibrationSample(row);c.attempts=(c.attempts||[]).concat([{index:c.index,row,accepted:!reason,reason,time:new Date().toISOString()}]).slice(-200);
  if(reason){keep(c);calibrationDisplay(reason+' 其他记录不受影响。');return;}
  c.rows[c.index]=row;keep(c);c.index=c.rows.findIndex(r=>!r);
  if(c.index<0){finishCalibration(c);return;}calibrationDisplay('已记录。结束后才把鼠标放到下一条的起点；准备好按空格。');
 };
 finishCalibration=function(c){
  calSession=null;stage.classList.remove('cal-v2-active');
  calResult={...M.calibration(c.rows),rows:structuredClone(c.rows),attempts:(c.attempts||[]).slice(-200),env:c.environment,dpi:c.dpi,raw:rawMode,created:new Date().toISOString()};
  const ok=calResult.ok&&sameEnv(c.environment,env())&&rawMode==='requested';
  if(ok){data.calibration=calResult;data.calibrationDraft=null;save();}else keep(c);
  unlock();
  const problems=calResult.issues||[];
  modal(`<div class="eyebrow">输入测量报告 / 净位移法</div><h2>${ok?'校准通过，已保存':'记录已保留，不用整组重来'}</h2><p>横向 ${fmt(calResult.ux,1)} / 纵向 ${fmt(calResult.uy,1)} 单位/cm。重复变异 ${pct(calResult.cv)}；快慢差异 ${pct(calResult.speedError)}；慢/快移动耗时比 ${fmt(calResult.speedContrast,2)}。</p>${problems.map(x=>`<p class="warn">${esc(x)}</p>`).join('')}${!ok&&!problems.length?'<p class="warn">环境或原始输入状态已变化，请返回检查。</p>':''}<p>${ok?'继续保持DPI、窗口和设备不变。':'点击对应行即可只重测这一条，其他记录保留。'} 只重测确有操作问题的记录，不要为了通过而筛选好看的数值。历史尝试会随JSON备份保存。</p><div class="tablewrap" style="max-height:310px;overflow:auto"><table><thead><tr><th>记录</th><th>单位/cm</th><th>偏离本轴中位数</th><th>移动耗时</th>${ok?'':'<th>重测</th>'}</tr></thead><tbody>${c.rows.map((r,i)=>{const v=Math.abs(r.axis==='x'?r.dx:r.dy)/r.cm,base=r.axis==='x'?calResult.ux:calResult.uy,dev=Math.abs(v/base-1);return`<tr><td>${label(i)}</td><td>${fmt(v,1)}</td><td class="${dev>.05?'warn':''}">${pct(dev)}</td><td>${fmt(r.ms/1000,2)}s</td>${ok?'':`<td><button data-cal-redo="${i}">只重测此条</button></td>`}</tr>`}).join('')}</tbody></table></div><p class="tiny">不累计垂直抖动，也不用运动轨迹总长度估算厘米。没有运动期间的按键等待不计入快慢速度。重复变异≤5%、快慢差异≤5%、速度区分≥1.5是工程检查线，不是绝对精度证明；不能自动识别所有抬鼠标或转动误差。</p><button class="primary" data-action="closeStage">${ok?'返回设置 / 开始实验':'先返回，稍后继续'}</button>`);render();
 };
 // Timestamp real movement events; keypress waiting no longer dilutes speed checks.
 document.addEventListener('mousemove',e=>{const c=calSession;if(!c?.active||document.pointerLockElement!==arena||!Number.isFinite(e.movementX)||!Number.isFinite(e.movementY)||(!e.movementX&&!e.movementY))return;const t=performance.now();if(c.motionStart===null)c.motionStart=t;c.motionEnd=t;c.motionEvents++;},true);
 // Capture prevents the old handler from removing all saved samples on Backspace.
 document.addEventListener('keydown',e=>{if(!calSession||!stage.classList.contains('open')||!['Space','Backspace'].includes(e.code))return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;const c=calSession;if(e.code==='Space'){calibrationSpace();return;}if(c.active)c.active=false;else c.index=Math.max(0,c.index-1);calibrationDisplay('重新对齐起点。下一条新记录会替换该条，旧尝试仍保存在备份里。');},true);
 document.addEventListener('click',e=>{const b=e.target.closest('[data-cal-redo]');if(b){e.preventDefault();startCalibration(Number(b.dataset.calRedo));}});
 const oldRender=render;render=function(){oldRender();const d=data.calibrationDraft;if(!data.calibration&&validDraft(d)){$('calSummary').textContent=`已保留 ${d.rows.filter(Boolean).length}/12 条。相同DPI、标记间距和窗口下，可继续或只重测有问题的记录。`;$('calibrateBtn').textContent='继续校准 / 查看问题记录 →';}else{$('calibrateBtn').textContent='开始容错校准 →';}};
 function initHelp(){
  const style=document.createElement('style');style.textContent='#modal:has([data-cal-redo]){width:min(880px,94vw);max-width:880px}.cal-v2-active #uxReticle,.cal-v2-active #uxCenterTag{display:none!important}.cm-explain{border:1px solid var(--line,#35404c);border-radius:14px;padding:20px;margin:18px 0;background:var(--panel,#151c24)}.cm-explain h3{margin-bottom:12px}.cm-comparison{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}.cm-comparison>div{flex:1;min-width:120px;padding:12px;border-radius:9px;background:rgba(150,170,160,.09)}.cm-explain small{display:block;line-height:1.8;color:var(--muted,#afbcc9)}';document.head.append(style);
  const box=document.createElement('div');box.className='cm-explain';box.id='cmMeaning';box.innerHTML='<h3>cm/360 是什么？就是“转一圈要推多远”。</h3><p><strong>游戏视角转一整圈，鼠标在桌面上平移的距离，单位是厘米。</strong>转的是游戏视角，不是拿鼠标在桌面上画圆。DPI 1600 单独不能说明这个距离，还要结合游戏内灵敏度。</p><div class="cm-comparison"><div><strong>20 cm/360</strong><small>推20厘米转一圈<br>相对更快</small></div><div><strong>40 cm/360</strong><small>推40厘米转一圈<br>转半圈需20厘米</small></div><div><strong>80 cm/360</strong><small>推80厘米转一圈<br>相对更慢</small></div></div><small>这些是解释单位的例子，不是给你的推荐值。数值越小，灵敏度越高。</small><p><strong>游戏转圈测量</strong>回答“当前游戏有多快”；<strong>浏览器尺子校准</strong>回答“网页收到多少输入等于桌面1厘米”。这是两个不同步骤，不要把两者混在一起。</p><button type="button" id="skipCmPractice">还没弄懂？先跳过，体验30秒练习（不计分）</button><p class="tiny">跳过只进入练习，使用示例初始值，不冒充你当前的灵敏度；正式对照实验仍需填写实测值。</p>';
  $('setup').insertBefore(box,$('setup').querySelector('.split'));
  $('skipCmPractice').onclick=()=>{go('lab');$('practiceBtn').click();};
  $('baseCm').parentNode.firstChild.textContent='游戏转一圈所需距离（cm / 360°）';$('baseCm').placeholder='例如测得40厘米就填40；不是填1600';
  const sub=$('setup').querySelector('.sub');sub.textContent='不用像机械导轨一样笔直。理解转圈距离后，再用端点净位移校准网页输入。';
  const calCard=$('calibrateBtn').closest('.card');calCard.querySelector('h3').textContent='浏览器尺子校准 · 允许轻微斜移';
  calCard.querySelector('p').textContent='两条平行标记相距10cm。记录指定方向的净位移，允许小抖动和回调；保持鼠标朝向基本不变，不抬起回中。左右量左右间距，前后量前后间距。';
  if(!data.calibration&&!validDraft(data.calibrationDraft))$('calSummary').textContent='保留12条快慢、左右、前后测量，但不再检查轨迹必须笔直。错误只重测对应条目；Esc暂停后，已完成记录保留。';
  const rail=document.querySelector('.railfoot');if(rail)rail.innerHTML=rail.innerHTML.replace(/v1\.0\.[01](?: · 教程版)?/g,'v1.0.2 · 容错校准');
  const guide=$('guide');if(guide){
   const intro=box.cloneNode(true);intro.removeAttribute('id');intro.querySelector('button').remove();guide.insertBefore(intro,guide.querySelector('.split'));intro.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));
   const n=[...guide.querySelectorAll('h3 .number')].find(e=>e.textContent==='04');
   if(n)n.closest('.card').innerHTML='<h3><span class="number">04</span>容错校准：看起点和终点，不追求完美直线</h3><p>先固定窗口/全屏模式。在桌面放两条相隔10cm的平行标记，左右与前后分别准备。保持鼠标朝向基本不变，尺子尽量与鼠标自身方向对齐。允许轻微斜移、手抖和小幅回调。</p><p><strong>对齐起点 → 空格开始 → 滑到终点并停稳 → 空格结束。</strong>结束之后再挪到下一条起点。不要把鼠标抬起来回中，也不要扭转鼠标。不是要求鼠标沿一根细线滑动。</p><p>保留12条记录用于比较两轴和快慢输入。快慢按自己自然的动作区分，不用用力甩。程序只用第一到最后一次移动之间的耗时，开始前和结束后的等待不计入速度。</p><p><strong>失败不整组清零：</strong>无输入或方向明显错误只重做本条；总体差异大时，报告会列出全部记录和原因，可以点“只重测此条”。不要反复挑选通过的数值；全部历史尝试保留在JSON中。</p><p><strong>Esc暂停：</strong>保留已完成记录；同一浏览器、网址、DPI、标记距离和窗口下点击校准可继续。修改环境后要重新采样。微抖不再作为失败理由，但端点距离、朝向和原始输入仍需认真核对。</p>';
  }
  const p=document.createElement('div');p.className='notice';p.innerHTML='<strong>v1.0.2 校准修正：</strong>指定方向净位移除以两条平行线的间距。累计横向抖动和路径曲折度只作诊断，不再判失败；快慢耗时由移动事件估计。仍检查重复性与速度相关差异。<a href="https://www.w3.org/TR/pointerlock/" target="_blank" rel="noopener">W3C 相对移动定义</a> / <a href="https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/movementX" target="_blank" rel="noopener">MDN 输入单位限制</a>。本方法是工程实现，尚未经独立硬件实验验证。';$('methods').append(p);
  render();
 }
 document.addEventListener('DOMContentLoaded',initHelp,{once:true});
}
function patch(html){
 if(typeof html!=='string')throw Error('Expected complete HTML');
 if(html.includes('SENSLAB_V102_APPLIED'))throw Error('Version 1.0.2 already applied');
 function once(needle,value){if(html.split(needle).length!==2)throw Error('Base source mismatch: '+needle.slice(0,60));html=html.replace(needle,()=>value);}
 once('function validateBackup(d){','/* SENSLAB_V102_APPLIED */\n('+core.toString()+')(M);\nfunction validateBackup(d){');
 once("$('fieldEffort').innerHTML=ratingOptions();fillSettings();render();drawPreview();",'('+ui.toString()+")();\n$('fieldEffort').innerHTML=ratingOptions();fillSettings();render();drawPreview();");
 html=html.replace('当前12次校准未保存；已保存的其他数据不受影响。','当前正在移动的一条未保存；已完成的记录已保留，同一环境可继续。');
 html=html.replace('请在最终窗口大小下重新进行尺子校准。','记录已保留。恢复原窗口可继续；换新窗口应重新采样。');
 return html;
}
const api={version:'1.0.2',core,patch};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SensLabUpgradeV102=api;
})(typeof globalThis!=='undefined'?globalThis:this);
