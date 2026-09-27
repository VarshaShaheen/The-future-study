const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const handler = require('../api/responses');
function response() { return {code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.data=v;return this}}; }
const payload={participant_id:'P-TEST-123456789',condition:'control',consent:'Yes',q7_other_text:'=IMPORTXML("x")'};
(async()=>{
 const oldFetch=global.fetch;
 const oldURL=process.env.GOOGLE_SCRIPT_URL,oldToken=process.env.GOOGLE_SCRIPT_TOKEN;
 try {
 delete process.env.GOOGLE_SCRIPT_URL;delete process.env.GOOGLE_SCRIPT_TOKEN;
 let res=response();await handler({method:'POST',body:payload},res);assert.equal(res.code,503);
 process.env.GOOGLE_SCRIPT_URL='https://script.google.com/macros/s/test/exec';process.env.GOOGLE_SCRIPT_TOKEN='test-only';
 res=response();await handler({method:'GET'},res);assert.equal(res.code,405);
 res=response();await handler({method:'POST',body:{...payload,consent:'No'}},res);assert.equal(res.code,400);
 for(const result of [{ok:false},{ok:true,participant_id:'wrong'}]){
 global.fetch=async()=>({ok:true,json:async()=>result});res=response();await handler({method:'POST',body:payload},res);assert.equal(res.code,502);
 }
 global.fetch=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.token,'test-only');assert.deepEqual(body.payload,payload);return {ok:true,json:async()=>({ok:true,participant_id:payload.participant_id})}};
 res=response();await handler({method:'POST',body:payload},res);assert.equal(res.code,200);assert.equal(res.data.participant_id,payload.participant_id);
 global.fetch=async()=>{throw new Error('offline')};res=response();await handler({method:'POST',body:payload},res);assert.equal(res.code,502);
 console.log('Relay: invalid input, missing config, failed/mismatched acknowledgment, success, and offline paths passed');
 } finally {global.fetch=oldFetch;for(const [k,v] of [['GOOGLE_SCRIPT_URL',oldURL],['GOOGLE_SCRIPT_TOKEN',oldToken]])if(v===undefined)delete process.env[k];else process.env[k]=v;}
 let fields,locked=false;const rows=[];
 const sheet = {
   getLastRow: () => rows.length + 1,
   appendRow(row) { assert(locked); rows.push(row); },
   getRange(start) {
     if (start === 1) return {getValues: () => [fields]};
     return {
       createTextFinder(id) {
         return {
           matchEntireCell() { return this; },
           useRegularExpression() { return this; },
           findNext() { return rows.find(row => row[0] === id) || null; }
         };
       }
     };
   }
 };
 const context=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='SUBMISSION_TOKEN'?'test-only':'sheet-id'})},LockService:{getScriptLock:()=>({waitLock(){locked=true},hasLock:()=>locked,releaseLock(){locked=false}})},SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush(){}},ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})}});
 vm.runInContext(fs.readFileSync('tools/sheets-backend.gs','utf8'),context);fields=vm.runInContext('FIELDS',context);
 const post=body=>context.doPost({postData:{contents:JSON.stringify(body)}});
 assert.equal(post({token:'wrong',payload}).ok,false);assert.equal(rows.length,0);
 assert.equal(post({token:'test-only',payload}).ok,true);assert.equal(rows.length,1);assert.equal(locked,false);
 assert.equal(rows[0][fields.indexOf('q7_other_text')],"'"+payload.q7_other_text);
 assert.equal(post({token:'test-only',payload}).ok,true);assert.equal(rows.length,1);
 assert.equal(post({token:'test-only',payload:{...payload,participant_id:'P-TEST-987654321'}}).ok,true);assert.equal(rows.length,2);
 const original=sheet.appendRow;sheet.appendRow=()=>{throw new Error('write failed')};assert.equal(post({token:'test-only',payload:{...payload,participant_id:'P-FAIL-12345678'}}).ok,false);assert.equal(locked,false);sheet.appendRow=original;
 console.log('Apps Script mock: token checks, column mapping, formula escaping, duplicate prevention, and lock release passed');
 const html=fs.readFileSync('index.html','utf8');for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 console.log('Browser script syntax passed');
})().catch(e=>{console.error(e);process.exit(1)});
