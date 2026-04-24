const regex = /\b(?:go to |jump to |show |let's look at )?(?:chapter\s+(\d+))?(?:\s*(?:and\s+)?(?:verse|verses|vs|v)\s+(\d+))\b/i;
const regex2 = /\b(?:go to |jump to |show |let's look at )?(?:chapter\s+(\d+))?(?:\s*(?:and\s+)?(?:verse|verses|vs|v)\s+(\d+))?\b/i;

console.log("chapter 3", "chapter 3".match(regex));
console.log("chapter 3", "chapter 3".match(regex2));
console.log("verse 5", "verse 5".match(regex2));
console.log("hello", "hello".match(regex2));
