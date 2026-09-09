const {createHandler} = require('../lib/database.cjs');
module.exports = createHandler(require('../lib/blob-store.cjs'));
