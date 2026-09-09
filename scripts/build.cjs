const fs = require('node:fs');
fs.mkdirSync('public', {recursive: true});
fs.copyFileSync('index.html', 'public/index.html');
for (const name of ['app.js','style.css','accounting.js']) fs.copyFileSync('web/'+name,'public/'+name);
