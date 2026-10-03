import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { CodexModel } from '../shared/types';
import { reasoningEfforts, type ReasoningEffort } from '../shared/types';
import { codexRuntime } from './codex-runtime';

export const validModel = (value: string) => /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(value);
export function globalModel(): string | undefined {
  try {
    const text = fs.readFileSync(
      path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml'),
      'utf8',
    );
    // Only read the top-level model key; no auth, endpoints or unrelated settings leave this function.
    const root = text.split(/^\s*\[/m)[0];
    const model = root.match(/^model\s*=\s*["']([^"']+)["']/m)?.[1];
    return model && validModel(model) ? model : undefined;
  } catch {
    return undefined;
  }
}
let cache: { models: CodexModel[]; at: number } | undefined;
let pending: Promise<CodexModel[]> | undefined;
export const cachedDefaultModel = () => cache?.models.find((m) => m.isDefault)?.id;
export function listModels(force = false): Promise<CodexModel[]> {
  if (!force && cache && Date.now() - cache.at < 300_000) return Promise.resolve(cache.models);
  if (pending) return pending;
  pending = new Promise<CodexModel[]>((resolve, reject) => {
    const child = spawn(
      codexRuntime().executable,
      [
        '-c',
        'model_reasoning_effort="medium"',
        '--disable',
        'plugins',
        '--disable',
        'apps',
        '--disable',
        'hooks',
        'app-server',
        '--stdio',
      ],
      { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let finished = false,
      received = 0,
      requestId = 2;
    const models: CodexModel[] = [];
    const send = (value: unknown) => child.stdin.write(JSON.stringify(value) + '\n');
    const timer = setTimeout(
      () => finish(new Error('读取 Codex 模型目录超时，可稍后重试或手动指定模型。')),
      12_000,
    );
    function finish(error?: Error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      if (error) reject(error);
      else {
        cache = { models, at: Date.now() };
        resolve(models);
      }
    }
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', () => finish(new Error('无法启动 Codex，请检查本机安装。')));
    child.on('close', () => {
      if (!finished) finish(new Error('Codex 模型目录没有完整返回。'));
    });
    createInterface({ input: child.stdout }).on('line', (line) => {
      if ((received += Buffer.byteLength(line)) > 1_000_000) {
        finish(new Error('模型目录响应过大。'));
        return;
      }
      try {
        const event = JSON.parse(line);
        if (event.error) {
          finish(new Error('无法读取 Codex 模型目录，可手动填写模型 ID。'));
          return;
        }
        if (event.id === 1) {
          send({ method: 'initialized', params: {} });
          send({ id: requestId, method: 'model/list', params: { limit: 100 } });
        } else if (event.id === requestId && Array.isArray(event.result?.data)) {
          for (const model of event.result.data)
            if (typeof model.model === 'string' && validModel(model.model))
              models.push({
                id: model.model,
                name: String(model.displayName || model.model),
                description: String(model.description || ''),
                isDefault: model.isDefault === true,
                reasoningEfforts: (Array.isArray(model.supportedReasoningEfforts)
                  ? model.supportedReasoningEfforts
                  : []
                )
                  .map((option: { reasoningEffort?: unknown }) => option.reasoningEffort)
                  .filter((effort: unknown): effort is ReasoningEffort =>
                    reasoningEfforts.includes(effort as ReasoningEffort),
                  ),
                defaultEffort: reasoningEfforts.includes(model.defaultReasoningEffort)
                  ? model.defaultReasoningEffort
                  : undefined,
                supportsFast: Array.isArray(model.serviceTiers)
                  ? model.serviceTiers.some(
                      (tier: { id?: string }) => tier.id === 'priority' || tier.id === 'fast',
                    )
                  : Array.isArray(model.additionalSpeedTiers) && model.additionalSpeedTiers.includes('fast'),
              });
          if (event.result.nextCursor && models.length < 500)
            send({
              id: ++requestId,
              method: 'model/list',
              params: { limit: 100, cursor: event.result.nextCursor },
            });
          else finish();
        }
      } catch {
        /* non-protocol diagnostics */
      }
    });
    send({
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'jianzhi', title: '渐知 · Jianzhi', version: '0.2.0' } },
    });
  }).finally(() => {
    pending = undefined;
  });
  return pending;
}
