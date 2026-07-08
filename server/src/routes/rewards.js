import { Router } from 'express';
import { rewardsSummary, setBalance } from '../rewards/engine.js';

export const rewardsRouter = Router();

rewardsRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await rewardsSummary());
  } catch (err) { next(err); }
});

// Manual point-balance entry (Plaid can't pull loyalty balances).
rewardsRouter.put('/balances', async (req, res, next) => {
  try {
    const { program, balance } = req.body || {};
    if (!program || balance == null || Number.isNaN(Number(balance))) {
      return res.status(400).json({ error: 'program and numeric balance required' });
    }
    res.json(await setBalance(program, balance));
  } catch (err) { next(err); }
});
