const { smartBibleMatch, BOOK_ALIASES } = require('./src/App/controller/smartBibleMatch.js');

async function testIt() {
    const mockBooks = [{ name: 'Genesis' }, { name: '1 John' }, { name: 'John' }];
    const res1 = await smartBibleMatch("and then they have genesis 1 3", mockBooks, null);
    console.log(res1);
    const res2 = await smartBibleMatch("read 1 john 4 vs 8 please", mockBooks, null);
    console.log(res2);
    const res3 = await smartBibleMatch("turn to the book of genesis 5 and read it", mockBooks, null);
    console.log(res3);
}

testIt();
