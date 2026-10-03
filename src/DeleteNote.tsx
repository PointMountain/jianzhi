import { useState } from 'react';
import { Trash } from '@phosphor-icons/react';
import type { Bootstrap, Note } from '../shared/types';
import { request } from './lib';
import { Modal } from './Modal';

export function DeleteNote({
  note,
  update,
  toast,
}: {
  note: Note;
  update: (data: Bootstrap) => void;
  toast: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <button
        className="quiet"
        aria-label="删除这条随手记"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        <Trash size={15} /> 删除
      </button>
      <Modal
        title="删除这条记录？"
        description="这条笔记或疑问将从随手记、笔记本和足迹中删除，无法撤销。"
        open={open}
        onOpenChange={setOpen}
        busy={busy}
      >
        <p className="delete-note-preview">{note.content.slice(0, 240)}</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="button-row">
          <button className="quiet" disabled={busy} onClick={() => setOpen(false)}>
            保留记录
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await request(`/notes/${encodeURIComponent(note.id)}`, {}, 'DELETE');
                setOpen(false);
                update(result);
                toast('记录已删除');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? '正在删除…' : '确认删除'}
          </button>
        </div>
      </Modal>
    </>
  );
}
