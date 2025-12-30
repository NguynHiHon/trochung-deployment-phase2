// server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const cloudinary = require('cloudinary').v2;

const authRouter = require('./routers/auth');
const userRouter = require('./routers/user');
const userInfoRouter = require('./routers/userInfo');
const postRouter = require('./routers/post');
const favoriteRouter = require('./routers/favorite');
const supportRouter = require('./routers/support');
const commentsRouter = require('./routers/comments');
const ratingsRouter = require('./routers/ratings');
const cloudinaryRouter = require('./routers/cloudinary');
const paymentRouter = require('./routers/payment');

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME || 'demo',
  api_key: process.env.API_KEY || 'demo',
  api_secret: process.env.API_SECRET || 'demo'
});

const app = express();

// If the app is behind a proxy (Render, Heroku, etc.), enable trust proxy
// so req.secure and req.protocol reflect the original request protocol.
app.set('trust proxy', true);

// CORS configuration - explicitly allow the frontend origins and enable credentials
const whitelist = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  // add your deployed frontend origin here when available, e.g.
  // 'https://your-frontend.example.com'
];

// If FRONTEND_URL is set in environment (recommended for deploy), add it to whitelist
if (process.env.FRONTEND_URL) {
  try {
    // Normalize FRONTEND_URL: trim and remove any trailing slashes so
    // origin comparisons are consistent (Origin headers never include a trailing slash).
    const url = process.env.FRONTEND_URL.trim().replace(/\/+$|\/$/g, '').replace(/\s+/g, '');
    if (url && whitelist.indexOf(url) === -1) whitelist.push(url);
  } catch (e) {
    console.error('Invalid FRONTEND_URL env var:', process.env.FRONTEND_URL);
  }
}

console.log('CORS whitelist:', whitelist);

const corsOptions = {
  origin: function (origin, callback) {
    // Debug/log origin and allow localhost patterns for dev
    console.log('CORS origin check, incoming Origin header:', origin);
    // normalize incoming origin (strip trailing slash) for safe comparison
    const normalizedOrigin = typeof origin === 'string' ? origin.replace(/\/+$/g, '') : origin;
    console.log('CORS normalized origin:', normalizedOrigin);
    // allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (whitelist.indexOf(normalizedOrigin) !== -1) {
      return callback(null, true);
    }
    // allow any localhost origin (http://localhost:3000 or 127.0.0.1 variants)
    if (typeof normalizedOrigin === 'string' && (normalizedOrigin.includes('localhost') || normalizedOrigin.includes('127.0.0.1'))) {
      return callback(null, true);
    }

    // Allow Vercel preview and production domains (e.g. *.vercel.app)
    // This is useful when your front-end is deployed as preview apps on Vercel
    // which generate dynamic subdomains like
    // `trochung-deployment-fe-phase2-hwoa72ovm-...vercel.app`.
    // IMPORTANT: because credentials are enabled, allow only vercel.app suffix
    // if you trust all Vercel preview builds for this project.
    if (typeof normalizedOrigin === 'string' && normalizedOrigin.endsWith('.vercel.app')) {
      console.log('Allowing Vercel origin:', normalizedOrigin);
      return callback(null, true);
    }
    console.warn('CORS check failed. Whitelist:', whitelist);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'token'],
  exposedHeaders: ['Set-Cookie']
};

// Use CORS middleware (it will handle preflight OPTIONS requests)
app.use(cors(corsOptions));

const mongoUrl = process.env.MONGO_URL;
console.log("Attempting to connect to:",
  mongoUrl ? mongoUrl.replace(/:[^:@]*@/, ":****@") : "undefined"
);

mongoose.connect(process.env.MONGO_URL, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => console.log("✅ Connected to MongoDB successfully"))
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error.message);
    console.log("\n🔧 Troubleshooting steps:");
    console.log("1. Check IP whitelist in MongoDB Atlas");
    console.log("2. Verify username/password");
    console.log("3. Make sure cluster is running");
  });

// ===================== Middleware =====================


app.use(cookieParser());
app.use(express.json());

// Public folder cho ảnh/video nếu lưu local

// Debug request
app.use((req, res, next) => {
  console.log(`🔥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  next();
});

app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/user-info', userInfoRouter);
app.use('/api/posts', postRouter); // ✅ API đăng bài
app.use('/api/favorites', favoriteRouter);
app.use('/api/support', supportRouter);
app.use('/api/cloudinary', cloudinaryRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/ratings', ratingsRouter);
app.use('/api/payments', paymentRouter);

// ensure tmp folder exists for multer
const fs = require('fs');
const tmpDir = './tmp';
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
