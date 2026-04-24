const { smartBibleMatch, isLikelyBibleReference, BOOK_ALIASES } = require('./src/App/controller/smartBibleMatch.js');

async function testIt() {
    const mockBooks = [];
    for (let i = 0; i < 66; i++) mockBooks.push({ name: `Book ${i}` });
    mockBooks[42] = { name: 'John' };
    mockBooks[61] = { name: '1 John' };
    
    console.log("Likely 1:", isLikelyBibleReference("1 John 4 verse 8"));
    const res1 = await smartBibleMatch("1 John 4 verse 8", mockBooks, null);
    console.log("res 1:", res1);
    
    console.log("Likely 2:", isLikelyBibleReference("1st John 4 verse 8"));
    const res2 = await smartBibleMatch("1st John 4 verse 8", mockBooks, null);
    console.log("res 2:", res2);
}

testIt();
