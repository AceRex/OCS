const os = require('os');
module.exports = { address: () => Object.values(os.networkInterfaces()).flat().find(entry => entry && entry.family === 'IPv4' && !entry.internal)?.address || '127.0.0.1' };
