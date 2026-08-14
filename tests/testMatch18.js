const { smartBibleMatch, isLikelyBibleReference, BOOK_ALIASES } = require('./src/App/controller/smartBibleMatch.js');

async function testIt() {
    const mockBooks = [];
    for (let i = 0; i < 66; i++) mockBooks.push({ id: `book${i}`, name: `Book ${i}` });
    mockBooks[42] = { id: 'john', name: 'John' };
    
    const mockBible = {
        searchVerses: async (query, version, limit) => {
            console.log("Searching for:", query);
            return [{ book_id: 'john', chapter: 3, verse: 16, text: "For God so loved the world" }];
        }
    };
    
    console.log("--- Normal Mode ---");
    const res1 = await smartBibleMatch("For God so loved the world", mockBooks, mockBible, null, false);
    console.log("Result:", res1);
    
    console.log("--- Mid Speech Mode ---");
    const res2 = await smartBibleMatch("For God so loved the world", mockBooks, mockBible, null, true);
    console.log("Result:", res2);
    
    console.log("--- Mid Speech Mode (Short) ---");
    const res3 = await smartBibleMatch("For God", mockBooks, mockBible, null, true);
    console.log("Result:", res3);
}

testIt();
