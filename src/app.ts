import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import docsRouter from './routes/docs.routes';
import accountRouter from './routes/account.routes';
import authRouter from './routes/auth.routes';
import bankAccountsRouter from './routes/bankAccounts.routes';

dotenv.config();

export const createApp = (): Application => {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'api-bnc' });
  });

  app.use('/api/docs', docsRouter);
  app.use('/api/account', accountRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/bank-accounts', bankAccountsRouter);

  return app;
};

