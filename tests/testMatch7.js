const { smartBibleMatch } = require('./src/App/controller/smartBibleMatch.js');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./src/Bible/bibles.db');
db.all("SELECT * FROM books ORDER BY id", [], async (err, books) => {
    console.log("1 john 4 => ", await smartBibleMatch("1 john 4", books, null, null));
    console.log("one john 4 => ", await smartBibleMatch("one john 4", books, null, null));
    console.log("first john 4 => ", await smartBibleMatch("first john 4", books, null, null));
    console.log("1st john 4 => ", await smartBibleMatch("1st john 4", books, null, null));
});
