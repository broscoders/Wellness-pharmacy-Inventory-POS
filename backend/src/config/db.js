const dns = require('dns');
const mongoose = require('mongoose');
const env = require('./env');

// Some ISPs / routers time out on the DNS SRV lookup that mongodb+srv:// needs
// (error: "querySrv ETIMEOUT"). Setting DNS_SERVERS=8.8.8.8,1.1.1.1 in .env makes Node use Google/Cloudflare DNS.
if (process.env.DNS_SERVERS) {
  dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean));
}

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
    if (/querySrv|ETIMEOUT|ENOTFOUND/.test(err.message)) {
      console.error('   Hint: this is a DNS problem on this network. Add  DNS_SERVERS=8.8.8.8,1.1.1.1  to backend/.env, or use the non-SRV (mongodb://) connection string from Atlas, or try another network/hotspot.');
    }
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}

connectDB.status = () =>
  ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';

module.exports = connectDB;
