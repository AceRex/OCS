const regex = /\b(?:go to |jump to |show |let's look at |what about |read )?(?:chapter\s+(\d+)(?:\s*(?:and\s+)?(?:verse|verses|vs|v)\s+(\d+))?|(?:verse|verses|vs|v)\s+(\d+))\b/i;

console.log("hello chapter 3", "hello chapter 3".match(regex));
console.log("hello chapter 3 verse 5", "hello chapter 3 verse 5".match(regex));
console.log("okay let's look at verse 5", "okay let's look at verse 5".match(regex));
console.log("hello", "hello".match(regex));
