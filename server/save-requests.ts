import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Bootstrap } from '../shared/types';
import { getState } from './store';

// Receipts live with their records, in the same atomic JSON write. No separate ledger can drift.
export function saveRequests(bootstrap: () => Bootstrap): RequestHandler {
  const pending = new Set<string>();
  const routes = ['/api/courses', '/api/generate', '/api/repositories/import', '/api/notes', '/api/reviews'];
  return (req, res, next) => {
    if (req.method !== 'POST' || !routes.includes(req.path)) return next();
    const id = req.get('Idempotency-Key');
    if (!id) return next(); // Existing version 1 clients remain compatible.
    if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) {
      res.status(400).json({ error: '保存请求标识无效。' });
      return;
    }
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([req.path, req.body]))
      .digest('hex');
    const state = getState();
    const course = state.courses.find((c) => c.creationRequest?.id === id);
    const existing = course ?? [...state.notes, ...state.reviews].find((r) => r.creationRequest?.id === id);
    if (existing) {
      if (existing.creationRequest?.fingerprint !== fingerprint) {
        res.status(409).json({ error: '该请求已保存其他内容，请重新发起。' });
      } else {
        res.json({ ...bootstrap(), ...(course ? { courseId: course.id } : {}) });
      }
      return;
    }
    if (pending.has(id)) {
      res.status(409).json({ error: '上次请求仍在处理中，输入已保留。请稍后重试以核对结果。' });
      return;
    }
    pending.add(id);
    res.once('close', () => pending.delete(id));
    res.locals.creationRequest = { id, fingerprint };
    next();
  };
}
