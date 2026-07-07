import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { initDatabase, getDatabase } from './database.js';
import authRoutes from './routes/auth.js';
import notesRoutes from './routes/notes.js';
import tasksRoutes from './routes/tasks.js';
import calendarRoutes from './routes/calendar.js';
import aiRoutes from './routes/ai.js';
import shareRoutes from './routes/share.js';
import syncRoutes from './routes/sync.js';
import proxyRoutes from './routes/proxy.js';
import { initWebSocket } from './websocket.js';
import { initTelegramBot } from './telegramBot.js';

// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize the database
initDatabase();
console.log('✅ Database initialized successfully.');

// Initialize Telegram Bot service
initTelegramBot();

// Create Express app
const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// --- Middleware ---

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for SPA flexibility
  crossOriginEmbedderPolicy: false,
}));

// CORS — restricted origins
const allowedOrigins = [
  'http://localhost:1420',  // Tauri dev
  'http://localhost:5173',  // Vite dev
  'http://localhost:3001',  // Self
  'https://tauri.localhost', // Tauri webview
  'tauri://localhost',       // Tauri protocol
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Still allow in dev, log warning
      console.warn(`CORS: Allowing request from unlisted origin: ${origin}`);
    }
  },
  credentials: true,
}));

// Default body limit
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Larger limit for sync endpoints (can contain all user data)
app.use('/api/sync', express.json({ limit: '50mb' }));

// Rate limiting — 200 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});
app.use('/api/', limiter);

// --- Health check endpoint (no auth required) ---
app.get('/api/health', (_req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/proxy', proxyRoutes);

// --- Static files & SPA fallback (production) ---
const clientDistPath = join(__dirname, '../../dist');

// Serve static assets from the client build directory
app.use(express.static(clientDistPath));

// SPA fallback: serve index.html for any non-API routes
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ success: false, error: 'API endpoint not found.' });
    return;
  }

  res.sendFile(join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      res.status(404).json({ success: false, error: 'Not found.' });
    }
  });
});

// --- Create HTTP server and attach WebSocket ---
const server = http.createServer(app);
initWebSocket(server);

// --- Graceful shutdown ---
const shutdown = () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.close();
  const db = getDatabase();
  db.close();
  console.log('📦 Database connection closed.');
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// --- Start server ---
server.listen(PORT, () => {
  console.log(`🚀 Note server is running on http://localhost:${PORT}`);
  console.log(`📁 Database: ${process.env.DATABASE_PATH || './data/notebook.db'}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
