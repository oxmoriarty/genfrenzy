import express     from 'express';
import { createServer } from 'http';
import { Server }     from 'socket.io';
import cors           from 'cors';
import dotenv         from 'dotenv';
import { register }   from './socketHandlers';
import { redis }      from './redisClient';

dotenv.config();

const PORT         = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const app  = express();
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

const http = createServer(app);
const io   = new Server(http, {
  cors: { origin: FRONTEND_URL, methods: ['GET','POST'], credentials: true },
  transports: ['websocket','polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on('connection', socket => {
  console.log(`[Socket] + ${socket.id}`);
  register(io, socket);
});

http.listen(PORT, () => {
  console.log(`[Server] GenFrenzy v2 running on :${PORT}`);
  console.log(`[Server] Accepting: ${FRONTEND_URL}`);
});

process.on('SIGTERM', () => { http.close(() => { redis.disconnect(); process.exit(0); }); });
