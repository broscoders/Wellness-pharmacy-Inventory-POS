// Vercel serverless entry: every request is routed here (see vercel.json).
const env = require('../src/config/env');
env.validateEnv();
module.exports = require('../src/app');
