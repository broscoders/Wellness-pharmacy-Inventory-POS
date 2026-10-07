const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const connectDB = require('./config/db');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

app.set('trust proxy', 1); // behind Vercel's proxy: needed for correct client IP in rate limiting
app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      // allow same-origin / server-to-server (no Origin header) and whitelisted frontends
      if (!origin || env.clientUrls.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
if (!env.isProd) app.use(morgan('dev'));

app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

// Ensure DB is connected before any route (works for both long-running server and serverless).
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

app.get('/', (req, res) => res.json({ name: 'Wellness Pharmacy API', status: 'running' }));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
