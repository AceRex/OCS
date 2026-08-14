const { smartBibleMatch } = require('./src/App/controller/smartBibleMatch.js');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./src/Bible/bibles.db');
db.all("SELECT * FROM books ORDER BY id", [], (err, books) => {
    smartBibleMatch("1 corinthians 5 verse 1", books, null, null).then(console.log);
});
