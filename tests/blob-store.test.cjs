const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const database=require('../lib/database.cjs');
test('large private JSON files use strong versions, and genuinely stale writes are rejected',async()=>{
 let etag='"version-1"';
 const stored={...database.createDatabase('1234'),entries:Array.from({length:1000},(_,i)=>({id:'e'+i,type:'income',category:'অন্যান্য আয়',amount:600,month:'2026-01',date:'2026-01-01',flatNo:'',note:'নমুনা বিবরণ '.repeat(30)}))};
 let body=JSON.stringify(stored);
 assert.ok(Buffer.byteLength(body)>200000);
 class BlobPreconditionFailedError extends Error{}
 const sdk={BlobPreconditionFailedError,
  get:async(_name,options)=>({statusCode:200,stream:new Response(body).body,blob:{etag:options.headers?.['accept-encoding']==='identity'?etag:'W/'+etag}}),
  put:async(_name,next,options)=>{if(options.ifMatch!==etag)throw new BlobPreconditionFailedError();body=next;etag='"version-2"';return {etag};}
 };
 const context={module:{exports:{}},Response,require:name=>name==='@vercel/blob'?sdk:database};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lib/blob-store.cjs'),'utf8'),context);
 const store=context.module.exports,read=await store.read();
 assert.equal(read.etag,'"version-1"');
 assert.equal((await store.write({...read.database,revision:1},read.etag)).etag,'"version-2"');
 await assert.rejects(()=>store.write(read.database,read.etag),error=>error.status===409);
 assert.equal(JSON.parse(body).revision,1);
});
