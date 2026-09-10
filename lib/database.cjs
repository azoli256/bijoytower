const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
const {validate} = require('./schema.cjs');
const phoneKey=value=>{const digits=String(value||'').replace(/\D/g,'');return digits.startsWith('880')&&digits.length===13?'0'+digits.slice(3):digits;};
const flatPhones=flat=>[flat.mobile,...(flat.contacts||[]).map(c=>c.phone)].map(phoneKey).filter(Boolean);
function pinHash(pin, salt) { return crypto.scryptSync(pin, salt, 32).toString('hex'); }
function createDatabase(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {version: 1, revision: 0, updatedAt: new Date().toISOString(), flats: [], entries: [],
    auth: {salt, hash: pinHash(pin, salt), secret: crypto.randomBytes(32).toString('hex')}};
}
function checkPin(pin, auth) {
  if (typeof pin !== 'string' || pin.length > 100) return false;
  return crypto.timingSafeEqual(Buffer.from(pinHash(pin, auth.salt), 'hex'), Buffer.from(auth.hash, 'hex'));
}
function sessionToken(role, subject, auth) {
  const payload = Buffer.from(JSON.stringify({role, subject, flatNo:role==='resident'&&!String(subject).startsWith('phone:')?subject:undefined, expires: Date.now() + 8 * 3600 * 1000})).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', auth.secret).update(payload).digest('base64url');
}
function readSession(cookie, auth) {
  try {
    const token = (cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('bijoy_session='))?.slice(14);
    if (!token) return null;
    const [payload, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', auth.secret).update(payload).digest('base64url');
    if (signature?.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return session.expires > Date.now() && ['admin', 'resident'].includes(session.role) ? session : null;
  } catch { return null; }
}
function localStore(filename) {
  let queue = Promise.resolve();
  async function read() {
    const database = JSON.parse(await fs.readFile(filename, 'utf8'));
    validate(database);
    if (database.version !== 1 || !database.auth?.hash || !Number.isInteger(database.revision)) fail(500, 'Database file is invalid. Restore a backup.');
    return {database, etag: String(database.revision)};
  }
  async function write(database, etag) {
    const operation = queue.then(async () => {
      const current = await read();
      if (current.etag !== etag) fail(409, 'Another user changed the records. Refresh and try again.');
      const temporary = filename + '.' + crypto.randomUUID() + '.tmp';
      await fs.mkdir(path.dirname(filename), {recursive: true});
      try {
        await fs.copyFile(filename, filename + '.bak');
        await fs.writeFile(temporary, JSON.stringify(database, null, 2), {mode: 0o600});
        for(let attempt=0;;attempt++){
          try{await fs.rename(temporary,filename);break;}
          catch(error){if(attempt>=5||!['EACCES','EPERM','EBUSY'].includes(error.code))throw error;await new Promise(resolve=>setTimeout(resolve,25*(attempt+1)));}
        }
      } finally { await fs.rm(temporary, {force: true}).catch(() => {}); }
      return {database, etag: String(database.revision)};
    });
    queue = operation.catch(() => {}); return operation;
  }
  return {read, write};
}
function clientView(database, session) {
  if (!session) return {session: null, state: {flats: [], entries: [], pin: 'configured'}, revision: database.revision};
  const residentSubject=String(session.subject||session.flatNo||''),key=residentSubject.startsWith('phone:')?residentSubject.slice(6):'';
  const residentFlats=session.role==='resident'?database.flats.filter(f=>key?flatPhones(f).includes(key):f.flatNo===session.flatNo):[];
  if (session.role === 'resident' && !residentFlats.length) return clientView(database, null);
  const state = validate(database);
  if(session.role !== 'admin'){
    const allowed=new Set(residentFlats.map(f=>f.flatNo));
    state.flats=state.flats.map(f=>({...f,mobile:allowed.has(f.flatNo)&&phoneKey(f.mobile)===key?f.mobile:'',contacts:f.contacts.map(c=>({...c,phone:allowed.has(f.flatNo)&&phoneKey(c.phone)===key?c.phone:''}))}));
    state.entries=state.entries.map(e=>allowed.has(e.flatNo)?e:{...e,payer:e.category==='গ্যারেজ ভাড়া (বহিরাগত)'?e.payer:'',note:'',sourceId:'',reference:undefined,receiptNo:undefined,paymentMethod:undefined});
    state.invoices=state.invoices.map(b=>allowed.has(b.flatNo)?b:{...b,note:'',sourceId:''});
    state.reports=state.reports.map(r=>({...r,dues:{},sourceId:'',expenseSourceId:''}));
    state.sources=[];state.reviewItems=[];
  }
  return {revision: database.revision, session: session.role === 'admin' ? {role: 'admin'} : {role:'resident',flat:residentFlats[0],flats:residentFlats.map(f=>({flatNo:f.flatNo,ownerName:f.ownerName}))}, state};
}
function createHandler(store) {
  const loginAttempts = new Map();
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    try {
      if (!['GET', 'POST'].includes(req.method)) return send(405, {error: 'Method not allowed.'});
      if (req.method === 'POST' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) fail(403, 'Request origin is not allowed.');
      const {database, etag} = await store.read();
      const session = readSession(req.headers.cookie, database.auth);
      if (req.method === 'GET') return send(200, clientView(database, session));
      const body = req.body || {};
      const secure = process.env.VERCEL ? '; Secure' : '';
      if (body.action === 'logout') {
        res.setHeader('Set-Cookie', 'bijoy_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + secure);
        return send(200, clientView(database, null));
      }
      if (body.action === 'login') {
        const client = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0];
        const recent = (loginAttempts.get(client) || []).filter(time => time > Date.now() - 60000);
        if (recent.length >= 10) fail(429, 'অনেকবার চেষ্টা হয়েছে। এক মিনিট পরে আবার চেষ্টা করুন।');
        recent.push(Date.now()); loginAttempts.set(client, recent);
        if (loginAttempts.size > 1000) loginAttempts.delete(loginAttempts.keys().next().value);
        let role, flatNo;
        if (body.role === 'admin') {
          if (!checkPin(body.pin, database.auth)) fail(401, 'পিন সঠিক নয়।');
          role = 'admin';
        } else {
          const phone = phoneKey(body.phone);
          const flat = phone.length >= 8 && database.flats.find(f => flatPhones(f).includes(phone));
          if (!flat) fail(401, 'এই মোবাইল নম্বরের কোনো ফ্ল্যাট পাওয়া যায়নি।');
          role = 'resident'; flatNo = 'phone:'+phone;
        }
        res.setHeader('Set-Cookie', 'bijoy_session=' + sessionToken(role, flatNo, database.auth) + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800' + secure);
        return send(200, clientView(database, {role, flatNo}));
      }
      if (session?.role !== 'admin') fail(403, 'ক্যাশিয়ার হিসেবে প্রবেশ করুন।');
      if (body.action !== 'save') fail(400, 'Unknown action.');
      if(database.schemaVersion===2 && body.state?.schemaVersion!==2) fail(409,'সিস্টেম আপডেট হয়েছে। পেজ রিফ্রেশ করুন।');
      if (body.revision !== database.revision) fail(409, 'অন্য কেউ হিসাব পরিবর্তন করেছেন। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।');
      const next = {...database, ...validate(body.state), revision: database.revision + 1, updatedAt: new Date().toISOString()};
      await store.write(next, etag);
      return send(200, clientView(next, session));
    } catch (error) {
      if (!error.status) console.error('Database request failed:', error.code || error.name);
      return send(error.status || 503, {error: error.status ? error.message : 'ডাটাবেসে সংযোগ হয়নি। কিছুক্ষণ পরে আবার চেষ্টা করুন।'});
    }
  };
}
module.exports = {fail, validate, createDatabase, checkPin, localStore, createHandler};
