const { smartBibleMatch, BOOK_ALIASES } = require('./src/App/controller/smartBibleMatch.js');
const books = [{name: '1 Corinthians'}];
smartBibleMatch("1 corinthians 5 verse 1", books, null, null).then(console.log);
