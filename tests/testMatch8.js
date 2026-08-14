const { isLikelyBibleReference, smartBibleMatch, BOOK_ALIASES } = require('./src/App/controller/smartBibleMatch.js');

const aliases = Object.keys(BOOK_ALIASES).sort((a, b) => b.length - a.length);

function testLikely(rawText) {
    let t = rawText.toLowerCase().replace(/[,;.]/g, ' ');
    t = t.replace(/\b(the book of|book of|read|please|open|to|go to|jump to|show)\b/g, ' ').trim();
    for (const alias of aliases) {
        const regex = new RegExp(`(?:^|\\s)${alias}\\s+\\d+`, 'i');
        if (regex.test(t)) {
            return true;
        }
    }
    return false;
}

console.log(testLikely("and then they have genesis 1 3"));
console.log(testLikely("can we read 1 john 4 vs 8 please"));

