const {test}=require('node:test');
const assert=require('node:assert/strict');
const A=require('../web/accounting.js');
const {validate}=require('../lib/schema.cjs');
function data(){return validate({flats:[{flatNo:'1A',ownerName:'Test owner',mobile:'',serviceRate:3000,garageRate:500,openingDue:1000}],entries:[],invoices:[],settings:{openingMonth:'2026-01',openingBalance:200}});}
test('bills create receivables, never cash; partial payments and old dues remain separate',()=>{
 const s=data();s.invoices.push(...A.generateBills(s,'2026-01'));
 assert.equal(s.invoices.length,2);assert.equal(A.generateBills(s,'2026-01').length,0);
 assert.equal(A.summary(s,'2026-01').received,0);assert.equal(A.totalDue(s,'2026-01'),4500);
 s.entries.push({id:'one',type:'income',category:A.SERVICE,month:'2026-01',date:'2026-02-03',flatNo:'1A',amount:1500});
 assert.equal(A.flatAccount(s,s.flats[0],'2026-01').due,3000);
 assert.equal(A.summary(s,'2026-01').received,1500);
 assert.equal(A.summary(s,'2026-02').opening,1700);
 s.entries.push({id:'two',type:'income',category:'অন্যান্য আয়',month:'2026-01',date:'2026-01-01',flatNo:'1A',amount:8000});
 assert.equal(A.flatAccount(s,s.flats[0],'2026-01').due,3000);
 s.flats[0].serviceRate=4000;s.invoices.push(...A.generateBills(s,'2026-02'));
 assert.equal(A.flatAccount(s,s.flats[0],'2026-01').billed,3500);
 assert.equal(A.flatAccount(s,s.flats[0],'2026-02').billed,4500);
});
test('opening balances carry forward, expenses reduce cash and source mismatches remain visible',()=>{
 const s=data();s.entries=[{type:'income',category:A.OUTSIDE,amount:600,month:'2026-01'},{type:'cost',category:'পানি বিল',amount:1000,month:'2026-01'}];
 assert.equal(A.summary(s,'2026-01').closing,-200);
 assert.equal(A.summary(s,'2026-02').opening,-200);
 const report={month:'2026-01',reportedOpening:200,reportedClosing:-100,dues:{'1A':1000},expenseTotal:1000};
 assert.equal(A.reconciliation(s,report).closing,-100);
});
test('fractional currency is calculated to paisa precision',()=>{
 assert.equal(A.sum([{amount:0.1},{amount:0.2}]),0.3);
 const s=data();s.settings.openingBalance=0.3;s.entries=[{type:'cost',amount:0.1,month:'2026-01'}];assert.equal(A.summary(s,'2026-01').closing,0.2);
});
test('schema rejects duplicate phone numbers, impossible dates and duplicate bills; backups retain all records',()=>{
 const s=data();s.flats[0].mobile='01700000001';s.flats.push({...s.flats[0],flatNo:'1B'});assert.throws(()=>validate(s));s.flats.pop();
 s.invoices=A.generateBills(s,'2026-01');s.invoices.push({...s.invoices[0],id:'other'});assert.throws(()=>validate(s));s.invoices.pop();
 s.entries.push({id:'e',type:'income',category:A.SERVICE,amount:1,month:'2026-01',date:'2026-02-30',flatNo:'1A',note:'',payer:'',sourceId:''});assert.throws(()=>validate(s));s.entries[0].date='2026-02-28';
 const roundtrip=validate(JSON.parse(JSON.stringify(s)));assert.deepEqual(roundtrip,s);
});
