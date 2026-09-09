const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('language preference and core accounting translations',()=>{
 const saved=new Map();
 const context={localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)},document:{documentElement:{lang:''},title:''}};
 context.globalThis=context;
 vm.runInNewContext(fs.readFileSync(require.resolve('../web/i18n.js'),'utf8'),context);
 assert.equal(context.I18n.language,'bn');
 assert.equal(context.I18n.setLanguage('en'),'en');
 assert.equal(context.I18n.t('ফ্ল্যাট মালিক'),'Flat Owner');
 assert.equal(context.I18n.t('বিদ্যুৎ বিল'),'Electricity Bill');
 assert.equal(context.I18n.t('26টি ফ্ল্যাটের মোবাইল নম্বর এখনো যোগ করা হয়নি। নাম ও ফ্ল্যাট নম্বর সংরক্ষিত আছে।'),'Phone numbers are still missing for 26 flats. Names and flat numbers are saved.');
 assert.equal(saved.get('bijoytower-language'),'en');
 assert.equal(context.document.documentElement.lang,'en');
 context.I18n.setLanguage('bn');
 assert.equal(context.I18n.t('ফ্ল্যাট মালিক'),'ফ্ল্যাট মালিক');
});
