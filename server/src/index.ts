import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { env } from './env.js';
import { HttpError } from './util.js';
import { authRouter } from './routes/auth.js';
import { rostersRouter } from './routes/rosters.js';
import { playersRouter } from './routes/players.js';
import { seriesRouter } from './routes/series.js';
import { gamesRouter } from './routes/games.js';
import { scoutingReportsRouter } from './routes/scoutingReports.js';
import { meRouter } from './routes/me.js';
import { requireAuth } from './auth.js';

const app = express();

const allowedOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
  })
);
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/auth', authRouter);
app.use('/me', requireAuth, meRouter);
app.use('/rosters', requireAuth, rostersRouter);
app.use('/players', requireAuth, playersRouter);
app.use('/series', requireAuth, seriesRouter);
app.use('/games', requireAuth, gamesRouter);
app.use('/scouting-reports', requireAuth, scoutingReportsRouter);

app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', issues: err.issues });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
);

app.listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT}`);
});
