const { smartBibleMatch, BOOK_ALIASES } = require('./src/App/controller/smartBibleMatch.js');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./src/Bible/bibles.db');
db.all("SELECT * FROM books ORDER BY id", [], async (err, books) => {
    console.log("1 corinthians 5 verse 1 => ", await smartBibleMatch("1 corinthians 5 verse 1", books, null, null));
    console.log("1st corinthians 5 verse 1 => ", await smartBibleMatch("1st corinthians 5 verse 1", books, null, null));
    console.log("first corinthians 5 verse 1 => ", await smartBibleMatch("first corinthians 5 verse 1", books, null, null));
    console.log("one corinthians 5 verse 1 => ", await smartBibleMatch("one corinthians 5 verse 1", books, null, null));
});
