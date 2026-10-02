import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { NotePencil, Quotes } from '@phosphor-icons/react';

export function SelectionTools({
  article,
  capture,
  choose,
}: {
  article: RefObject<HTMLElement | null>;
  capture: (text: string) => void;
  choose: (tab: 'chat' | 'note') => void;
}) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function read() {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (
        !selection?.rangeCount ||
        !text ||
        !article.current?.contains(selection.anchorNode) ||
        !article.current.contains(selection.focusNode)
      ) {
        setPosition(null);
        return;
      }
      capture(text.slice(0, 3000));
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      setPosition({
        left: Math.max(12, Math.min(window.innerWidth - 236, rect.left + rect.width / 2 - 112)),
        top: Math.max(12, Math.min(window.innerHeight - 56, rect.bottom + 8)),
      });
    }
    function changed() {
      clearTimeout(timer);
      timer = setTimeout(read, 100);
    }
    const hide = () => {
      clearTimeout(timer);
      setPosition(null);
    };
    document.addEventListener('selectionchange', changed);
    document.addEventListener('pointerup', changed);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', changed);
      document.removeEventListener('pointerup', changed);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [article, capture]);
  if (!position) return null;
  return createPortal(
    <div
      className="selection-tools"
      role="toolbar"
      aria-label="选中文字的操作"
      style={position}
      onPointerDown={(e) => e.preventDefault()}
    >
      <button
        onClick={() => {
          choose('chat');
          setPosition(null);
          window.getSelection()?.removeAllRanges();
        }}
      >
        <Quotes size={16} />
        引用提问
      </button>
      <button
        onClick={() => {
          choose('note');
          setPosition(null);
          window.getSelection()?.removeAllRanges();
        }}
      >
        <NotePencil size={16} />
        记笔记
      </button>
    </div>,
    document.body,
  );
}
