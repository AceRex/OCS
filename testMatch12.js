const { smartBibleMatch, isLikelyBibleReference, BOOK_ALIASES } = require('./src/App/controller/smartBibleMatch.js');

async function testIt() {
    const mockBooks = [];
    for (let i = 0; i < 66; i++) mockBooks.push({ name: `Book ${i}` });
    mockBooks[61] = { name: '1 John' }; // Index 61 is 1 John
    
    console.log("Likely:", isLikelyBibleReference("First John 4 verse 8"));
    const res1 = await smartBibleMatch("First John 4 verse 8", mockBooks, null);
    console.log("smartBibleMatch:", res1);
    
    console.log("Likely:", isLikelyBibleReference("1st John 4 verse 8"));
    const res2 = await smartBibleMatch("1st John 4 verse 8", mockBooks, null);
    console.log("smartBibleMatch:", res2);
}

testIt();
