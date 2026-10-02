import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { splitMarkdown } from './domain';
import type { Course, DirectoryListing, RepositoryFile, RepositoryScan } from '../shared/types';

const excluded = new Set([
  'node_modules',
  'vendor',
  'dist',
  'build',
  'coverage',
  'target',
  '__pycache__',
  'venv',
  'env',
]);
const documents = new Set(['.md', '.markdown', '.txt', '.rst', '.mdx']);
const languages: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.sql': 'sql',
  '.sh': 'bash',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
};
const fileLimit = 256_000,
  totalLimit = 2_000_000;
const scans = new Map<string, RepositoryScan & { expires: number }>();
function rootDirectory(input: unknown): string {
  if (typeof input !== 'string' || !path.isAbsolute(input) || input.length > 4000)
    throw new Error('请输入本机目录的绝对路径。');
  try {
    const root = fs.realpathSync(input);
    if (!fs.statSync(root).isDirectory()) throw new Error();
    return root;
  } catch {
    throw new Error('目录不存在或没有读取权限，请重新选择。');
  }
}
export function listDirectories(input?: string): DirectoryListing {
  const root = rootDirectory(input || os.homedir());
  const directories = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !excluded.has(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
  return {
    path: root,
    parent: path.dirname(root) === root ? null : path.dirname(root),
    truncated: directories.length > 300,
    directories: directories.slice(0, 300).map((d) => ({ name: d.name, path: path.join(root, d.name) })),
  };
}
function git(root: string, args: string[]) {
  return spawnSync(
    'git',
    ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', root, ...args],
    { encoding: 'utf8', timeout: 5000, maxBuffer: 4_000_000 },
  );
}
function allowed(relative: string): boolean {
  const parts = relative.split('/');
  if (parts.some((p) => !p || p === '..' || p.startsWith('.') || excluded.has(p))) return false;
  const name = parts.at(-1)!;
  if (
    /^(?:package-lock|pnpm-lock|yarn\.lock|bun\.lock|composer\.lock|poetry\.lock)|(?:secret|credential|private[-_]?key)|\.(?:min\.[cm]?js|map)$/i.test(
      name,
    )
  )
    return false;
  const extension = path.extname(name).toLowerCase();
  return documents.has(extension) || Object.hasOwn(languages, extension);
}
// Check every component as well as the final file: imported symlinks never grant access outside the selection.
function safeFile(root: string, relative: string): string {
  if (!allowed(relative) || path.isAbsolute(relative)) throw new Error('文件路径不允许导入。');
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('跳过符号链接。');
  }
  const real = fs.realpathSync(current);
  if (!real.startsWith(root + path.sep) && root !== path.parse(root).root)
    throw new Error('文件超出所选目录。');
  return real;
}
export function scanRepository(input: unknown): RepositoryScan {
  const root = rootDirectory(input);
  let names: string[] = [],
    visited = 0,
    truncated = false,
    skipped = 0;
  const listed = git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  if (listed.status === 0) {
    names = [...new Set(listed.stdout.split('\0').filter(Boolean))];
    if (names.length > 20_000) {
      names = names.slice(0, 20_000);
      truncated = true;
    }
  } else {
    if (git(root, ['rev-parse', '--is-inside-work-tree']).status === 0)
      throw new Error('仓库文件列表读取失败或过大，请选择一个较小的子目录。');
    function walk(directory: string, prefix = '', depth = 0) {
      if (depth > 12) {
        truncated = true;
        return;
      }
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
      } catch {
        skipped++;
        return;
      }
      for (const entry of entries) {
        if (++visited > 20_000) {
          truncated = true;
          return;
        }
        if (entry.name.startsWith('.') || excluded.has(entry.name) || entry.isSymbolicLink()) {
          skipped++;
          continue;
        }
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(path.join(directory, entry.name), relative, depth + 1);
        else if (entry.isFile()) names.push(relative);
      }
    }
    walk(root);
  }
  const files: RepositoryFile[] = [];
  for (const relative of names) {
    if (!allowed(relative)) {
      skipped++;
      continue;
    }
    try {
      const file = safeFile(root, relative),
        stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > fileLimit || !stat.size) {
        skipped++;
        continue;
      }
      if (files.length >= 2000) {
        truncated = true;
        break;
      }
      files.push({
        path: relative,
        size: stat.size,
        kind: documents.has(path.extname(relative).toLowerCase()) ? 'document' : 'code',
      });
    } catch {
      skipped++;
    }
  }
  const priority = (file: RepositoryFile) =>
    /(^|\/)readme\./i.test(file.path) ? 0 : file.kind === 'document' ? 1 : 2;
  files.sort((a, b) => priority(a) - priority(b) || a.path.localeCompare(b.path, 'zh-CN', { numeric: true }));
  const head = git(root, ['rev-parse', 'HEAD']);
  const commit =
    head.status === 0 && /^[a-f0-9]{40,64}$/.test(head.stdout.trim()) ? head.stdout.trim() : undefined;
  for (const [id, scan] of scans) if (scan.expires < Date.now()) scans.delete(id);
  if (scans.size >= 20) scans.delete(scans.keys().next().value!);
  const scan = { id: randomUUID(), path: root, name: path.basename(root), files, skipped, truncated, commit };
  scans.set(scan.id, { ...scan, expires: Date.now() + 15 * 60_000 });
  return scan;
}
export function importRepository(id: unknown, selection: unknown, title: string, goal: string): Course {
  const scan = typeof id === 'string' ? scans.get(id) : undefined;
  if (!scan || scan.expires < Date.now()) throw new Error('目录预览已过期，请重新扫描。');
  if (
    !Array.isArray(selection) ||
    !selection.length ||
    selection.length > 50 ||
    selection.some((p) => typeof p !== 'string')
  )
    throw new Error('请选择 1–50 个文件。');
  const selected = [...new Set(selection as string[])];
  if (selected.some((name) => !scan.files.some((file) => file.path === name)))
    throw new Error('文件不在本次目录预览中，请重新扫描。');
  const courseId = randomUUID(),
    lessons: Course['lessons'] = [];
  let bytes = 0;
  for (const [index, relative] of selected.entries()) {
    let content: string;
    try {
      const file = safeFile(scan.path, relative);
      const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try {
        const size = fs.fstatSync(fd).size;
        if (size > fileLimit || !fs.fstatSync(fd).isFile()) throw new Error('too large');
        const buffer = Buffer.alloc(fileLimit + 1);
        const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
        if (read > fileLimit || (bytes += read) > totalLimit || buffer.subarray(0, read).includes(0))
          throw new Error('not text');
        content = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, read));
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      throw new Error(
        `无法导入 ${relative}：文件可能已变更、不是 UTF-8 文本或超过大小限制。请重新扫描；本次没有创建课程。`,
      );
    }
    const extension = path.extname(relative).toLowerCase();
    const markdown = extension === '.md' || extension === '.markdown' || extension === '.mdx';
    const fence = '`'.repeat(
      Array.from(content.matchAll(/`+/g)).reduce((n, m) => Math.max(n, m[0].length + 1), 3),
    );
    const parts = markdown
      ? splitMarkdown(content, path.basename(relative))
      : [
          {
            title: path.basename(relative),
            content: documents.has(extension)
              ? content
              : `${fence}${languages[extension] || 'text'}\n${content}\n${fence}`,
          },
        ];
    parts.forEach((part, j) =>
      lessons.push({
        id: `file-${index + 1}-${j + 1}`,
        title: part.title,
        chapter: relative,
        chapterIndex: index + 1,
        content: part.content,
        source: relative,
        question: documents.has(extension)
          ? `用自己的话解释「${part.title}」的核心观点，并举例说明。`
          : `这个文件负责什么？请解释一个关键执行过程、输入输出和一个可能出错的边界。`,
      }),
    );
  }
  if (!lessons.length) throw new Error('所选文件没有可学习的正文。');
  return {
    id: courseId,
    title,
    goal,
    description: `${selected.length} 份本地文档与源码`,
    source: '本地仓库快照',
    createdAt: new Date().toISOString(),
    lessons,
    repository: {
      path: scan.path,
      files: selected,
      importedAt: new Date().toISOString(),
      commit: scan.commit,
    },
  };
}
