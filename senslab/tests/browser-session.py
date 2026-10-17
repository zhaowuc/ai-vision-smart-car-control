"""Isolated real-browser DOM integration checks against current src/index.html.

Storage/calibration/score fixtures are SYNTHETIC TEST DATA. A separate context
simulates Pointer Lock solely to check runtime DOM/reticle rendering; no hardware
Pointer Lock is requested, no real mouse measurement is performed, and no user
profile is opened. Run separately from loader/packaging tests after source edits.
"""
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import copy
import csv
import io
import json
import os
import traceback
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
ARTIFACTS = ROOT / 'tests' / 'artifacts'
KEY = 'senslab.personal.v1'
BACKUP = KEY + '.pre-single-v1'
DEEP_BACKUP = KEY + '.pre-deep-v2'
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'


@contextmanager
def local_server():
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(REPO), **kwargs)

        def do_GET(self):
            if self.path == '/favicon.ico':
                self.send_response(204)
                self.end_headers()
                return
            super().do_GET()

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_address[1]}/senslab/src/index.html'
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def storage(page, key=KEY):
    return page.evaluate('(key)=>localStorage.getItem(key)', key)


def workspace(page):
    raw = storage(page)
    return json.loads(raw) if raw else None


def screenshot(page, name):
    # Finish CSS entry animations so a screenshot does not freeze a page at
    # partial opacity. This does not advance the JavaScript experiment clock.
    page.screenshot(path=str(ARTIFACTS / name), full_page=True, animations='disabled')


def imported(page, data):
    page.locator('#importFile').set_input_files({
        'name': 'synthetic-test-only.json', 'mimeType': 'application/json',
        'buffer': json.dumps(data, ensure_ascii=False).encode('utf-8'),
    })


def download_text(page, selector):
    with page.expect_download() as result:
        page.locator(selector).click()
    return Path(result.value.path()).read_text(encoding='utf-8-sig')


def click_mode(page, mode):
    """Use the visible mode button, opening an optional short-mode details UI."""
    action = {'120min': 'start120', '20min': 'start20', '10min': 'start10'}[mode]
    button = page.locator(f'#singleLabRoot [data-single-action="{action}"]')
    ancestors = button.locator('xpath=ancestor::details')
    for index in range(ancestors.count()):
        details = ancestors.nth(index)
        if not details.evaluate('(element)=>element.open'):
            details.locator(':scope > summary').click()
    button.click()


LEGACY_FIXTURE = r"""() => {
 const M=SensMath,rows=[];
 const steps=[...Array.from({length:2},()=>[['x',1,'slow'],['x',-1,'slow'],['x',1,'fast'],['x',-1,'fast']]).flat(),['y',1,'slow'],['y',-1,'slow'],['y',1,'fast'],['y',-1,'fast']];
 for(const [axis,dir,speed] of steps){const primary=dir*6300;rows.push({method:'net-projection-v2',axis,dir,speed,cm:10,dx:axis==='x'?primary:20,dy:axis==='y'?primary:20,units:6300,path:6340,cross:20,ms:speed==='slow'?1200:400,motionEvents:50,axisMotionEvents:50,timingMethod:'primary-axis-v1',elapsedMs:speed==='slow'?1400:600});}
 const config={dpi:1600,baseCm:82.3,fov:103,fovType:'horizontal',swipe:23,swipeEstimated:false,environment:'SYNTHETIC TEST ONLY saved environment',weights:[.3,.2,.3,.2],margin:.04,taskDrop:.12,accDrop:.04,maxEffort:4};
 const env={ua:navigator.userAgent,dpr:devicePixelRatio,w:800,h:600,sw:1024,sh:768};
 const cal={...M.calibration(rows),rows,env,dpi:1600,raw:'requested',deviceNotes:config.environment,created:'2026-10-01T00:00:00Z'};
 if(!cal.ok)throw Error('Test calibration fixture did not pass software validation');
 const candidates=M.candidates(config.baseCm),ss={id:'LEGACY-SESSION-TEST',phase:'explore',day:'2026-10-16',started:'2026-10-16T01:00:00Z',order:candidates.map(c=>c.id),taskOrder:M.TASKS.slice(),seed:321,complete:true,warmed:{},blocks:{},ratings:{}};
 for(const c of candidates){ss.warmed[c.id]=true;ss.blocks[c.id]={};ss.ratings[c.id]={effort:3,pain:false,lifts:0};for(const t of M.TASKS)ss.blocks[c.id][t]={valid:true,task:t,score:t==='track'?.65:1,duration:12000,accuracy:.8,hits:12,shots:15,timeouts:0,meanAcquireMs:600,rmsDeg:t==='track'?1:null,frameFps:120,frameP95:9,trials:[],trace:[],raw:'requested'};}
 const old={id:'LEGACY-STUDY-TEST',config,cal,seed:123,candidates,sessions:[ss],finalists:null,invalid:[],archived:false,created:'2026-10-01T00:00:00Z'};
 return {schema:'senslab-personal/1',settings:config,calibration:cal,calibrationDraft:null,studies:[old],active:old.id,mappings:[{id:'TEST-MAP',name:'SYNTHETIC TEST ONLY map',dpi:1600,samples:[{s:.5,cm:80},{s:1,cm:40},{s:2,cm:20}]}],field:[{study:old.id,candidate:candidates.find(c=>c.baseline).id,mode:'烽火地带',day:'2026-10-16',effort:3,minutes:20,notes:'SYNTHETIC TEST ONLY field record',limited:1,overshoot:2,pain:false}]};
}"""

