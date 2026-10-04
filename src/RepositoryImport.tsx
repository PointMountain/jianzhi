import { useEffect, useRef, useState } from 'react';
import { FolderOpen, ArrowUp, FileText } from '@phosphor-icons/react';
import type { Bootstrap, DirectoryListing, RepositoryScan } from '../shared/types';
import { request } from './lib';
import { saveRequest } from './save-request';

export function RepositoryImport({
  saved,
  active = true,
  storagePath,
}: {
  saved: (data: Bootstrap & { courseId: string }) => void;
  active?: boolean;
  storagePath: string;
}) {
  const [path, setPath] = useState(''),
    [listing, setListing] = useState<DirectoryListing | null>(null);
  const [scan, setScan] = useState<RepositoryScan | null>(null),
    [files, setFiles] = useState<string[]>([]);
  const [title, setTitle] = useState(''),
    [goal, setGoal] = useState(''),
    [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!active) {
      abort.current?.abort();
      setBusy(false);
    }
  }, [active]);
  async function perform<T>(work: (signal: AbortSignal) => Promise<T>, done: (value: T) => void) {
    setBusy(true);
    setError('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const result = await work(controller.signal);
      if (!controller.signal.aborted) done(result);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function browse(directory?: string) {
    void perform(
      (signal) =>
        request<DirectoryListing>(
          `/directories${directory ? `?path=${encodeURIComponent(directory)}` : ''}`,
          undefined,
          'GET',
          signal,
        ),
      (result) => {
        setListing(result);
        setPath(result.path);
      },
    );
  }
  function preview(directory = path) {
    void perform(
      (signal) => request<RepositoryScan>('/repositories/scan', { path: directory }, 'POST', signal),
      (result) => {
        setScan(result);
        setPath(result.path);
        setTitle(result.name);
        setListing(null);
        setSearch('');
        const documents = result.files.filter((f) => f.kind === 'document');
        setFiles((documents.length ? documents : result.files).slice(0, 10).map((f) => f.path));
      },
    );
  }
  const size = scan?.files.filter((f) => files.includes(f.path)).reduce((n, f) => n + f.size, 0) || 0;
  return (
    <div className="form-stack repository-import">
      <p className="small muted">选择本机目录，再勾选要学的文档或源码。导入的是内容快照，保留文件来源。</p>
      <label>
        仓库目录
        <div className="path-row">
          <input
            aria-label="仓库绝对路径"
            placeholder="/Users/…/my-project"
            value={path}
            onChange={(e) => {
              setPath(e.target.value);
              setScan(null);
            }}
            disabled={busy}
          />
          <button
            type="button"
            className="outline-button"
            disabled={busy}
            onClick={() => browse(path || undefined)}
          >
            <FolderOpen size={17} />
            选择目录
          </button>
        </div>
      </label>
      {listing && (
        <section className="directory-picker" aria-label="本地目录选择器">
          <div className="directory-heading">
            <button
              className="quiet"
              disabled={busy || !listing.parent}
              onClick={() => browse(listing.parent!)}
            >
              <ArrowUp size={16} />
              上一级
            </button>
            <span>{listing.path}</span>
          </div>
          <div className="directory-list">
            {listing.directories.map((dir) => (
              <button key={dir.path} disabled={busy} onClick={() => browse(dir.path)}>
                <FolderOpen size={18} />
                {dir.name}
              </button>
            ))}
            {!listing.directories.length && <p className="small muted">当前目录没有可进入的子目录。</p>}
          </div>
          {listing.truncated && <p className="small muted">仅显示前 300 个目录，可输入完整路径。</p>}
          <button className="primary wide" disabled={busy} onClick={() => preview(listing.path)}>
            选择此目录并预览
          </button>
        </section>
      )}
      {!listing && (
        <button className="outline-button" disabled={busy || !path.trim()} onClick={() => preview()}>
          {busy ? '正在读取…' : '预览目录内容'}
        </button>
      )}
      {scan && (
        <>
          <div className="section-heading">
            <strong>{scan.files.length} 个可选文件</strong>
            <span className="small muted">
              已选 {files.length} · {Math.ceil(size / 1000)} KB
            </span>
          </div>
          <input
            aria-label="筛选仓库文件"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索文件名，例如 README 或 src/"
          />
          <div className="button-row">
            <button
              className="quiet"
              disabled={busy}
              onClick={() =>
                setFiles(
                  scan.files
                    .filter((f) => f.kind === 'document')
                    .slice(0, 50)
                    .map((f) => f.path),
                )
              }
            >
              选择前 50 份文档
            </button>
            <button className="quiet" disabled={busy} onClick={() => setFiles([])}>
              清空选择
            </button>
          </div>
          <div className="repository-files">
            {!scan.files.some((file) => file.path.toLowerCase().includes(search.toLowerCase())) && (
              <p className="file-empty">没有匹配的文件，试试更短的关键词。</p>
            )}
            {scan.files
              .filter((f) => f.path.toLowerCase().includes(search.toLowerCase()))
              .map((file) => (
                <label key={file.path}>
                  <input
                    type="checkbox"
                    checked={files.includes(file.path)}
                    disabled={busy || (!files.includes(file.path) && files.length >= 50)}
                    onChange={(e) =>
                      setFiles((old) =>
                        e.target.checked ? [...old, file.path] : old.filter((p) => p !== file.path),
                      )
                    }
                  />
                  <FileText size={16} />
                  <span>{file.path}</span>
                  <small>{file.kind === 'document' ? '文档' : '源码'}</small>
                </label>
              ))}
          </div>
          <p className="small muted">
            每次最多 50 个文件、合计 2 MB；单文件不超过 256 KB。隐藏文件、依赖、产物和符号链接会跳过。
            {scan.truncated && '目录较大，预览已截断，可选择更小的子目录。'}
          </p>
          <label>
            学习主题
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} disabled={busy} />
          </label>
          <label>
            学习目标
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              maxLength={500}
              disabled={busy}
              placeholder="例如：能解释核心流程并独立调试"
            />
          </label>
          <button
            className="primary wide"
            disabled={busy || !files.length || size > 2_000_000 || !title.trim()}
            onClick={() =>
              void perform(
                (signal) =>
                  saveRequest<Bootstrap & { courseId: string }>(
                    '/repositories/import',
                    { scanId: scan.id, files, title, goal },
                    storagePath,
                    signal,
                  ),
                saved,
              )
            }
          >
            {busy ? '正在导入…' : `导入 ${files.length} 个文件`}
          </button>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
