const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {createDatabase, localStore, createHandler} = require('./lib/database.cjs');
async function start({port = Number(process.env.PORT || 3000), dataDir = path.join(__dirname, 'data')} = {}) {
  await fs.mkdir(dataDir, {recursive: true});
  const filename = path.join(dataDir, 'database.json');
  try {
    await fs.access(filename);
  } catch {
    const pin = crypto.randomInt(10000000, 100000000).toString();
    await fs.writeFile(filename, JSON.stringify(createDatabase(pin), null, 2), {flag: 'wx', mode: 0o600});
    await fs.writeFile(path.join(dataDir, 'PRIVATE-ACCESS.txt'), 'Bijoy Tower cashier PIN: ' + pin + '\nKeep this file private.\n', {flag: 'wx', mode: 0o600});
  }
  const handler = createHandler(localStore(filename));
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/database') {
        if (req.method === 'POST') {
          if (!String(req.headers['content-type']).startsWith('application/json')) { res.writeHead(415); return res.end(); }
          let body = '';
          for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4 * 1024 * 1024) { res.writeHead(413); return res.end(); } }
          try { req.body = JSON.parse(body); } catch { res.writeHead(400); return res.end(JSON.stringify({error: 'Invalid JSON.'})); }
        }
        return handler(req, res);
      }
      if (req.method === 'GET' && ['/', '/index.html'].includes(url.pathname)) {
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache'});
        return res.end(await fs.readFile(path.join(__dirname, 'index.html')));
      }
      if(req.method==='GET' && ['/app.js','/style.css','/accounting.js'].includes(url.pathname)){
        res.writeHead(200, {'Content-Type':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-cache'});
        return res.end(await fs.readFile(path.join(__dirname,'web',url.pathname.slice(1))));
      }
      res.writeHead(404); res.end('Not found');
    } catch { res.writeHead(500); res.end('Server error'); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return server;
}
if (require.main === module) start().then(server => console.log('Bijoy Tower: http://localhost:' + server.address().port + '\nDatabase: data/database.json\nCashier PIN: data/PRIVATE-ACCESS.txt')).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {start};
