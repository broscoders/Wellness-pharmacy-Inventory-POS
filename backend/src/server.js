const env = require('./config/env');
env.validateEnv();
const app = require('./app');
const connectDB = require('./config/db');

connectDB()
  .then(() => {
    app.listen(env.port, () => console.log(`🚀 API running on http://localhost:${env.port} (${env.nodeEnv})`));
  })
  .catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
