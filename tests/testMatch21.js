const regex2 = /\b(?:go to |jump to |show |let's look at )?(?:chapter\s+(\d+))?(?:\s*(?:and\s+)?(?:verse|verses|vs|v)\s+(\d+))?\b/i;

console.log("hello chapter 3", "hello chapter 3".match(regex2));
