import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { PaperPlaneTilt, Stop } from '@phosphor-icons/react';

/** Controlled, auto-growing composer with one focus boundary and IME-safe submission. */
export function MessageComposer({
  id,
  value,
  onChange,
  onSend,
  onStop,
  busy = false,
  disabled = false,
  error,
  context,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy?: boolean;
  disabled?: boolean;
  error?: string;
  context?: ReactNode;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  function resize() {
    const element = input.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${element.scrollHeight}px`;
  }
  useLayoutEffect(resize, [value]);
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth;
        resize();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  function submit() {
    if (value.trim() && !busy && !disabled) onSend();
  }
  return (
    <form
      className="message-composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {context && <div className="message-composer-context">{context}</div>}
      <label htmlFor={id} className="message-composer-label">
        你的问题
      </label>
      <textarea
        ref={input}
        id={id}
        rows={2}
        value={value}
        maxLength={20000}
        onChange={(event) => onChange(event.target.value)}
        placeholder="哪里卡住了？说说你的想法…"
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        aria-invalid={error ? true : undefined}
        onKeyDown={(event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key === 'Enter' &&
            !event.nativeEvent.isComposing &&
            event.nativeEvent.keyCode !== 229
          ) {
            event.preventDefault();
            submit();
          }
        }}
      />
      {error && (
        <p id={`${id}-error`} className="message-composer-error" role="alert">
          {error}
        </p>
      )}
      <div className="message-composer-actions">
        <span id={`${id}-hint`}>
          <span>Enter 换行</span>
          <span>⌘ / Ctrl + Enter 发送</span>
        </span>
        {busy ? (
          <button type="button" className="outline-button" onClick={onStop}>
            <Stop size={17} aria-hidden="true" />
            停止
          </button>
        ) : (
          <button
            type="submit"
            className="primary"
            aria-label="发送问题"
            disabled={!value.trim() || disabled}
          >
            <PaperPlaneTilt size={17} aria-hidden="true" />
            发送
          </button>
        )}
      </div>
    </form>
  );
}
