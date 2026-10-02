import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('../', import.meta.url));

export function resolveWorkspace(root = appDir, override = process.env.STUDY_DATA_DIR): string {
  if (override?.trim()) {
    if (!path.isAbsolute(override)) throw new Error('STUDY_DATA_DIR 请使用学习空间的绝对路径。');
    return path.resolve(override);
  }
  // Never silently replace an older installation's records with an empty bookshelf.
  if (fs.existsSync(path.join(root, '.data/study.json')))
    throw new Error(
      '发现旧版 .data/study.json。请先停止服务并迁移学习数据，或用 STUDY_DATA_DIR 指向旧数据目录。',
    );
  return path.resolve(root, '../学习空间');
}

export function prepareWorkspace(directory: string, courseIds: string[]) {
  for (const folder of ['topics', 'exports', 'backups'])
    fs.mkdirSync(path.join(directory, folder), { recursive: true, mode: 0o700 });
  for (const id of courseIds) {
    // Imported version-1 records may contain nonstandard IDs; never use them as paths.
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id)) continue;
    for (const folder of ['source', 'context', 'exercises'])
      fs.mkdirSync(path.join(directory, 'topics', id, folder), { recursive: true, mode: 0o700 });
  }
}
