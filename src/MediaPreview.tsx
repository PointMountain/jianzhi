import { useState } from 'react';
import { MagnifyingGlassPlus, Minus, Plus } from '@phosphor-icons/react';
import { Modal } from './Modal';

export function MediaPreview({ src, svg, alt }: { src?: string; svg?: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  return (
    <>
      <button
        type="button"
        className="media-preview-trigger"
        aria-label={`放大预览：${alt}`}
        onClick={() => {
          setScale(1);
          setOpen(true);
        }}
      >
        {svg ? (
          <span className="diagram-image" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <img loading="lazy" src={src} alt={alt} />
        )}
        <span className="media-preview-hint">
          <MagnifyingGlassPlus size={15} /> 点击放大
        </span>
      </button>
      <Modal
        title={alt}
        description="使用缩放按钮查看细节，按 Esc 关闭预览。"
        open={open}
        onOpenChange={setOpen}
        className="media-preview-modal"
      >
        <div className="preview-toolbar">
          <button
            className="icon-button"
            aria-label="缩小预览"
            disabled={scale <= 0.5}
            onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
          >
            <Minus size={18} />
          </button>
          <button className="quiet" onClick={() => setScale(1)}>
            重置 {Math.round(scale * 100)}%
          </button>
          <button
            className="icon-button"
            aria-label="放大预览"
            disabled={scale >= 3}
            onClick={() => setScale((s) => Math.min(3, s + 0.25))}
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="preview-viewport">
          <div className="preview-media" style={{ width: `${scale * 100}%` }}>
            {svg ? (
              <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={alt} />
            ) : (
              <img src={src} alt={alt} />
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
