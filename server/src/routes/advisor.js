import { Router } from 'express';
import { generateBriefing, latestBriefing } from '../advisor/briefing.js';
import { ask } from '../advisor/ask.js';
import { auditCategories } from '../advisor/audit.js';

export const advisorRouter = Router();

advisorRouter.get('/briefing', async (_req, res, next) => {
  try {
    res.json(await latestBriefing());
  } catch (err) { next(err); }
});

advisorRouter.post('/briefing', async (_req, res, next) => {
  try {
    res.json(await generateBriefing());
  } catch (err) { next(err); }
});

advisorRouter.post('/audit-categories', async (_req, res, next) => {
  try {
    res.json(await auditCategories());
  } catch (err) { next(err); }
});

advisorRouter.post('/ask', async (req, res, next) => {
  try {
    const { question, history } = req.body || {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question required' });
    }
    res.json(await ask(question, Array.isArray(history) ? history.slice(-10) : []));
  } catch (err) { next(err); }
});
