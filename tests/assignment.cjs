const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const handler = require('../api/assignment');
const response = () => ({code:200, headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.data=v;return this}});

async function main(){
  let locked=false, failWrite=false, failFlush=false, denyLock=false;
  const rows=[];
  const sheet={
    getLastRow:()=>rows.length,
    setFrozenRows(){},
    getRange(row,col,count,width){
      return {
        getValues:()=>rows.slice(row-1,row-1+count).map(r=>r.slice(col-1,col-1+width)),
        setValues(values){
          assert(locked,'All assignment writes must hold the lock');
          if(failWrite) throw Error('write failed');
          values.forEach((value,i)=>{rows[row-1+i]=Array.from(value)});
        }
      };
    }
  };
  let created=false;
  const context=vm.createContext({
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='SUBMISSION_TOKEN'?'test-only':'sheet-id'})},
    LockService:{getScriptLock:()=>({waitLock(){if(denyLock)throw Error('busy');assert(!locked);locked=true},hasLock:()=>locked,releaseLock(){locked=false}})},
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>created?sheet:null,insertSheet(name){assert.equal(name,'Study Assignments');created=true;return sheet}}),flush(){assert(locked);if(failFlush)throw Error('lost acknowledgment')}},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})}
  });
  vm.runInContext(fs.readFileSync('tools/sheets-backend.gs','utf8'),context);
  const post=body=>context.doPost({postData:{contents:JSON.stringify(body)}});
  const assign=id=>post({token:'test-only',action:'assign',payload:{participant_id:id,consent:'Yes'}});
  assert.equal(post({token:'wrong',action:'assign',payload:{participant_id:'P-TEST-00000001',consent:'Yes'}}).ok,false);
  assert.equal(post({token:'test-only',action:'assign',payload:{participant_id:'P-TEST-00000001',consent:'No'}}).ok,false);
  assert.equal(created,false);
  for(let i=0;i<40;i++){
    const id=`P-TEST-${String(i).padStart(8,'0')}`;
    const result=assign(id);
    assert.equal(result.ok,true);assert.equal(locked,false);
    const count=rows.length;
    assert.deepEqual(assign(id),result);assert.equal(rows.length,count);
  }
  for(let i=1;i<rows.length;i+=4){
    const block=rows.slice(i,i+4);
    assert.equal(block.filter(r=>r[1]==='control').length,2);
    assert.equal(block.filter(r=>r[1]==='treatment').length,2);
    assert.equal(new Set(block.map(r=>r[0])).size,4);
    assert(block.every(r=>r[2]===(i-1)/4+1));
  }
  const before=rows.length;
  denyLock=true;assert.equal(assign('P-BUSY-00000001').ok,false);assert.equal(rows.length,before);denyLock=false;
  failWrite=true;assert.equal(assign('P-FAIL-00000001').ok,false);assert.equal(locked,false);assert.equal(rows.length,before);failWrite=false;
  failFlush=true;assert.equal(assign('P-LOST-00000001').ok,false);assert.equal(locked,false);failFlush=false;
  const retry=assign('P-LOST-00000001');assert.equal(retry.ok,true);
  assert.equal(rows.filter(r=>r[0]==='P-LOST-00000001').length,1);
  assert.equal(rows.length,before+4);
  console.log('Apps Script: 10 balanced blocks, stable retries, locked writes, lock contention, failed writes, and lost acknowledgment passed.');

  const oldFetch=global.fetch, oldURL=process.env.GOOGLE_SCRIPT_URL, oldToken=process.env.GOOGLE_SCRIPT_TOKEN;
  const payload={participant_id:'P-RELAY-00000001',consent:'Yes'};
  try {
    delete process.env.GOOGLE_SCRIPT_URL;delete process.env.GOOGLE_SCRIPT_TOKEN;
    let res=response();await handler({method:'POST',body:payload},res);assert.equal(res.code,503);
    process.env.GOOGLE_SCRIPT_URL='https://script.google.com/macros/s/test/exec';process.env.GOOGLE_SCRIPT_TOKEN='test-only';
    res=response();await handler({method:'GET'},res);assert.equal(res.code,405);
    for(const body of ['{',{},[],{...payload,consent:'No'},{...payload,participant_id:'bad'}]){
      res=response();await handler({method:'POST',body},res);assert.equal(res.code,400);
    }
    global.fetch=async(url,options)=>{
      const request=JSON.parse(options.body);assert.equal(request.action,'assign');assert.equal(request.token,'test-only');
      assert.equal(request.payload.condition,undefined);
      return {ok:true,json:async()=>post(request)};
    };
    res=response();await handler({method:'POST',body:{...payload,condition:'treatment'}},res);
    assert.equal(res.code,200);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.data.participant_id,payload.participant_id);
    for(const result of [{ok:false},{ok:true,participant_id:'wrong',condition:'control'},{ok:true,participant_id:payload.participant_id,condition:'invalid'}]){
      global.fetch=async()=>({ok:true,json:async()=>result});res=response();await handler({method:'POST',body:payload},res);assert.equal(res.code,502);
    }
    global.fetch=async()=>{throw Error('offline')};res=response();await handler({method:'POST',body:payload},res);assert.equal(res.code,502);
    console.log('Assignment relay: real mocked backend path, validation, token isolation, acknowledgment checks, and offline failure passed.');
  } finally {
    global.fetch=oldFetch;
    for(const [key,value] of [['GOOGLE_SCRIPT_URL',oldURL],['GOOGLE_SCRIPT_TOKEN',oldToken]])if(value===undefined)delete process.env[key];else process.env[key]=value;
  }

  const html=fs.readFileSync('index.html','utf8');
  const start=html.indexOf('async function assignCondition(){'),end=html.indexOf('\nconst esc',start);
  const state={pid:payload.participant_id,answers:{consent:'Yes'}};
  const browser=vm.createContext({state,AbortSignal,fetch:async(url,options)=>{
    assert.equal(url,'/api/assignment');assert.deepEqual(JSON.parse(options.body),payload);
    return {ok:true,json:async()=>({ok:true,participant_id:state.pid,condition:'treatment'})};
  }});
  vm.runInContext(html.slice(start,end),browser);
  assert.equal(await vm.runInContext('assignCondition()',browser),'treatment');
  browser.fetch=async()=>({ok:true,json:async()=>({ok:true,participant_id:'wrong',condition:'control'})});
  await assert.rejects(vm.runInContext('assignCondition()',browser));
  browser.fetch=async()=>{throw Error('offline')};await assert.rejects(vm.runInContext('assignCondition()',browser));
  console.log('Browser assignment: consent/ID request, acknowledged arm, mismatched ID, and no offline fallback passed.');

  // Exercise the real Start handler: failed assignments stay put; a retry
  // advances only once, with the assigned participant's screen sequence.
  let click, resolveAssignment, calls=0, persisted=0, rendered=0;
  const status={setAttribute(){},textContent:''};
  const nextBtn={disabled:false,addEventListener(type,fn){click=fn}};
  const ui=vm.createContext({
    state:{pid:payload.participant_id,condition:null,index:0},nextBtn,
    assignmentPending:false,SCREENS:[{id:'consent'},{id:'profile'}],
    document:{getElementById:()=>status},
    assignCondition:()=>{calls++;return new Promise(resolve=>{resolveAssignment=resolve})},
    screensForCondition:condition=>[{id:'consent'},{id:'profile'},{id:condition}],
    persist(){persisted++},stampTime(){},render(){rendered++},finish(){throw Error('unexpected finish')},
    validate(){nextBtn.disabled=ui.assignmentPending}
  });
  const clickStart=html.indexOf('nextBtn.addEventListener("click", async');
  vm.runInContext(html.slice(clickStart,html.indexOf('backBtn.addEventListener',clickStart)),ui);
  const pending=click();await click();assert.equal(calls,1);assert.equal(ui.state.index,0);
  resolveAssignment('treatment');await pending;
  assert.equal(ui.state.condition,'treatment');assert.equal(ui.state.index,1);
  assert.equal(persisted,1);assert.equal(rendered,1);assert.equal(ui.SCREENS[2].id,'treatment');
  ui.state.condition=null;ui.state.index=0;nextBtn.disabled=false;
  ui.assignCondition=async()=>{throw Error('offline')};
  await click();assert.equal(ui.state.index,0);assert.equal(ui.state.condition,null);
  assert.equal(nextBtn.disabled,false);assert.equal(nextBtn.textContent,'Try again');
  ui.assignCondition=async()=>'control';await click();assert.equal(ui.state.condition,'control');assert.equal(ui.state.index,1);

  // A reload uses the saved arm and screen; a new session persists its ID
  // on the consent screen without assigning a slot until Start is clicked.
  let saved=null, assignmentCalls=0;
  const bootContext=vm.createContext({
    state:{},CONFIG:{BLOCK_REPEAT:true,FORCE_CONDITION:null},qs:new URLSearchParams(),
    LS_DONE:'done',LS_KEY:'state',SCREEN_GROUPS:[{id:'consent'}],SCREENS:[],
    localStorage:{getItem:key=>key==='state'?JSON.stringify(saved):null},
    flushQueue(){},alreadyDone(){throw Error('unexpected done')},uid:()=>payload.participant_id,
    previewCondition:()=>null,assignCondition(){assignmentCalls++;throw Error('unexpected assignment')},
    screensForCondition:arm=>[{id:'consent'},{id:'profile',questions:[{id:'age'}]},...(arm==='treatment'?[{id:'treatment_video'}]:[])],
    render(){}
  });
  const boot=html.slice(html.indexOf('(function boot(){'),html.lastIndexOf('</script>'));
  vm.runInContext(boot,bootContext);
  assert.equal(bootContext.state.pid,payload.participant_id);assert.equal(bootContext.state.condition,null);assert.equal(assignmentCalls,0);
  saved={pid:payload.participant_id,condition:'treatment',answers:{age:'25'},screenId:'treatment_video'};
  vm.runInContext(boot,bootContext);
  assert.equal(bootContext.state.condition,'treatment');assert.equal(bootContext.state.index,2);assert.equal(assignmentCalls,0);
  console.log('Browser flow: duplicate clicks, failed Start/retry, condition-specific navigation, fresh sessions, and saved treatment resumes passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
