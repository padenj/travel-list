import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware';
import { PaymentMethodError, PaymentMethodRepository } from '../repositories/paymentMethodRepository';

export const paymentMethodRouter = Router();
const repo = new PaymentMethodRepository();

function familyOf(req: Request, res: Response): string | null {
  const familyId = req.user?.familyId;
  if (!familyId) {
    res.status(403).json({ error: 'Payment methods belong to a family' });
    return null;
  }
  return familyId;
}

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof PaymentMethodError) return res.status(error.status).json({ error: error.message });
  return res.status(500).json({ error: fallback });
}

paymentMethodRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  const familyId = familyOf(req, res);
  if (!familyId) return;
  try {
    const includeArchived = req.query.includeArchived === '1' || req.query.includeArchived === 'true';
    res.json(await repo.list(familyId, includeArchived));
  } catch (error) {
    sendError(res, error, 'Failed to list payment methods');
  }
});

paymentMethodRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  const familyId = familyOf(req, res);
  if (!familyId) return;
  try {
    res.status(201).json(await repo.create(familyId, req.body?.nickname));
  } catch (error) {
    sendError(res, error, 'Failed to create payment method');
  }
});

paymentMethodRouter.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const familyId = familyOf(req, res);
  if (!familyId) return;
  try {
    const { nickname, archived } = req.body ?? {};
    res.json(await repo.update(familyId, req.params.id, { nickname, archived }));
  } catch (error) {
    sendError(res, error, 'Failed to update payment method');
  }
});

paymentMethodRouter.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const familyId = familyOf(req, res);
  if (!familyId) return;
  try {
    await repo.remove(familyId, req.params.id);
    res.status(204).send();
  } catch (error) {
    sendError(res, error, 'Failed to delete payment method');
  }
});
