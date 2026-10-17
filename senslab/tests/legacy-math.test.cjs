'use strict';
// Regression checks for the legacy core actually retained from the supplied v1.0.2 HTML.
const test=require('node:test');const assert=require('node:assert/strict');const M=require('../src/core.js');
function near(a,b,e=1e-8){assert.ok(Math.abs(a-b)<e,`${a} != ${b}`)}
const config={dpi:1600,baseCm:40,weights:[.25,.25,.25,.25],maxEffort:5,accDrop:.05,taskDrop:.1,margin:.03};
function study(days=6,factors=[1,1.04,1,1.12,.92]){const s={id:'test-only',config:{...config},candidates:M.candidates(40),sessions:[]};s.finalists=[s.candidates[2],s.candidates[1],s.candidates[3]];for(let day=0;day<days;day++){const ss={id:'s'+day,phase:'confirm',day:`2026-10-${String(day+1).padStart(2,'0')}`,complete:true,blocks:{},ratings:{}};s.candidates.forEach((c,i)=>{ss.blocks[c.id]={};M.TASKS.forEach(t=>ss.blocks[c.id][t]={valid:true,score:factors[i]*(1+day*.04),accuracy:.9});ss.ratings[c.id]={effort:3,pain:false}});s.sessions.push(ss)}return s}
function rows(){const r=[];for(let i=0;i<8;i++)r.push({axis:'x',speed:i%4<2?'slow':'fast',cm:10,units:6300,path:6300,cross:5,ms:i%4<2?1000:300});for(let i=0;i<4;i++)r.push({axis:'y',speed:i<2?'slow':'fast',cm:10,units:6200,path:6200,cross:5,ms:i<2?1000:300});return r}
test('physical angular conversion inverse',()=>{for(const dpi of[400,800,1600,3200])for(const cm of[8,25,40,100])near(M.cm360(M.sensitivity(cm,dpi,.022),dpi,.022),cm)});
test('specific Source scale',()=>near(M.sensitivity(40,1600,.022),.6494318181818182));
test('DPI changes preserve physical sensitivity',()=>near(M.sensitivity(40,800,.022),2*M.sensitivity(40,1600,.022)));
test('invalid numbers rejected',()=>{for(const v of[0,-1,NaN,Infinity])assert.throws(()=>M.sensitivity(v,1600,.022))});
test('logarithmic candidates include original',()=>{const a=M.candidates(40);assert.equal(a.length,5);assert.equal(a.find(c=>c.baseline).cm,40);near(a[0].cm,25.6)});
test('Latin positions balanced over full cycle',()=>{const ids=['a','b','c','d','e'],all=ids.map((_,i)=>M.order(ids,122,i));for(let p=0;p<5;p++)assert.equal(new Set(all.map(x=>x[p])).size,5)});
test('randomized order is reproducible',()=>assert.deepEqual(M.order(['a','b','c'],2321,1),M.order(['a','b','c'],2321,1)));
test('spherical target angle invariant to camera',()=>{for(const y of[-3,-1,0,1,3])for(const p of[-1,0,1])for(const deg of[2,45,120,160])near(M.deg(M.angle(M.vec(y,p),M.relative(y,p,M.rad(deg),.8))),deg,1e-7)});
test('camera basis is orthonormal',()=>{const b=M.basis(.8,.5);near(M.dot(b.r,b.u),0);near(M.dot(b.r,b.f),0);near(M.dot(b.u,b.f),0);near(M.dot(b.f,b.f),1)});
test('physical calibration passes consistent two-axis measures',()=>{const c=M.calibration(rows());assert.ok(c.ok);near(c.ux,630);near(c.uy,620)});
test('calibration rejects speed-dependent input',()=>{const r=rows();r.filter(x=>x.speed==='fast').forEach(x=>{x.units*=1.1;x.path=x.units});assert.equal(M.calibration(r).ok,false)});
test('calibration rejects fast/slow not distinguished',()=>{const r=rows();r.forEach(x=>x.ms=1000);assert.equal(M.calibration(r).ok,false)});
test('calibration rejects insufficient sampling',()=>assert.equal(M.calibration(rows().slice(1)).ok,false));
test('calibration rejects backtracking',()=>{const r=rows();r[0].path*=1.5;assert.equal(M.calibration(r).ok,false)});
test('custom game mapping linear angular gain',()=>near(M.mapping([{s:.5,cm:80},{s:1,cm:40},{s:2,cm:20}],32,1600,1600),1.25));
test('custom mapping respects reference DPI',()=>near(M.mapping([{s:.5,cm:80},{s:1,cm:40},{s:2,cm:20}],40,800,1600),2));
test('mapping rejects extrapolation',()=>assert.throws(()=>M.mapping([{s:.5,cm:80},{s:1,cm:40},{s:2,cm:20}],10,1600,1600)));
test('mapping rejects nonmonotonic or duplicate points',()=>{assert.throws(()=>M.mapping([{s:1,cm:40},{s:2,cm:50}],40,1600,1600));assert.throws(()=>M.mapping([{s:1,cm:40},{s:1,cm:20}],40,1600,1600))});
test('ADS centre FOV geometry',()=>near(M.focalCm(40,100,50,0),40*Math.tan(M.rad(50))/Math.tan(M.rad(25))));
test('ADS edge geometry',()=>near(M.focalCm(40,100,50,1),80));
test('identical FOV requires no ADS distance change',()=>{for(const p of[0,.5,1])near(M.focalCm(40,100,100,p),40)});
test('bootstrap constant paired effect',()=>{const r=M.bootstrap(Array(6).fill(Math.log(1.1)));near(r[0],.1);near(r[1],.1)});
test('bootstrap not offered for two days',()=>assert.equal(M.bootstrap([0,.1]),null));
test('aggregate score based on paired day ratios',()=>{const a=M.analyze(study(),'confirm');assert.equal(a.days,6);near(a.rows.find(x=>x.id==='c3').relative,1.12);assert.equal(a.leader.id,'c3')});
test('incomplete sessions never drive selection',()=>{const s=study();s.sessions[0].complete=false;assert.equal(M.analyze(s,'confirm').days,5)});
test('missing one task excludes entire session',()=>{const s=study();delete s.sessions[0].blocks.c1.track;assert.equal(M.analyze(s,'confirm').days,5)});
test('invalid block excludes entire session',()=>{const s=study();s.sessions[0].blocks.c1.track.valid=false;assert.equal(M.analyze(s,'confirm').days,5)});
test('same-day repeats do not become extra independent days',()=>{const s=study(3);s.sessions.push(structuredClone(s.sessions[0]));const a=M.analyze(s,'confirm');assert.equal(a.sessions,4);assert.equal(a.days,3);assert.equal(a.rows[0].days,3)});
test('exploration data excluded from confirmation',()=>{const s=study();s.sessions[0].phase='explore';assert.equal(M.analyze(s,'confirm').sessions,5)});
test('pain prevents recommendation',()=>{const s=study();s.sessions[0].ratings.c3.pain=true;const a=M.analyze(s,'confirm');assert.equal(a.rows.find(x=>x.id==='c3').gates,false);assert.notEqual(a.leader.id,'c3')});
test('high effort prevents recommendation',()=>{const s=study();s.sessions.forEach(x=>x.ratings.c3.effort=7);assert.equal(M.analyze(s,'confirm').rows.find(x=>x.id==='c3').gates,false)});
test('micro accuracy loss prevents recommendation',()=>{const s=study();s.sessions.forEach(x=>x.blocks.c3.micro.accuracy=.5);assert.equal(M.analyze(s,'confirm').rows.find(x=>x.id==='c3').gates,false)});
test('weak task cannot be hidden by large scores elsewhere',()=>{const s=study();s.sessions.forEach(x=>x.blocks.c3.track.score=.1);assert.equal(M.analyze(s,'confirm').rows.find(x=>x.id==='c3').gates,false)});
test('zero baseline task is not divided into spurious certainty',()=>{const s=study();s.sessions.forEach(x=>x.blocks.c2.track.score=0);const a=M.analyze(s,'confirm');assert.equal(a.leader,null);assert.equal(a.rows[0].relative,null)});
test('near tie prefers baseline continuity',()=>{const s=study(6,[1,1.01,1,1.02,.92]);const a=M.analyze(s,'confirm');assert.equal(a.anchor.id,'c2')});
