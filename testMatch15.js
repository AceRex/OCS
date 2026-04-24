const { isLikelyBibleReference } = require('./src/App/controller/smartBibleMatch.js');

console.log("Likely 'First John 4 verse 8':", isLikelyBibleReference("First John 4 verse 8"));
console.log("Likely '1st john 4 vs 8':", isLikelyBibleReference("1st john 4 vs 8"));
console.log("Likely 'Go to verse 8':", isLikelyBibleReference("Go to verse 8"));