COMPLETE_FIXTURE = r"""({original,mode}) => {
 const S=SensSession,base=original.settings.baseCm,now=Date.now(),created=new Date(now-(mode==='20min'?1200:600)*1000).toISOString();
 const s=S.createStudy({mode,config:original.settings,calibration:original.calibration,seed:424242,id:'SYNTHETIC-COMPLETE-'+mode,now:created,provenance:{testOnly:true,description:'Synthetic metrics for DOM/report validation; not player evidence'}});
 function fill(g){const c=s.candidates.find(c=>c.id===g.candidateId),factor=c.cm/base,best=Math.abs(factor-.8)<.00001,hits=c.baseline?12:best?15:factor>1&&factor<1.3?13:10,accuracy=hits/(hits+3),track=c.baseline?.65:best?.75:factor>1&&factor<1.3?.68:.60;
 const tasks={};for(const t of S.TASKS)tasks[t]={valid:true,task:t,duration:12000,score:t==='track'?track:hits/12,accuracy:t==='track'?track:accuracy,hits:t==='track'?0:hits,shots:t==='track'?0:hits+3,timeouts:0,meanAcquireMs:t==='track'?null:600,rmsDeg:t==='track'?1:null,pathCm:60,frameFps:120,frameP95:9,raw:'requested',trials:[],trace:[],testOnly:true};
 s.results[g.id]={tasks,rating:{effort:3,pain:false},completedAt:new Date(now-1000).toISOString()};}
 s.groups.forEach(fill);S.freezeRetest(s,new Date(now-500).toISOString());s.groups.filter(g=>g.stage==='retest').forEach(fill);
 s.status='complete';s.completedAt=new Date(now).toISOString();s.runtime={phase:'done',groupIndex:s.groups.length,taskIndex:0,elapsed:0,extraAdapt:0,paused:true,engaged:false,createdWall:Date.parse(created),lastActiveAt:now};
 s.timing={plannedElapsedMs:s.plannedSeconds*1000,activeMs:s.plannedSeconds*1000,extraAdaptMs:0,ratingExtraMs:0,pauseMs:0,faultMs:0,waitMs:0};s.inputCheck={events:120,dx:6000,dy:4000};s.segments=[{startedAt:created,reason:'SYNTHETIC TEST ONLY complete report fixture'}];S.validateStudy(s);
 return {...structuredClone(original),storageVersion:2,singleStudies:[s],singleActive:s.id};
}"""

DEEP_COMPLETE_FIXTURE = r"""({original,eligible=2}) => {
 const S=SensSession,base=original.settings.baseCm,now=Date.now(),created=new Date(now-6300000).toISOString();
 const s=S.createStudy({mode:'120min',config:original.settings,calibration:original.calibration,seed:454545,id:'SYNTHETIC-DEEP-'+eligible,now:created,provenance:{testOnly:true,description:'Synthetic complete report for DOM validation; not real player evidence'}});
 function fill(g){const c=s.candidates.find(c=>c.id===g.candidateId),factor=c.cm/base,best=Math.abs(factor-.8)<.00001,second=factor>1&&factor<1.3,qualified=c.baseline||(eligible>=1&&best)||(eligible>=2&&second),scale=g.taskSeconds/12,hits=Math.round((c.baseline?12:best?15:second?13:10)*scale),shots=hits+Math.round(3*scale),track=c.baseline?.65:best?.75:second?.68:.60,meta=S.recordMeta(s,g),duration=g.taskSeconds*1000;
 const tasks={};for(const t of S.TASKS)tasks[t]={...meta,valid:true,task:t,seed:g.seed,duration,actualDuration:duration,score:t==='track'?track:hits/g.taskSeconds,accuracy:t==='track'?track:hits/shots,hits:t==='track'?0:hits,shots:t==='track'?0:shots,timeouts:0,meanAcquireMs:t==='track'?null:600,rmsDeg:t==='track'?1:null,pathCm:60,frameFps:120,frameP95:9,raw:'requested',trials:[],trace:[],...(t==='track'?{coveredMs:duration*track,integratedMs:duration}:{}),testOnly:true};
 s.results[g.id]={...meta,tasks,rating:{...meta,effort:qualified?3:8,pain:false},completedAt:new Date(now-1000).toISOString()};}
 s.groups.forEach(fill);S.freezeRetest(s,{now:new Date(now-500).toISOString()});s.groups.filter(g=>g.stage==='retest').forEach(fill);
 s.status=s.retest.noComparison?'insufficient':'completed';s.completedAt=new Date(now).toISOString();s.runtime={phase:'done',groupIndex:s.groups.length,taskIndex:0,elapsed:0,extraAdapt:0,paused:false,engaged:false,createdWall:Date.parse(created),lastActiveAt:now};
 s.timing={plannedElapsedMs:s.measurementSeconds*1000,activeMs:s.measurementSeconds*1000,extraAdaptMs:0,ratingExtraMs:0,pauseMs:0,faultMs:0,waitMs:0,extraRestMs:0};s.inputCheck={events:120,dx:6000,dy:4000};s.segments=[{startedAt:created,reason:'SYNTHETIC TEST ONLY complete report fixture',sessionId:s.sessionId,sessionSegment:1}];s.interruptions=[{...S.recordMeta(s,s.groups[0]),runtimePhase:'adapt',type:'user',reason:'SYNTHETIC TEST ONLY adaptation pause',elapsed:4000,created:new Date(now-60000).toISOString()}];S.validateStudy(s);
 return {...structuredClone(original),storageVersion:3,singleStudies:[s],singleActive:s.id};
}"""

