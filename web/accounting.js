(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Accounting=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const SERVICE='সার্ভিস চার্জ', GARAGE='গ্যারেজ ভাড়া (ফ্ল্যাট মালিক)', OUTSIDE='গ্যারেজ ভাড়া (বহিরাগত)';
  const receivableCategories=[SERVICE,GARAGE,'বকেয়া আদায়'];
  const round=value=>Math.round(value*100)/100;
  const sum=rows=>rows.reduce((total,row)=>total+Math.round(Number(row.amount||0)*100),0)/100;
  function months(state){return [...new Set([state.settings?.openingMonth,...state.entries.map(e=>e.month),...(state.invoices||[]).map(e=>e.month),...(state.reports||[]).map(e=>e.month)].filter(Boolean))].sort();}
  function summary(state,month){
    const first=state.settings?.openingMonth||'2026-01';
    const opening=round(Number(state.settings?.openingBalance||0)+sum(state.entries.filter(e=>e.month>=first&&e.month<month&&e.type==='income'))-sum(state.entries.filter(e=>e.month>=first&&e.month<month&&e.type==='cost')));
    const rows=state.entries.filter(e=>e.month===month), income=rows.filter(e=>e.type==='income'), costs=rows.filter(e=>e.type==='cost');
    const received=sum(income), expense=sum(costs);
    const categories={};rows.forEach(e=>{const key=e.type+'|'+e.category;categories[key]=(categories[key]||0)+e.amount;});
    return {opening,received,expense,closing:round(opening+received-expense),income,costs,categories,
      service:sum(income.filter(e=>e.category===SERVICE)),garage:sum(income.filter(e=>e.category===GARAGE)),outside:sum(income.filter(e=>e.category===OUTSIDE))};
  }
  function flatAccount(state,flat,month){
    const bills=(state.invoices||[]).filter(e=>e.flatNo===flat.flatNo&&e.month<=month);
    const receipts=state.entries.filter(e=>e.type==='income'&&e.flatNo===flat.flatNo&&e.month<=month&&receivableCategories.includes(e.category));
    const opening=Number(flat.openingDue||0), billed=sum(bills.filter(e=>e.month===month)), paid=sum(receipts.filter(e=>e.month===month));
    const due=round(opening+sum(bills)-sum(receipts));
    return {billed,paid,due,previous:round(due-billed+paid),bills: bills.filter(e=>e.month===month), receipts:receipts.filter(e=>e.month===month),
      servicePaid:sum(receipts.filter(e=>e.month===month&&e.category===SERVICE)), garagePaid:sum(receipts.filter(e=>e.month===month&&e.category===GARAGE))};
  }
  function totalDue(state,month){return round(state.flats.reduce((total,flat)=>total+Math.max(0,flatAccount(state,flat,month).due),0));}
  function generateBills(state,month){
    const result=[];
    for(const flat of state.flats.filter(f=>f.active!==false))for(const [category,rate] of [[SERVICE,flat.serviceRate??3000],[GARAGE,flat.garageRate||0]]){
      if(rate>0&&!(state.invoices||[]).some(b=>b.flatNo===flat.flatNo&&b.month===month&&b.category===category))result.push({id:'bill-'+month+'-'+flat.flatNo+'-'+(category===SERVICE?'service':'garage'),month,flatNo:flat.flatNo,category,amount:rate,note:'মাসিক বিল',sourceId:''});
    }
    return result;
  }
  function reconciliation(state,report){const actual=summary(state,report.month);return {opening:actual.opening-report.reportedOpening,closing:actual.closing-report.reportedClosing,due:totalDue(state,report.month)-Object.values(report.dues||{}).reduce((a,b)=>a+b,0),expense:actual.expense-report.expenseTotal};}
  return {SERVICE,GARAGE,OUTSIDE,receivableCategories,sum,months,summary,flatAccount,totalDue,generateBills,reconciliation};
});
