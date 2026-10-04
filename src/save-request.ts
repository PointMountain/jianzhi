import type { Bootstrap } from '../shared/types';
import { request } from './lib';
import { readLocal, writeLocal } from './learning-state';

type PendingSave = { id: string; payload: string };
const pendingSaves = new Map<string, PendingSave>();

// An unknown response is reconciled before retry. The server also deduplicates the same request.
export async function saveRequest<T = Bootstrap>(
  url: string,
  body: unknown,
  scope: string,
  signal?: AbortSignal,
): Promise<T> {
  const key = `jianzhi:pending-save:${JSON.stringify([scope, url])}`;
  const payload = JSON.stringify(body);
  const previous = pendingSaves.get(key) ?? readLocal<PendingSave | null>(key, null);
  const clear = () => {
    pendingSaves.delete(key);
    writeLocal(key, null);
  };
  const sameInput = (saved: string) => {
    try {
      const previousBody = JSON.parse(saved);
      const nextBody = JSON.parse(payload);
      // Time keeps advancing while a failed save is retried. Preserve the first submitted duration.
      if (url === '/reviews') {
        delete previousBody.seconds;
        delete nextBody.seconds;
      }
      return JSON.stringify(previousBody) === JSON.stringify(nextBody);
    } catch {
      return false;
    }
  };
  const retry = typeof previous?.payload === 'string' && sameInput(previous.payload);
  const pending = retry ? previous! : { id: crypto.randomUUID(), payload };
  const reconcile = async () => {
    const data = await request('/bootstrap');
    const course = data.state.courses.find((c) => c.creationRequest?.id === pending.id);
    const saved =
      course ||
      [...data.state.notes, ...data.state.reviews].some((r) => r.creationRequest?.id === pending.id);
    return saved ? ({ ...data, ...(course ? { courseId: course.id } : {}) } as T) : undefined;
  };
  if (retry) {
    const saved = await reconcile();
    if (saved) {
      clear();
      return saved;
    }
  }
  writeLocal(key, pending);
  pendingSaves.set(key, pending);
  try {
    const response = await fetch(`/api${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.id },
      body: pending.payload,
      signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '保存没有完成，请重试。');
    clear();
    return data as T;
  } catch (error) {
    // A deliberate stop keeps the receipt for the next attempt without navigating away.
    if (signal?.aborted) throw error;
    const saved = await reconcile().catch(() => undefined);
    if (saved) {
      clear();
      return saved;
    }
    throw new Error(`${(error as Error).message} 输入已保留；重试时会先核对已保存结果。`);
  }
}