SIMULATED_LOCK = r"""(() => {
 let locked=null;window.__syntheticLockRequests=0;
 Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>locked});
 HTMLCanvasElement.prototype.requestPointerLock=function(options){
  window.__syntheticLockRequests++;window.__syntheticLockOptions=options;
  locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();
 };
 document.exitPointerLock=function(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));};
})();"""


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    report = {'syntheticFixtures': True, 'realMouseMeasured': False, 'hardwarePointerLockRequested': False, 'simulatedPointerLockTest': True, 'checks': [], 'pageErrors': [], 'consoleErrors': []}
    failures = []
    with local_server() as url, sync_playwright() as playwright:
        options = {'headless': True}
        executable = os.environ.get('CHROMIUM_EXECUTABLE_PATH')
        if executable:
            options['executable_path'] = str(Path(executable).expanduser())
        elif Path(EDGE).is_file():
            options['executable_path'] = EDGE
        browser = playwright.chromium.launch(**options)
        report['browserVersion'] = browser.version
        context = browser.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
        page = context.new_page()
        page.set_default_timeout(10000)
        page.on('dialog', lambda dialog: dialog.accept())
        page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
        page.on('console', lambda message: report['consoleErrors'].append(message.text) if message.type == 'error' else None)

        def check(name, action):
            try:
                action()
                report['checks'].append({'name': name, 'status': 'PASS'})
                print('PASS', name)
            except Exception as error:
                failures.append(name)
                report['checks'].append({'name': name, 'status': 'FAIL', 'error': str(error), 'traceback': traceback.format_exc()})
                try:
                    screenshot(page, f'failure-{len(failures)}.png')
                except Exception:
                    pass
                print('FAIL', name, str(error))

        page.goto(url, wait_until='load')
        page.wait_for_function('typeof SensSession === "object" && typeof SensSessionApp === "object"')

        def empty_workspace():
            assert page.locator('#lab').is_visible()
            assert page.locator('[data-single-action="start120"]').is_visible()
            assert page.locator('[data-single-action="start120"]').inner_text() == '开始深度实验'
            assert page.locator('[data-single-action="start20"]').count() == 1
            assert page.locator('[data-single-action="start10"]').count() == 1
            assert page.locator('#singleLabRoot details').count() >= 1
            assert all(not page.locator('#singleLabRoot details').nth(i).evaluate('(e)=>e.open') for i in range(page.locator('#singleLabRoot details').count()))
            assert page.locator('#baseCm').input_value() == '75.2'
            assert page.locator('#swipe').input_value() == '20'
            assert not page.locator('#baseVerified').is_checked()
            current = workspace(page)
            assert current is None or current.get('calibration') is None
            click_mode(page, '120min')
            assert not page.locator('#stage').is_visible()
            assert not (workspace(page) or {}).get('singleStudies')
            screenshot(page, 'empty-lab-1366x900.png')

        check('fresh workspace defaults to lab; historical fields remain unconfirmed and no calibration is fabricated', empty_workspace)
        original = page.evaluate(LEGACY_FIXTURE)
        original_raw = json.dumps(original, ensure_ascii=False, separators=(',', ':'))
        page.evaluate('([key,value])=>localStorage.setItem(key,value)', [KEY, original_raw])
        page.reload(wait_until='load')

        def migration():
            assert storage(page, BACKUP) == original_raw
            assert storage(page, DEEP_BACKUP) == original_raw
            migrated = workspace(page)
            assert migrated['storageVersion'] == 3
            for name in ('settings', 'calibration', 'studies', 'active', 'mappings', 'field'):
                assert migrated[name] == original[name], name
            assert migrated['singleStudies'] == []
            assert migrated['settings']['baseCm'] == 82.3
            assert page.locator('#baseCm').input_value() == '82.3'
            assert '可以进入正式实验' in page.locator('#singleLabRoot').inner_text()
            assert page.locator('#legacyLab').count() == 1
            assert not page.locator('#legacyLab').evaluate('(e)=>e.open')
            page.locator('#legacyLab > summary').click()
            assert page.locator('#labTitle').is_visible()
            page.locator('#legacyLab > summary').click()
            screenshot(page, 'saved-lab-1366x900.png')

        check('legacy migration backs up exact JSON and retains saved settings/calibration/history; viewport differences reuse calibration', migration)

        def start_new():
            click_mode(page, '20min')
            page.locator('[data-single-action="lock"]').wait_for(state='visible')
            assert '尺子' not in page.locator('#modal').inner_text()
            assert '系统箭头会隐藏' in page.locator('#modal').inner_text()
            current = workspace(page)
            assert len(current['singleStudies']) == 1
            single = current['singleStudies'][0]
            assert single['mode'] == '20min'
            assert single['protocolVersion'] == 'senslab-session/1'
            assert single['plannedSeconds'] == 1200
            assert single['configSnapshot'] == original['settings']
            assert single['calSnapshot'] == original['calibration']
            assert current['studies'] == original['studies']
            assert current['active'] == original['active']
            assert single['inputCheck']['events'] == 0
            assert not single['results']
            assert page.evaluate('document.pointerLockElement === null')
            screenshot(page, 'new-session-ready-1366x900.png')
            page.locator('[data-single-action="close"]').click()
            page.set_viewport_size({'width': 900, 'height': 800})
            assert page.locator('#lab').is_visible()
            assert page.locator('#singleLabRoot [data-single-action="resume"]').is_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            screenshot(page, 'saved-lab-900x800.png')
            page.set_viewport_size({'width': 1366, 'height': 900})

        check('active legacy study does not block new 20-minute study; saved calibration is reused before any lock request', start_new)

        # A synthetic task is imported solely to verify export/import structure.
        # It is never treated as player evidence or a successful physical trial.
        fixture = workspace(page)
        single = fixture['singleStudies'][0]
        group = single['groups'][0]
        single['results'][group['id']] = {'tasks': {'micro': {'valid': True, 'task': 'micro', 'score': 8/12, 'accuracy': .8, 'duration': 12000, 'hits': 8, 'shots': 10, 'timeouts': 0, 'meanAcquireMs': 500, 'frameFps': 120, 'frameP95': 9, 'raw': 'requested', 'trials': [], 'trace': [], 'testOnly': True}}}
        fixture['settings']['environment'] = original['settings']['environment']

        def import_export():
            before = storage(page)
            imported(page, fixture)
            page.wait_for_function('document.getElementById("toast").textContent.includes("备份已导入")')
            assert storage(page, KEY + '.pre-import') == before
            imported_data = workspace(page)
            assert imported_data['studies'] == original['studies']
            assert imported_data['singleStudies'][0]['results'] == single['results']
            exported = json.loads(download_text(page, '#exportBtn'))
            assert exported['schema'] == 'senslab-personal/1'
            assert exported['studies'] == original['studies']
            assert exported['singleStudies'][0]['protocolVersion'] == 'senslab-session/1'
            assert exported['singleStudies'][0]['mode'] == '20min'
            assert exported['singleStudies'][0]['results'] == single['results']
            page.locator('[data-view="results"]').click()
            page.locator('#legacyResults > summary').click()
            rows = list(csv.DictReader(io.StringIO(download_text(page, '#csvBtn'))))
            assert any(row['protocolVersion'] == 'legacy-multiday-v1' and row['mode'] == 'multiday' for row in rows)
            assert any(row['protocolVersion'] == 'senslab-session/1' and row['mode'] == '20min' for row in rows)
            assert all(None not in row for row in rows), 'CSV row/header field count differs'
            screenshot(page, 'two-protocol-results-1366x900.png')

        check('valid JSON import retains both protocols, creates pre-import backup, and JSON/CSV exports preserve protocol labels', import_export)

        def refresh_and_mode_guard():
            before = workspace(page)
            page.reload(wait_until='load')
            current = workspace(page)
            assert current['settings'] == before['settings']
            assert current['calibration'] == before['calibration']
            assert current['studies'] == before['studies']
            assert current['singleStudies'][0]['results'] == before['singleStudies'][0]['results']
            assert page.locator('#lab').is_visible()
            assert page.locator('#singleLabRoot [data-single-action="resume"]').is_visible()
            assert '可以进入正式实验' in page.locator('#singleLabRoot').inner_text()
            click_mode(page, '10min')
            assert len(workspace(page)['singleStudies']) == 1
            assert workspace(page)['singleStudies'][0]['mode'] == '20min'
            assert workspace(page)['singleStudies'][0]['results'] == before['singleStudies'][0]['results']
            page.locator('[data-view="field"]').click()
            assert page.locator('#fieldCandidate option').count() == 1
            assert '尚未结束' in page.locator('#fieldCoverage').inner_text()
            assert workspace(page)['field'] == before['field']
            page.locator('[data-view="lab"]').click()

        check('refresh retains completed task data and an unfinished study cannot be silently replaced by another mode', refresh_and_mode_guard)

        def quick_mode():
            quick_context = browser.new_context(viewport={'width': 900, 'height': 800})
            try:
                quick = quick_context.new_page()
                quick.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
                quick.on('console', lambda message: report['consoleErrors'].append(message.text) if message.type == 'error' else None)
                quick.goto(url, wait_until='load')
                quick.evaluate('([key,value])=>localStorage.setItem(key,value)', [KEY, original_raw])
                quick.reload(wait_until='load')
                click_mode(quick, '10min')
                quick.locator('[data-single-action="lock"]').wait_for(state='visible')
                quick_data = workspace(quick)
                assert len(quick_data['singleStudies']) == 1
                study = quick_data['singleStudies'][0]
                assert study['mode'] == '10min'
                assert study['plannedSeconds'] == 600
                assert len(study['candidates']) == 3
                assert study['configSnapshot'] == original['settings']
                assert quick_data['studies'] == original['studies']
                assert quick.evaluate('document.pointerLockElement === null')
                screenshot(quick, 'quick-session-ready-900x800.png')
            finally:
                quick_context.close()

        check('10-minute mode also reuses saved calibration and opens the input-check gate with its 600-second plan', quick_mode)

        def failed_migration_backup():
            for blocked_key in (BACKUP, DEEP_BACKUP):
                blocked_context = browser.new_context(viewport={'width': 1366, 'height': 900})
                try:
                    blocked = blocked_context.new_page()
                    blocked.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
                    blocked.goto(url, wait_until='load')
                    blocked.evaluate('([key,value])=>localStorage.setItem(key,value)', [KEY, original_raw])
                    # Fault injection exercises both migration writes; this is
                    # not a claim about native storage quota or permissions.
                    blocked.add_init_script('''(() => {
                        const original = Storage.prototype.setItem;
                        Storage.prototype.setItem = function(key, value) {
                            if(key === BLOCKED_KEY) throw new DOMException('TEST ONLY backup write fault', 'QuotaExceededError');
                            return original.call(this, key, value);
                        };
                    })();'''.replace('BLOCKED_KEY', json.dumps(blocked_key)))
                    blocked.reload(wait_until='load')
                    assert storage(blocked) == original_raw
                    assert storage(blocked, blocked_key) is None
                    assert blocked.locator('#storageWarning').is_visible()
                    click_mode(blocked, '120min')
                    assert storage(blocked) == original_raw
                    assert blocked.evaluate('document.pointerLockElement === null')
                finally:
                    blocked_context.close()

        check('simulated migration-backup write failure preserves the original stored workspace', failed_migration_backup)

        def invalid_import():
            before, prior_backup = storage(page), storage(page, KEY + '.pre-import')
            page.locator('#importFile').set_input_files({'name': 'bad.json', 'mimeType': 'application/json', 'buffer': b'{not valid json'})
            page.wait_for_function('document.getElementById("toast").textContent.includes("导入失败")')
            assert storage(page) == before
            assert storage(page, KEY + '.pre-import') == prior_backup
            bad = copy.deepcopy(workspace(page))
            bad['schema'] = 'unknown/99'
            imported(page, bad)
            page.wait_for_function('document.getElementById("importFile").value === ""')
            assert storage(page) == before
            assert storage(page, KEY + '.pre-import') == prior_backup
            candidates = workspace(page)['studies'][0]['candidates']
            baseline = next(candidate for candidate in candidates if candidate['baseline'])
            other = next(candidate for candidate in candidates if not candidate['baseline'])
            for finalists in ([baseline, baseline], [dict(other, baseline=True), dict(baseline, baseline=False)]):
                forged = copy.deepcopy(workspace(page))
                forged['studies'][0]['finalists'] = finalists
                imported(page, forged)
                page.wait_for_function('document.getElementById("importFile").value === ""')
                assert storage(page) == before, 'Forged legacy finalists replaced current workspace'
                assert storage(page, KEY + '.pre-import') == prior_backup

        check('malformed JSON, unsupported schema and forged/duplicate legacy finalists leave workspace and prior backup unchanged', invalid_import)

        def invalid_runtime():
            before = storage(page)
            bad = copy.deepcopy(workspace(page))
            del bad['singleStudies'][0]['runtime']
            imported(page, bad)
            page.wait_for_function('document.getElementById("importFile").value === ""')
            assert storage(page) == before, 'Import lacking runtime overwrote localStorage before reporting failure'
            assert '导入失败' in page.locator('#toast').inner_text()

        check('single-session import missing required runtime is rejected before any workspace replacement', invalid_runtime)

        def simulated_familiar_scene():
            scene_context = browser.new_context(viewport={'width': 1366, 'height': 900})
            try:
                scene_context.add_init_script(SIMULATED_LOCK)
                scene = scene_context.new_page()
                scene.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
                scene.on('console', lambda message: report['consoleErrors'].append(message.text) if message.type == 'error' else None)
                scene.goto(url, wait_until='load')
                scene.evaluate('([key,value])=>localStorage.setItem(key,value)', [KEY, original_raw])
                scene.reload(wait_until='load')
                click_mode(scene, '20min')
                scene.locator('[data-single-action="lock"]').click()
                scene.wait_for_function('document.getElementById("veil").classList.contains("hide") && !document.getElementById("uxReticle").classList.contains("hide")')
                assert scene.locator('#stage').is_visible()
                assert scene.locator('#uxReticle').is_visible()
                assert not scene.locator('#veil').is_visible()
                assert '熟悉' in scene.locator('#hudTitle').inner_text()
                assert scene.evaluate('window.__syntheticLockRequests') == 1
                assert scene.evaluate('window.__syntheticLockOptions.unadjustedMovement') is True
                current = workspace(scene)
                assert current['calibration'] == original['calibration']
                assert current['singleStudies'][0]['calSnapshot'] == original['calibration']
                assert current['singleStudies'][0]['runtime']['phase'] == 'familiar'
                assert not current['singleStudies'][0]['results']
                screenshot(scene, 'simulated-lock-familiar-stage-1366x900.png')
            finally:
                scene_context.close()

        check('SIMULATED Pointer Lock reaches the real familiarization DOM with visible centre reticle and hidden modal; no scored trial is fabricated', simulated_familiar_scene)

        def complete_report():
            results_context = browser.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
            try:
                results_page = results_context.new_page()
                results_page.on('dialog', lambda dialog: dialog.accept())
                results_page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
                results_page.on('console', lambda message: report['consoleErrors'].append(message.text) if message.type == 'error' else None)
                results_page.goto(url, wait_until='load')
                for mode, rounds in [('20min', 3), ('10min', 2)]:
                    completed = results_page.evaluate(COMPLETE_FIXTURE, {'original': original, 'mode': mode})
                    imported(results_page, completed)
                    results_page.wait_for_function('document.getElementById("toast").textContent.includes("备份已导入")')
                    results_page.locator('[data-view="results"]').click()
                    text = results_page.locator('#singleResultsRoot').inner_text()
                    assert f'已完成配对轮 {rounds}/{rounds}' in text
                    assert '1.250×（25.0%）' in text
                    for label in ['相对角增益', '微调', '切换', '跟枪', '转向', '方向一致性', '费力/疼痛']:
                        assert label in text, label
                    assert results_page.locator('#singleResultsRoot [data-single-action="adopt"]').is_visible()
                    assert results_page.locator('#singleResultsRoot [data-single-action="keep"]').is_visible()
                    assert not results_page.locator('#legacyResults').evaluate('(e)=>e.open')
                    assert results_page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    screenshot(results_page, f'complete-results-{mode}-1366x900.png')
                    results_page.locator('#singleResultsRoot [data-single-action="adopt"]').click()
                    assert results_page.locator('#convert').is_visible()
                    assert abs(float(results_page.locator('#convertCm').input_value()) - original['settings']['baseCm']*.8) < .000001
                    results_page.locator('[data-view="results"]').click()
                    results_page.locator('#singleResultsRoot [data-single-action="keep"]').click()
                    assert float(results_page.locator('#convertCm').input_value()) == original['settings']['baseCm']
                    assert workspace(results_page)['studies'] == original['studies']
                    assert workspace(results_page)['settings'] == original['settings']
            finally:
                results_context.close()

        check('SYNTHETIC complete 20/10-minute reports show 3/2 paired rounds, gain, four abilities, consistency and working adopt/keep actions', complete_report)

        def corrupted_workspace_protection():
            damaged_context = browser.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
            try:
                damaged = damaged_context.new_page()
                damaged.on('dialog', lambda dialog: dialog.accept())
                damaged.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
                damaged.on('console', lambda message: report['consoleErrors'].append(message.text) if message.type == 'error' else None)
                damaged.goto(url, wait_until='load')
                for raw in ('{"important":"SYNTHETIC damaged JSON bytes",', '{"schema":"unsupported/99","important":"SYNTHETIC recoverable original"}'):
                    damaged.evaluate('([key,value])=>localStorage.setItem(key,value)', [KEY, raw])
                    damaged.reload(wait_until='load')
                    assert damaged.locator('#storageWarning').is_visible()
                    damaged.locator('[data-view="setup"]').click()
                    damaged.locator('#baseVerified').check()
                    damaged.locator('#settingsForm button[type="submit"]').click()
                    assert storage(damaged) == raw, 'Saving after invalid startup overwrote recoverable original'
                    assert download_text(damaged, '#exportBtn') == raw, 'Protected export did not preserve the exact original bytes'
                    imported(damaged, original)
                    damaged.wait_for_function('document.getElementById("toast").textContent.includes("备份已导入")')
                    assert workspace(damaged)['studies'] == original['studies']
                    assert storage(damaged, KEY + '.pre-import') == raw
            finally:
                damaged_context.close()

        check('damaged original storage cannot be overwritten by settings save and exports unchanged; explicit valid import recovers it', corrupted_workspace_protection)

        def destructive_actions_clear_runtime():
            for action in ('restart-tests', 'clear-workspace'):
                reset_context = browser.new_context(viewport={'width': 1366, 'height': 900})
                try:
                    reset_context.add_init_script(SIMULATED_LOCK)
                    reset = reset_context.new_page()
                    reset.on('dialog', lambda dialog: dialog.accept())
                    reset.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
                    reset.on('console', lambda message: report['consoleErrors'].append(message.text) if message.type == 'error' else None)
                    reset.goto(url, wait_until='load')
                    reset.evaluate('([key,value])=>localStorage.setItem(key,value)', [KEY, original_raw])
                    reset.reload(wait_until='load')
                    click_mode(reset, '20min')
                    reset.locator('[data-single-action="lock"]').click()
                    reset.wait_for_function('document.getElementById("veil").classList.contains("hide")')
                    # Release only the test stub; then use visible UI controls.
                    reset.evaluate('document.exitPointerLock()')
                    reset.locator('[data-single-action="close"]').click()
                    if action == 'restart-tests':
                        reset.locator('.topbar [data-restart-all]').click()
                    else:
                        reset.locator('[data-view="methods"]').click()
                        reset.locator('#resetBtn').click()
                    reset.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
                    cleared = workspace(reset)
                    assert cleared['studies'] == []
                    assert cleared['singleStudies'] == []
                    assert cleared['singleActive'] is None
                    assert cleared['active'] is None
                    assert cleared['calibration'] is None
                    assert cleared['field'] == []
                    if action == 'restart-tests':
                        assert cleared['settings'] == original['settings']
                        assert cleared['mappings'] == original['mappings']
                    else:
                        assert cleared['settings'] is None
                        assert cleared['mappings'] == []
                    reset.reload(wait_until='load')
                    assert workspace(reset)['singleStudies'] == []
                    assert workspace(reset)['studies'] == []
                    assert reset.locator('#singleLabRoot [data-single-action="resume"]').count() == 0
                finally:
                    reset_context.close()

        check('explicit restart-tests and clear-workspace do not resurrect the old runtime after animation frames or reload', destructive_actions_clear_runtime)

        def changed_dpi_and_abandon():
            guarded_context = browser.new_context(viewport={'width': 1366, 'height': 900})
            try:
                guarded = guarded_context.new_page()
                guarded.on('dialog', lambda dialog: dialog.accept())
                guarded.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
                guarded.on('console', lambda message: report['consoleErrors'].append(message.text) if message.type == 'error' else None)
                guarded.goto(url, wait_until='load')
                imported(guarded, fixture)
                guarded.wait_for_function('document.getElementById("toast").textContent.includes("备份已导入")')
                prior = workspace(guarded)['singleStudies'][0]
                guarded.locator('[data-view="setup"]').click()
                guarded.locator('#dpi').fill('800')
                guarded.locator('#settingsForm button[type="submit"]').click()
                guarded.locator('[data-view="lab"]').click()
                guarded.locator('#singleLabRoot [data-single-action="resume"]').click()
                assert '物理输入已变化，不能继续旧实验' in guarded.locator('#modal').inner_text()
                assert guarded.locator('#modal [data-single-action="lock"]').count() == 0
                assert guarded.evaluate('document.pointerLockElement === null')
                assert workspace(guarded)['singleStudies'][0]['calSnapshot'] == prior['calSnapshot']
                assert workspace(guarded)['singleStudies'][0]['results'] == prior['results']
                guarded.locator('#modal [data-single-action="abandon-device"]').click()
                abandoned = workspace(guarded)['singleStudies'][0]
                assert abandoned['runtime']['phase'] == 'abandoned'
                assert abandoned['status'] == 'abandoned'
                assert abandoned['results'] == prior['results']
                assert abandoned['calSnapshot'] == prior['calSnapshot']
                assert abandoned['completedAt'] and abandoned['abandonedReason']
                assert guarded.locator('#singleResultsRoot [data-single-action="adopt"]').count() == 0
                assert workspace(guarded)['studies'] == original['studies']
                screenshot(guarded, 'abandoned-results-1366x900.png')
                guarded.locator('[data-view="setup"]').click()
                guarded.locator('#dpi').fill('1600')
                guarded.locator('#settingsForm button[type="submit"]').click()
                guarded.locator('[data-view="lab"]').click()
                click_mode(guarded, '10min')
                guarded.locator('[data-single-action="lock"]').wait_for(state='visible')
                current = workspace(guarded)
                assert len(current['singleStudies']) == 2
                assert current['singleStudies'][0]['status'] == 'abandoned'
                assert current['singleStudies'][0]['results'] == prior['results']
                assert current['singleStudies'][1]['mode'] == '10min'
                guarded.locator('[data-single-action="close"]').click()
                guarded.reload(wait_until='load')
                assert workspace(guarded)['singleStudies'][0]['status'] == 'abandoned'
                assert workspace(guarded)['singleStudies'][0]['results'] == prior['results']
            finally:
                guarded_context.close()

        check('changed DPI blocks resuming frozen calibration; explicit abandon keeps completed data and permits a later new study', changed_dpi_and_abandon)

        def deep_preflight():
            deep_context = browser.new_context(viewport={'width': 1366, 'height': 900})
            try:
                deep_context.add_init_script(SIMULATED_LOCK)
                deep_page = deep_context.new_page()
                deep_page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
                deep_page.on('console', lambda message: report['consoleErrors'].append(message.text) if message.type == 'error' else None)
                deep_page.goto(url, wait_until='load')
                deep_page.evaluate('([key,value])=>localStorage.setItem(key,value)', [KEY, original_raw])
                deep_page.reload(wait_until='load')
                click_mode(deep_page, '120min')
                assert deep_page.locator('#singleHardwareSame').is_visible()
                assert not deep_page.locator('#singleHardwareSame').is_checked()
                deep_page.locator('[data-single-action="preflight"]').click()
                assert '请明确确认' in deep_page.locator('#singlePreflightError').inner_text()
                before = workspace(deep_page)['singleStudies'][0]
                assert before['protocolVersion'] == 'senslab-session/2'
                assert before['mode'] == '120min'
                assert before['plannedSeconds'] == 7200
                assert before['measurementSeconds'] == 6300
                assert before['reportReserveSeconds'] == 900
                assert before['runtime']['phase'] == 'preflight'
                assert before['calSnapshot'] == original['calibration']
                assert before['configSnapshot'] == original['settings']
                assert not before['results']
                assert deep_page.evaluate('window.__syntheticLockRequests') == 0
                screenshot(deep_page, 'deep-preflight-1366x900.png')
                deep_page.locator('#singleHardwareSame').check()
                deep_page.locator('[data-single-action="preflight"]').click()
                confirmed = workspace(deep_page)['singleStudies'][0]
                assert confirmed['runtime']['phase'] == 'tutorial'
                assert 0 < confirmed['preflightSavedSeconds'] <= 120
                assert confirmed['plannedSeconds'] == 7200, 'Early confirmation must not rewrite the frozen task schedule'
                assert confirmed['preflight']['hardwareUnchanged'] is True
                assert confirmed['preflight']['ruleSnapshot'] == original['settings']
                deep_page.locator('[data-single-action="lock"]').click()
                deep_page.wait_for_function('document.getElementById("veil").classList.contains("hide")')
                assert deep_page.locator('#uxReticle').is_visible()
                assert '教程' in deep_page.locator('#hudTitle').inner_text()
                assert deep_page.evaluate('window.__syntheticLockRequests') == 1
                assert not workspace(deep_page)['singleStudies'][0]['results']
                screenshot(deep_page, 'deep-simulated-tutorial-1366x900.png')
                deep_page.evaluate('document.exitPointerLock()')
                interrupted = workspace(deep_page)['singleStudies'][0]
                assert any(row['phase'] == 'screen' and row.get('runtimePhase') == 'tutorial' and row['type'] == 'technical' for row in interrupted['interruptions'])
                deep_page.locator('[data-single-action="close"]').click()
                deep_page.locator('[data-view="results"]').click()
                assert '测试结束前不展示条件成绩' in deep_page.locator('#singleResultsRoot').inner_text()
                assert deep_page.locator('#singleResultsRoot table').count() == 0
                deep_page.locator('[data-view="field"]').click()
                assert deep_page.locator('#fieldCandidate option').count() == 1
                deep_page.locator('[data-view="lab"]').click()
                deep_page.set_viewport_size({'width': 900, 'height': 800})
                assert deep_page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                screenshot(deep_page, 'deep-pending-900x800.png')
            finally:
                deep_context.close()

        check('120-minute mode reuses calibration, requires explicit hardware/rule confirmation, reduces only the estimate, and SIMULATED lock shows an unscored tutorial', deep_preflight)

        def storage_v2_compatibility():
            migration_context = browser.new_context(viewport={'width': 1366, 'height': 900})
            try:
                migrated_page = migration_context.new_page()
                migrated_page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
                migrated_page.on('console', lambda message: report['consoleErrors'].append(message.text) if message.type == 'error' else None)
                migrated_page.goto(url, wait_until='load')
                v2 = migrated_page.evaluate(COMPLETE_FIXTURE, {'original': original, 'mode': '20min'})
                v2_raw = json.dumps(v2, ensure_ascii=False, separators=(',', ':'))
                old_backup = 'SYNTHETIC TEST ONLY pre-existing v1 migration backup'
                migrated_page.evaluate('([key,raw,backup,prior])=>{localStorage.setItem(key,raw);localStorage.setItem(backup,prior)}', [KEY, v2_raw, BACKUP, old_backup])
                migrated_page.reload(wait_until='load')
                assert storage(migrated_page, BACKUP) == old_backup
                assert storage(migrated_page, DEEP_BACKUP) == v2_raw
                current = workspace(migrated_page)
                assert current['storageVersion'] == 3
                assert current['singleStudies'] == v2['singleStudies'], 'Migration changed a completed v1 study'
                assert current['studies'] == v2['studies']
                migrated_page.reload(wait_until='load')
                assert storage(migrated_page, DEEP_BACKUP) == v2_raw
                assert workspace(migrated_page)['singleStudies'] == v2['singleStudies']
                click_mode(migrated_page, '120min')
                started = workspace(migrated_page)
                assert len(started['singleStudies']) == 2
                assert started['singleStudies'][0] == v2['singleStudies'][0]
                assert started['singleStudies'][1]['protocolVersion'] == 'senslab-session/2'
            finally:
                migration_context.close()

        check('storage v2 upgrades through an exact pre-deep backup while preserving prior backup, completed v1 study and legacy records', storage_v2_compatibility)

        def deep_complete_reports():
            completed_context = browser.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
            try:
                completed_page = completed_context.new_page()
                completed_page.on('dialog', lambda dialog: dialog.accept())
                completed_page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
                completed_page.on('console', lambda message: report['consoleErrors'].append(message.text) if message.type == 'error' else None)
                completed_page.goto(url, wait_until='load')
                old_v1 = completed_page.evaluate(COMPLETE_FIXTURE, {'original': original, 'mode': '20min'})['singleStudies'][0]
                for eligible, rounds, total, measured in [(2, 3, 7200, 6300), (1, 4, 6900, 6000), (0, 0, 3900, 3000)]:
                    completed = completed_page.evaluate(DEEP_COMPLETE_FIXTURE, {'original': original, 'eligible': eligible})
                    completed['singleStudies'].insert(0, old_v1)
                    imported(completed_page, completed)
                    completed_page.wait_for_function('document.getElementById("importFile").value === ""')
                    assert '备份已导入' in completed_page.locator('#toast').inner_text()
                    deep = workspace(completed_page)['singleStudies'][-1]
                    assert deep['retest']['rounds'] == rounds
                    assert len(deep['retest']['candidateIds']) == eligible + 1
                    assert deep['plannedSeconds'] == total
                    assert deep['measurementSeconds'] == measured
                    assert deep['reportReserveSeconds'] == 900
                    assert workspace(completed_page)['singleStudies'][0] == old_v1
                    completed_page.locator('[data-view="results"]').click()
                    visible = completed_page.locator('#singleResultsRoot').inner_text()
                    assert f'已完成配对轮 {rounds}/{rounds}' in visible
                    assert '120分钟深度实验' in visible
                    assert not completed_page.locator('#legacyResults').evaluate('(e)=>e.open')
                    assert completed_page.locator('#singleResultsRoot [data-single-action="report"]').is_visible()
                    assert not completed_page.locator('#stage').is_visible()
                    if eligible:
                        for label in ['相对角增益', '微调', '切换', '跟枪', '转向', '方向一致性', '费力/疼痛', '1.250×（25.0%）']:
                            assert label in visible, label
                        assert completed_page.locator('#singleResultsRoot [data-single-action="adopt"]').is_visible()
                    else:
                        assert '没有进行伪造的基准自比较' in visible
                        assert deep['status'] == 'insufficient'
                        assert not any(group['stage'] == 'retest' for group in deep['groups'])
                        assert completed_page.locator('#singleResultsRoot [data-single-action="adopt"]').count() == 0
                    assert '中位表现' in completed_page.locator('#singleResultsRoot').text_content()
                    assert '观察范围（不是置信区间）' in completed_page.locator('#singleResultsRoot').text_content()
                    assert completed_page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    screenshot(completed_page, f'deep-complete-{eligible+1}conditions-1366x900.png')
                    report_html = download_text(completed_page, '#singleResultsRoot [data-single-action="report"]')
                    assert deep['id'] in report_html
                    assert 'senslab-session/2' in report_html
                    assert 'LEGACY-STUDY-TEST' not in report_html
                    assert old_v1['id'] not in report_html
                    assert 'SYNTHETIC TEST ONLY field record' not in report_html
                    completed_page.locator('#legacyResults > summary').click()
                    rows = list(csv.DictReader(io.StringIO(download_text(completed_page, '#csvBtn'))))
                    assert all(None not in row and None not in row.values() for row in rows), 'CSV header and rows differ'
                    assert {'legacy-multiday-v1', 'senslab-session/1', 'senslab-session/2'} == {row['protocolVersion'] for row in rows}
                    deep_rows = [row for row in rows if row['protocolVersion'] == 'senslab-session/2']
                    assert len(deep_rows) == len(deep['groups']) * 4
                    by_id = {group['id']: group for group in deep['groups']}
                    for row in deep_rows:
                        group = by_id[row['session']]
                        assert row['mode'] == '120min'
                        assert row['sessionId'] == deep['sessionId']
                        assert row['sessionSegment'] == '1'
                        assert row['phase'] == group['stage']
                        assert row['round'] == str(group['round'])
                        assert row['conditionId'] == group['candidateId']
                        assert row['adaptation_seed'] == str(group['adaptSeed'])
                        assert row['actual_task_ms'] == str(group['taskSeconds'] * 1000)
                        assert row['protocol_planned_seconds'] == str(total)
                        assert row['measurement_planned_seconds'] == str(measured)
                        assert row['report_reserve_seconds'] == '900'
                        assert row['interruption_types'] == ('user' if group['id'] == deep['groups'][0]['id'] else '')
                        if row['task'] == 'track':
                            assert float(row['tracking_covered_ms']) > 0
                    assert all(row['sessionSegment'] == '' for row in rows if row['protocolVersion'] != 'senslab-session/2')
                    completed_page.locator('#legacyResults > summary').click()
                    if eligible == 2:
                        completed_page.set_viewport_size({'width': 900, 'height': 800})
                        assert completed_page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                        screenshot(completed_page, 'deep-complete-3conditions-900x800.png')
                        completed_page.set_viewport_size({'width': 1366, 'height': 900})
                        before = storage(completed_page)
                        bad = copy.deepcopy(completed)
                        first = bad['singleStudies'][-1]
                        first['results'][first['groups'][0]['id']]['tasks']['micro']['sessionId'] = 'FORGED-OTHER-SESSION'
                        imported(completed_page, bad)
                        completed_page.wait_for_function('document.getElementById("importFile").value === ""')
                        assert storage(completed_page) == before
                        assert '导入失败' in completed_page.locator('#toast').inner_text()
            finally:
                completed_context.close()

        check('SYNTHETIC deep reports cover 3x3, 2x4 and no-comparison branches; current-only HTML, metadata CSV and v1 history remain correct', deep_complete_reports)

        def browser_errors():
            assert not report['pageErrors'], report['pageErrors']
            assert not report['consoleErrors'], report['consoleErrors']

        check('all tested DOM paths have no uncaught page errors or console errors', browser_errors)
        report['screenshots'] = [file.name for file in sorted(ARTIFACTS.glob('*.png'))]
        context.close()
        browser.close()

    (ARTIFACTS / 'browser-session-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Synthetic storage/calibration/task fixtures and isolated mocked Pointer Lock contexts only; no hardware lock or real mouse measurement performed.')
    print('Screenshots and report:', ARTIFACTS)
    if failures:
        raise SystemExit(f'{len(failures)} integration check(s) failed: ' + '; '.join(failures))


if __name__ == '__main__':
    main()
