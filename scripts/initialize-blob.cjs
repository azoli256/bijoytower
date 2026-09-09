const fs = require('node:fs/promises');
const {get, put} = require('@vercel/blob');
async function main() {
  if (await get('database.json', {access:'private', useCache:false})) throw new Error('Database already exists; initialization will not overwrite it.');
  const source = await fs.readFile('data/database.json', 'utf8');
  const data = JSON.parse(source);
  if (data.flats.length || data.entries.length) throw new Error('Initialization expects an empty database.');
  await put('database.json', source, {access:'private', addRandomSuffix:false, allowOverwrite:false, contentType:'application/json', cacheControlMaxAge:60});
  console.log('Private database.json created. Credentials remain in data/PRIVATE-ACCESS.txt.');
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
