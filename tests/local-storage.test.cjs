const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

function app(storage = new Map()) {
  const elements = new Map();
  const messages = [];
  const context = vm.createContext({
    console, Set, Date, JSON, Number, Blob, URL, confirm: () => true,
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, value)
    },
    window: {addEventListener() {}},
    document: { getElementById: id => {
      if (!elements.has(id)) elements.set(id, {innerHTML: '', value: '', addEventListener() {}, querySelector: () => null, querySelectorAll: () => []});
      return elements.get(id);
    }, querySelector: () => null },
    setTimeout: () => {}, requestAnimationFrame: () => {}
  });
  vm.runInContext(script, context);
  context.renderApp = () => {};
  context.renderModal = () => {};
  context.showToast = (kind, message) => messages.push({kind, message});
  return {context, storage, elements, messages};
}
function seed(context) {
  context.STATE.pin = '1234';
  context.STATE.flats = Array.from({length: 27}, (_, i) => ({flatNo: `A-${i+1}`, ownerName: `মালিক ${i+1}`, mobile: `017${String(i).padStart(8, '0')}`}));
  assert.equal(context.persist(), true);
}

test('starts without Firebase and reloads all 27 flats and monthly entries', () => {
  assert.doesNotMatch(script, /firebase|firestore|onSnapshot|setDoc/i);
  const a = app();
  assert.equal(a.context.STATE.flats.length, 0);
  assert.match(a.elements.get('app-root').innerHTML, /admin-login-form/);
  seed(a.context);
  a.context.bulkServiceCharge();
  a.context.bulkServiceCharge();
  const b = app(a.storage);
  assert.equal(b.context.STATE.flats.length, 27);
  assert.equal(b.context.STATE.entries.length, 27);
  assert.equal(b.context.STATE.pin, '1234');
  assert.equal(b.context.summarize(b.context.STATE.entries, b.context.UI.month).incomeTotal, 81000);
});

test('flat create, edit and delete survive a reload', () => {
  const a = app();
  seed(a.context);
  a.context.openFlatModal(null);
  for (const [id, value] of [['flat-no','B-1'], ['flat-owner','নতুন মালিক'], ['flat-mobile','01812345678']]) a.context.document.getElementById(id).value = value;
  a.context.saveFlat();
  const flat = a.context.STATE.flats.find(f => f.flatNo === 'B-1');
  assert.ok(flat);
  a.context.openFlatModal(flat);
  a.context.document.getElementById('flat-owner').value = 'সম্পাদিত নাম';
  a.context.saveFlat();
  assert.equal(app(a.storage).context.STATE.flats.find(f => f.flatNo === 'B-1').ownerName, 'সম্পাদিত নাম');
  a.context.deleteFlat('B-1');
  assert.equal(app(a.storage).context.STATE.flats.length, 27);
});

test('backup round trip, cancellation and invalid backup preserve records', async () => {
  const a = app(); seed(a.context); a.context.bulkServiceCharge();
  const backup = a.context.encodeRecords(a.context.STATE);
  const b = app();
  await b.context.restoreBackup({size: backup.length, text: async () => backup});
  assert.equal(app(b.storage).context.STATE.entries.length, 27);
  const before = b.storage.get(b.context.STORAGE_KEY);
  await b.context.restoreBackup({size: 3, text: async () => 'bad'});
  assert.equal(b.storage.get(b.context.STORAGE_KEY), before);
  b.context.confirm = () => false;
  const empty = b.context.encodeRecords(b.context.emptyState());
  await b.context.restoreBackup({size: empty.length, text: async () => empty});
  assert.equal(b.storage.get(b.context.STORAGE_KEY), before);
  assert.throws(() => b.context.readRecords(JSON.stringify({app: 'bijoytower', version: 2, data: {}})));
  const duplicate = JSON.parse(backup); duplicate.data.flats.push(duplicate.data.flats[0]);
  assert.throws(() => b.context.readRecords(JSON.stringify(duplicate)));
});

test('quota failures and stale tabs cannot overwrite saved data', () => {
  const a = app(); seed(a.context);
  const before = a.storage.get(a.context.STORAGE_KEY);
  a.context.localStorage.setItem = () => {throw new Error('Quota exceeded');};
  a.context.STATE.flats = [];
  assert.equal(a.context.persist(), false);
  assert.equal(a.context.STATE.flats.length, 27);
  assert.equal(a.storage.get(a.context.STORAGE_KEY), before);
  assert.equal(a.messages.at(-1).kind, 'error');
  const stale = app(a.storage), current = app(a.storage);
  current.context.STATE.flats[0].ownerName = 'Updated'; current.context.persist();
  stale.context.STATE.flats = [];
  assert.equal(stale.context.persist(), false);
  assert.equal(app(a.storage).context.STATE.flats[0].ownerName, 'Updated');
});

test('corrupt storage is reported without clearing it', () => {
  const data = new Map([['bijoytower.local.v1', '{broken']]);
  const a = app(data);
  assert.ok(a.context.stateError);
  assert.equal(data.get('bijoytower.local.v1'), '{broken');
});
