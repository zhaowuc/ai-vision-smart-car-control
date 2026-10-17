/* SensLab Personal 1.0 — pure, dependency-free experimental math. */
(function(root){
'use strict';
const C={VERSION:'1.2.0', TASKS:['micro','switch','track','turn'],
 NAMES:{micro:'微调精度',switch:'目标切换',track:'连续跟枪',turn:'大角度转向'},
 rad:d=>d*Math.PI/180,deg:r=>r*180/Math.PI,
 clamp:(x,a,b)=>Math.min(b,Math.max(a,x)),
 mean:a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:NaN,
 median(a){return this.quantile(a,.5)},
 quantile(a,p){if(!a.length)return NaN;const b=[...a].sort((x,y)=>x-y),z=(b.length-1)*p,k=Math.floor(z);return b[k]+(b[Math.ceil(z)]-b[k])*(z-k)},
 cv(a){const m=this.mean(a);return a.length>1&&m>0?Math.sqrt(this.mean(a.map(x=>(x-m)**2)))/m:Infinity},
 rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}},
 shuffle(a,r){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a},
 candidates(base){if(!(base>=8&&base<=160))throw Error('基准须在8–160 cm/360内；这是软件支持范围，不是推荐范围。');return[.64,.8,1,1.25,1.5625].map((r,i)=>({id:'c'+i,cm:+(base*r).toFixed(3),baseline:i===2})).filter(x=>x.cm>=5&&x.cm<=250)},
 order(ids,seed,k){const a=this.shuffle(ids,this.rng(seed));const n=a.length,row=k%n;return Array.from({length:n},(_,i)=>a[(i+row)%n])},
 sensitivity(cm,dpi,yaw){if(![cm,dpi,yaw].every(x=>Number.isFinite(x)&&x>0))throw Error('距离、DPI和yaw必须大于零。');return 914.4/(cm*dpi*yaw)},
 cm360(s,dpi,yaw){return this.sensitivity(s,dpi,yaw)},
 mapping(samples,cm,dpi,refDpi){
 if(samples.length<2)throw Error('至少需要两个实测点。');
 const a=[...samples].sort((a,b)=>a.s-b.s);
 if(!a.every(x=>x.s>=0&&x.cm>0&&Number.isFinite(x.s)&&Number.isFinite(x.cm)))throw Error('实测数值无效。');
 for(let i=1;i<a.length;i++)if(a[i].s<=a[i-1].s||a[i].cm>=a[i-1].cm)throw Error('灵敏度升高时，cm/360必须递减，且设置值不能重复。');
 const gain=360/cm*refDpi/dpi;
 for(let i=0;i<a.length-1;i++){const lo=360/a[i].cm,hi=360/a[i+1].cm;if(gain>=lo-1e-10&&gain<=hi+1e-10)return a[i].s+(a[i+1].s-a[i].s)*(gain-lo)/(hi-lo)}
 throw Error('目标超出实测范围；请补充覆盖目标的测量点，不进行外推。')},
 focalCm(cm,hip,ads,p){if(!(cm>0&&hip>1&&hip<179&&ads>1&&ads<179&&p>=0&&p<=1))throw Error('请填写有效FOV和匹配位置。');const h=Math.tan(this.rad(hip)/2),a=Math.tan(this.rad(ads)/2);return cm*(p===0?h/a:Math.atan(p*h)/Math.atan(p*a))},
 vec(y,p){return[Math.sin(y)*Math.cos(p),Math.sin(p),Math.cos(y)*Math.cos(p)]},
 dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
 angle(a,b){return Math.acos(this.clamp(this.dot(a,b),-1,1))},
 basis(y,p){return{f:this.vec(y,p),r:[Math.cos(y),0,-Math.sin(y)],u:[-Math.sin(y)*Math.sin(p),Math.cos(p),-Math.cos(y)*Math.sin(p)]}},
 relative(y,p,a,phi){const b=this.basis(y,p);return b.f.map((v,i)=>v*Math.cos(a)+(b.r[i]*Math.cos(phi)+b.u[i]*Math.sin(phi))*Math.sin(a))},
 calibration(rows){
 const x=rows.filter(r=>r.axis==='x'),y=rows.filter(r=>r.axis==='y');
 const ux=this.median(x.map(r=>r.units/r.cm)),uy=this.median(y.map(r=>r.units/r.cm));
 const cv=Math.max(this.cv(x.map(r=>r.units/r.cm)),this.cv(y.map(r=>r.units/r.cm)));
 const ratio=axis=>{const slow=this.median(rows.filter(r=>r.axis===axis&&r.speed==='slow').map(r=>r.units/r.cm));const fast=this.median(rows.filter(r=>r.axis===axis&&r.speed==='fast').map(r=>r.units/r.cm));return Math.abs(fast/slow-1)};
 const speedError=Math.max(ratio('x'),ratio('y'));
 const speedContrast=Math.min(...['x','y'].map(axis=>this.median(rows.filter(r=>r.axis===axis&&r.speed==='slow').map(r=>r.ms/r.cm))/this.median(rows.filter(r=>r.axis===axis&&r.speed==='fast').map(r=>r.ms/r.cm))));
 const pathGood=rows.every(r=>r.path>0&&r.units/r.path>=.97&&r.cross/r.units<.1&&r.units>50&&r.ms>60);
 const ok=x.length===8&&y.length===4&&cv<=.05&&speedError<=.05&&speedContrast>=1.5&&pathGood;
 return{ux,uy,cv,speedError,speedContrast,pathGood,ok};
 },
 /* Bootstrap the day-level paired log ratios, never the individual shots. */
 bootstrap(logRatios,alpha=.05,reps=4000,seed=1731){if(logRatios.length<3)return null;const r=this.rng(seed),out=[];for(let k=0;k<reps;k++){let s=0;for(let j=0;j<logRatios.length;j++)s+=logRatios[Math.floor(r()*logRatios.length)];out.push(Math.exp(s/logRatios.length)-1)}return[this.quantile(out,alpha/2),this.quantile(out,1-alpha/2)]},
 /* Only complete sessions from the specified phase enter selection. */
 analyze(study,phase){
 const candidates=phase==='confirm'?study.finalists:study.candidates;if(!candidates)return{rows:[],days:0,sessions:0};
 const ids=candidates.map(x=>x.id),base=study.candidates.find(x=>x.baseline).id;
 const sessions=study.sessions.filter(s=>s.phase===phase&&s.complete&&(phase!=='confirm'||!study.lockedAt||s.started>=study.lockedAt)&&ids.every(id=>s.blocks[id]&&this.TASKS.every(t=>s.blocks[id][t]?.valid)&&s.ratings[id]));
 const days=[...new Set(sessions.map(s=>s.day))].sort();
 const weights=study.config.weights,multiplicity=Math.max(1,ids.length-1);
 const rows=candidates.map(c=>{
 let scores=[],vectors=[],accuracies=[],efforts=[],pains=0,usableDays=0;
 for(const day of days){const ss=sessions.filter(s=>s.day===day);let logs=[],tv=[],av=[];
 for(const s of ss){const b=s.blocks[base],v=s.blocks[c.id];
 if(this.TASKS.some(t=>!(b[t].score>0&&Number.isFinite(v[t].score))))continue;
 const ratios=this.TASKS.map(t=>v[t].score/b[t].score);
 // A zero target result receives a tiny computational floor; explicitly flagged in UI.
 logs.push(ratios.reduce((z,x,i)=>z+weights[i]*Math.log(Math.max(1e-8,x)),0));tv.push(ratios);av.push(v.micro.accuracy-b.micro.accuracy);
 }
 if(logs.length){scores.push(this.mean(logs));vectors.push(this.TASKS.map((_,i)=>this.mean(tv.map(x=>x[i]))));accuracies.push(this.mean(av));usableDays++}
 const rr=ss.map(s=>s.ratings[c.id]);efforts.push(this.mean(rr.map(x=>x.effort)));pains+=rr.filter(x=>x.pain).length;
 }
 pains=study.sessions.filter(ss=>ss.phase===phase&&ss.ratings[c.id]?.pain).length;
 const relative=scores.length?Math.exp(this.mean(scores)):null;
 const taskRatios=this.TASKS.map((_,i)=>this.mean(vectors.map(v=>v[i])));
 const effort=this.mean(efforts),accDiff=this.mean(accuracies);
 const gates=pains===0&&effort<=study.config.maxEffort&&accDiff>=-study.config.accDrop&&taskRatios.every(x=>x>=1-study.config.taskDrop);
 return{...c,relative,taskRatios,effort,pains,accDiff,days:usableDays,gates,ci:c.baseline?[0,0]:this.bootstrap(scores,.05/multiplicity),logs:scores};
 });
 const ranked=rows.filter(r=>r.gates&&r.relative!==null).sort((a,b)=>b.relative-a.relative);
 const leader=ranked[0]||null,near=leader?ranked.filter(r=>r.relative>=leader.relative*(1-study.config.margin)):[];
 // Prefer continuity, then comfort, among practically near leaders (not equivalence proof).
 const anchor=near.slice().sort((a,b)=>Math.abs(Math.log(a.cm/study.config.baseCm))-Math.abs(Math.log(b.cm/study.config.baseCm))||a.effort-b.effort)[0]||null;
 return{rows,days:days.length,sessions:sessions.length,leader,near,anchor,confidence:100*(1-.05/multiplicity)};
 }
};
root.SensMath=C;if(typeof module!=='undefined'&&module.exports)module.exports=C;
})(typeof globalThis!=='undefined'?globalThis:window);
