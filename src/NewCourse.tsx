import { useEffect, useRef, useState } from 'react';
import { FileText, Sparkle, UploadSimple, CircleNotch, FolderOpen } from '@phosphor-icons/react';
import { RepositoryImport } from './RepositoryImport';
import { Segmented } from './Controls';
import { saveRequest } from './save-request';
import type { Bootstrap } from '../shared/types';
export function NewCourse({
  open,
  close,
  initialTitle,
  imported,
  saved,
  storagePath,
}: {
  open: boolean;
  close: () => void;
  initialTitle: string;
  imported: boolean;
  saved: (data: Bootstrap & { courseId: string }) => void;
  storagePath: string;
}) {
  const [mode, setMode] = useState(imported ? 'import' : 'topic');
  const [title, setTitle] = useState(initialTitle),
    [goal, setGoal] = useState(''),
    [content, setContent] = useState(''),
    [source, setSource] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const modeDrafts = useRef<Record<string, { title: string; goal: string }>>({});
  function changeMode(next: string) {
    modeDrafts.current[mode] = { title, goal };
    const draft = modeDrafts.current[next];
    setTitle(draft?.title ?? '');
    setGoal(draft?.goal ?? '');
    setMode(next);
  }
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (open) {
      changeMode(imported ? 'import' : 'topic');
      if (initialTitle) setTitle(initialTitle);
      setError('');
    } else {
      controller.current?.abort();
      controller.current = null;
      setBusy(false);
    }
  }, [open, initialTitle, imported]);
  useEffect(() => () => controller.current?.abort(), []);
  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    close();
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const currentRequest = new AbortController();
    controller.current = currentRequest;
    try {
      const data = await saveRequest<Bootstrap & { courseId: string }>(
        mode === 'topic' ? '/generate' : '/courses',
        { title, goal, content, sourceUrl: source },
        storagePath,
        currentRequest.signal,
      );
      if (controller.current !== currentRequest || currentRequest.signal.aborted) return;
      saved(data);
      setTitle('');
      setContent('');
      setGoal('');
      setSource('');
      setFileName('');
      delete modeDrafts.current[mode];
    } catch (e) {
      if (controller.current === currentRequest && (e as Error).name !== 'AbortError')
        setError((e as Error).message);
    } finally {
      if (controller.current === currentRequest) setBusy(false);
    }
  }
  return (
    <section className="page create-page" hidden={!open}>
      <div className="page-heading">
        <div>
          <h1>添加主题</h1>
          <p>带来一个想弄懂的问题，或者一份值得细读的材料。</p>
        </div>
        <button className="quiet" onClick={cancel}>
          {busy ? '停止准备并返回' : '返回书架'}
        </button>
      </div>
      <Segmented
        label="主题创建方式"
        value={mode}
        onChange={changeMode}
        disabled={busy}
        options={[
          {
            value: 'topic',
            label: (
              <>
                <Sparkle size={17} />
                从主题开始
              </>
            ),
          },
          {
            value: 'import',
            label: (
              <>
                <FileText size={17} />
                导入材料
              </>
            ),
          },
          {
            value: 'repository',
            label: (
              <>
                <FolderOpen size={17} />
                本地仓库
              </>
            ),
          },
        ]}
      />
      <div hidden={mode !== 'repository'}>
        <RepositoryImport saved={saved} storagePath={storagePath} active={open && mode === 'repository'} />
      </div>
      <form hidden={mode === 'repository'} onSubmit={submit} className="form-stack" aria-busy={busy}>
        <label>
          学习主题
          <input
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
            placeholder="例如：理解 TypeScript 的类型系统"
          />
        </label>
        <label>
          学完想做到什么？
          <input
            value={goal}
            disabled={busy}
            onChange={(e) => setGoal(e.target.value)}
            maxLength={500}
            placeholder="例如：能自己写泛型，并解释什么时候需要它"
          />
        </label>
        {mode === 'import' ? (
          <>
            <label className="upload-label">
              <UploadSimple size={20} />
              <span>
                {fileName || '选择 Markdown 或文本文件'}
                <small>{fileName ? '已读取正文，点击可重新选择' : '支持 .md、.txt，最大 500 KB'}</small>
              </span>
              <input
                type="file"
                disabled={busy}
                aria-label="选择 Markdown 或文本文件"
                accept=".md,.markdown,.txt,text/plain,text/markdown"
                onChange={async (e) => {
                  setError('');
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 500000) {
                    setError('请选择小于 500 KB 的文本文件。');
                    return;
                  }
                  try {
                    setContent(await f.text());
                    setFileName(f.name);
                    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
                  } catch {
                    setError('没有读到文件内容，请重新选择文件，或直接粘贴正文。');
                  }
                }}
              />
            </label>
            <label>
              材料正文
              <textarea
                rows={6}
                value={content}
                disabled={busy}
                onChange={(e) => setContent(e.target.value)}
                maxLength={500000}
                required
                placeholder="也可以直接粘贴。Markdown 标题会自动变成学习小节。"
              />
            </label>
            <label>
              来源链接（可选）
              <input
                type="url"
                value={source}
                disabled={busy}
                onChange={(e) => setSource(e.target.value)}
                placeholder="https://…"
              />
            </label>
          </>
        ) : (
          <p className="callout">
            本机 Codex 会根据目标生成一条入门路线和学习材料。生成内容会标明来源，学习时可继续核对和追问。
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            className="primary wide"
            disabled={busy || !title.trim() || (mode === 'import' && !content.trim())}
          >
            {busy ? (
              <>
                <CircleNotch className="spin" size={18} />
                正在准备学习内容…
              </>
            ) : mode === 'topic' ? (
              '用 Codex 建立学习路线'
            ) : (
              '导入并查看路线'
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
