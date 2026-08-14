const numberTranslated = "First John 4 verse 8";

const r = /^\s*(?:go to |jump to |show )?(?:chapter\s+(\d+))?(?:\s*(?:and\s+)?(?:verse|verses|vs|v)\s+(\d+))?\s*$/i;

console.log("First John 4 verse 8:", r.test("First John 4 verse 8"));
console.log("go to verse 8:", r.exec("go to verse 8"));
console.log("chapter 3 verse 5:", r.exec("chapter 3 verse 5"));
console.log("chapter 3:", r.exec("chapter 3"));
console.log("jump to verse 10:", r.exec("jump to verse 10"));

