const mongoose = require('mongoose');
const env = require('./env');

// Cached connection: required so Vercel serverless invocations reuse the connection.
let cached = global.__mongoose;
if (!cached) cached = global.__mongoose = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    mongoose.set('strictQuery', true);
    cached.promise = mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  }
  try {
    cached.conn = await cached.promise;
    if (!cached.logged) {
      cached.logged = true;
      const { host, name } = cached.conn.connection;
      console.log(`✅ MongoDB connected successfully (host: ${host}, database: ${name})`);
    }
  } catch (err) {
    console.error(`❌ MongoDB connection FAILED: ${err.message}`);
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}

connectDB.status = () =>
  ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';

module.exports = connectDB;
