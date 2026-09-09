const {get, put, BlobPreconditionFailedError} = require('@vercel/blob');
const {fail, validate} = require('./database.cjs');
const pathname = 'database.json';
module.exports = {
  async read() {
    const result = await get(pathname, {access: 'private', useCache: false});
    if (!result || result.statusCode !== 200) fail(503, 'Database file is not initialized.');
    const database = await new Response(result.stream).json();
    validate(database);
    if (database.version !== 1 || !database.auth?.hash) fail(503, 'Database file is invalid.');
    return {database, etag: result.blob.etag};
  },
  async write(database, etag) {
    try {
      const result = await put(pathname, JSON.stringify(database, null, 2), {
        access: 'private', contentType: 'application/json', addRandomSuffix: false,
        allowOverwrite: true, ifMatch: etag, cacheControlMaxAge: 60
      });
      return {database, etag: result.etag};
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) fail(409, 'অন্য কেউ হিসাব পরিবর্তন করেছেন। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।');
      throw error;
    }
  }
};
