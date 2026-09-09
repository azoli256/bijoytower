function invalid(message){const error=new Error(message);error.status=400;throw error;}
function text(value,max=250,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))invalid('সঠিক তথ্য লিখুন।');return value.trim();}
function money(value,negative=false){if(!Number.isFinite(value)||Math.abs(value)>1e10||(!negative&&value<0))invalid('টাকার পরিমাণ সঠিক নয়।');return Math.round(value*100)/100;}
function month(value){if(typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))invalid('হিসাবের মাস সঠিক নয়।');return value;}
function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)invalid('তারিখ সঠিক নয়।');return value;}
function rows(value,max=30000){if(!Array.isArray(value)||value.length>max)invalid('তালিকা সঠিক নয়।');return value;}
function unique(list,key){const seen=new Set();for(const row of list){const id=key(row);if(seen.has(id))invalid('একই তথ্য একাধিকবার আছে: '+id);seen.add(id);}return list;}
function validate(data){
 if(!data)invalid('ডাটাবেস তথ্য নেই।');
 const flats=rows(data.flats,1000).map(f=>{if(!f)invalid('ফ্ল্যাটের তথ্য নেই।');const mobile=text(f.mobile,30).replace(/\D/g,'');if(mobile&&!/^01\d{9}$/.test(mobile))invalid('মোবাইল নম্বর ০১ দিয়ে শুরু ১১ অঙ্কের হতে হবে।');return {flatNo:text(f.flatNo,30,true),ownerName:text(f.ownerName,150,true),mobile,serviceRate:money(f.serviceRate??3000),garageRate:money(f.garageRate??0),openingDue:money(f.openingDue??0,true),active:f.active!==false};});
 unique(flats,f=>f.flatNo);unique(flats.filter(f=>f.mobile),f=>f.mobile);
 const entries=rows(data.entries).map(e=>{if(!e||!['income','cost'].includes(e.type))invalid('লেনদেনের ধরন সঠিক নয়।');const amount=money(e.amount);if(amount<=0)invalid('টাকার পরিমাণ শূন্যের বেশি হবে।');return {id:text(e.id,100,true),type:e.type,category:text(e.category,150,true),amount,month:month(e.month),date:date(e.date||e.month+'-01'),flatNo:text(e.flatNo||'',30),payer:text(e.payer||'',150),note:text(e.note||'',2000),sourceId:text(e.sourceId||'',150)};});unique(entries,e=>e.id);
 const invoices=rows(data.invoices||[]).map(b=>{if(!b)invalid('বিলের তথ্য নেই।');const amount=money(b.amount);if(amount<=0)invalid('বিলের পরিমাণ শূন্যের বেশি হবে।');return {id:text(b.id,100,true),month:month(b.month),flatNo:text(b.flatNo,30,true),category:text(b.category,150,true),amount,note:text(b.note||'',2000),sourceId:text(b.sourceId||'',150)};});unique(invoices,b=>b.id);unique(invoices,b=>[b.month,b.flatNo,b.category].join('|'));
 const settings={buildingName:text(data.settings?.buildingName||'বিজয় টাওয়ার',100),openingMonth:month(data.settings?.openingMonth||'2026-01'),openingBalance:money(data.settings?.openingBalance||0,true)};
 if(entries.some(e=>e.month<settings.openingMonth)||invoices.some(e=>e.month<settings.openingMonth))invalid('প্রারম্ভিক মাসের আগের লেনদেন বা বিল যোগ করা যাবে না।');
 const reports=rows(data.reports||[],600).map(r=>{const dues={};for(const [key,value]of Object.entries(r.dues||{}))dues[text(key,30,true)]=money(value);const result={month:month(r.month),dues,sourceId:text(r.sourceId||'',150),expenseSourceId:text(r.expenseSourceId||'',150)};for(const key of ['serviceTotal','garageTotal','outsideTotal','expenseTotal','otherTotal','reportedOpening','reportedClosing'])result[key]=money(r[key]||0,true);return result;});unique(reports,r=>r.month);
 const sources=rows(data.sources||[],2000).map(s=>({id:text(s.id,150,true),file:text(s.file,150,true),month:month(s.month),kind:text(s.kind,50)}));unique(sources,s=>s.id);
 const reviewItems=rows(data.reviewItems||[],1000).map(r=>({id:text(r.id,100,true),month:r.month?month(r.month):'',status:r.status==='resolved'?'resolved':'open',message:text(r.message,2000,true),resolution:text(r.resolution||'',2000)}));unique(reviewItems,r=>r.id);
 return {schemaVersion:2,flats,entries,invoices,settings,reports,sources,reviewItems};
}
module.exports={validate};
