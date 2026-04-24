const { smartBibleMatch, isLikelyBibleReference, BOOK_ALIASES } = require('./src/App/controller/smartBibleMatch.js');

async function testIt() {
    const mockBooks = [];
    for (let i = 0; i < 66; i++) mockBooks.push({ name: `Book ${i}` });
    mockBooks[42] = { name: 'John' };
    mockBooks[61] = { name: '1 John' };
    
    const cmds = [
        "First John 4 verse 8",
        "1st John 4 verse 8",
        "1 John 4 verse 8",
        "first john 4 verse 8",
        "1 john 4:8"
    ];
    
    for (const cmd of cmds) {
        console.log(`\nCMD: "${cmd}"`);
        console.log("Likely:", isLikelyBibleReference(cmd));
        const res = await smartBibleMatch(cmd, mockBooks, null);
        console.log("Result:", res);
    }
}

testIt();
