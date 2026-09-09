const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function validate(data) {
  if (!data || !Array.isArray(data.flats) || !Array.isArray(data.entries) || data.flats.length > 1000 || data.entries.length > 30000) fail(400, 'Invalid database records.');
  const text = (v, max = 250, required = false) => {
    if (typeof v !== 'string' || v.length > max || (required && !v.trim())) fail(400, 'Invalid text field.');
    return v.trim();
  };
  const ids = new Set();
  const flats = data.flats.map(f => {
    if (!f || typeof f !== 'object') fail(400, 'Invalid flat record.');
    const flat = {flatNo: text(f.flatNo, 30, true), ownerName: text(f.ownerName, 150, true), mobile: text(f.mobile, 30)};
    if (ids.has(flat.flatNo)) fail(400, 'Duplicate flat number.');
    ids.add(flat.flatNo); return flat;
  });
  ids.clear();
  const entries = data.entries.map(e => {
    if (!e || typeof e !== 'object') fail(400, 'Invalid transaction record.');
    if (!['income', 'cost'].includes(e.type) || !Number.isFinite(e.amount) || e.amount <= 0 || e.amount > 1e10 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(e.month)) fail(400, 'Invalid transaction.');
    const entry = {id: text(e.id, 100, true), type: e.type, category: text(e.category, 150, true), amount: e.amount, month: e.month, flatNo: text(e.flatNo, 30), note: text(e.note, 2000)};
    if (ids.has(entry.id)) fail(400, 'Duplicate transaction.');
    ids.add(entry.id); return entry;
  });
  return {flats, entries};
}
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
function sessionToken(role, flatNo, auth) {
  const payload = Buffer.from(JSON.stringify({role, flatNo, expires: Date.now() + 8 * 3600 * 1000})).toString('base64url');
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
        await fs.rename(temporary, filename);
      } finally { await fs.rm(temporary, {force: true}).catch(() => {}); }
      return {database, etag: String(database.revision)};
    });
    queue = operation.catch(() => {}); return operation;
  }
  return {read, write};
}
function clientView(database, session) {
  if (!session) return {session: null, state: {flats: [], entries: [], pin: 'configured'}, revision: database.revision};
  const flat = database.flats.find(f => f.flatNo === session.flatNo);
  if (session.role === 'resident' && !flat) return clientView(database, null);
  return {revision: database.revision, session: session.role === 'admin' ? {role: 'admin'} : {role: 'resident', flat},
    state: {flats: session.role === 'admin' ? database.flats : [flat], entries: database.entries, pin: 'configured'}};
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
          const phone = String(body.phone || '').replace(/\D/g, '').slice(-11);
          const flat = phone.length === 11 && database.flats.find(f => f.mobile.replace(/\D/g, '').slice(-11) === phone);
          if (!flat) fail(401, 'এই মোবাইল নম্বরের কোনো ফ্ল্যাট পাওয়া যায়নি।');
          role = 'resident'; flatNo = flat.flatNo;
        }
        res.setHeader('Set-Cookie', 'bijoy_session=' + sessionToken(role, flatNo, database.auth) + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800' + secure);
        return send(200, clientView(database, {role, flatNo}));
      }
      if (session?.role !== 'admin') fail(403, 'ক্যাশিয়ার হিসেবে প্রবেশ করুন।');
      if (body.action !== 'save') fail(400, 'Unknown action.');
      if (body.revision !== database.revision) fail(409, 'অন্য কেউ হিসাব পরিবর্তন করেছেন। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।');
      const next = {...database, ...validate(body.state), revision: database.revision + 1, updatedAt: new Date().toISOString()};
      await store.write(next, etag);
      return send(200, clientView(next, session));
    } catch (error) {
      if (!error.status) console.error('Database request failed:', error.name);
      return send(error.status || 503, {error: error.status ? error.message : 'ডাটাবেসে সংযোগ হয়নি। কিছুক্ষণ পরে আবার চেষ্টা করুন।'});
    }
  };
}
module.exports = {fail, validate, createDatabase, checkPin, localStore, createHandler};
