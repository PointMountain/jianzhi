import { isValidElement, memo, useEffect, useId, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Disclosure } from './Controls';

function Diagram({ code }: { code: string }) {
  const id = `diagram-${useId().replace(/[^a-z0-9]/gi, '')}`;
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    setSvg('');
    import('mermaid')
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'neutral',
          flowchart: { htmlLabels: false },
          suppressErrorRendering: true,
        });
        if (!active) return;
        const result = await mermaid.render(`${id}-${crypto.randomUUID()}`, code.slice(0, 12000));
        if (active) setSvg(result.svg);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [code, id]);
  return error ? (
    <Disclosure className="diagram-error" title="图解暂未渲染，查看文字结构">
      <pre>{code}</pre>
    </Disclosure>
  ) : (
    <div className="diagram" aria-label="知识关系图">
      {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="muted">正在绘制关系图…</p>}
    </div>
  );
}
// Stable component types keep diagrams and text selections mounted when the
// learning timer or a text input updates the surrounding page.
const components: Components = {
  pre: ({ children }) =>
    isValidElement<{ className?: string }>(children) && children.props.className === 'language-mermaid' ? (
      <>{children}</>
    ) : (
      <pre>{children}</pre>
    ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  img: ({ alt }) => <span className="muted">[图片：{alt || '外部图片'}]</span>,
  code: ({ className, children, ...props }) =>
    className === 'language-mermaid' ? (
      <Diagram code={String(children).trim()} />
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    ),
};
const bookComponents: Components = {
  ...components,
  img: ({ src, alt }) => {
    const image = typeof src === 'string' ? src : '';
    if (image.startsWith('images/'))
      return (
        <img
          loading="lazy"
          src={`/api/book-images/${encodeURIComponent(image.slice(7))}`}
          alt={alt || '书中配图'}
        />
      );
    return <span className="muted">[图片：{alt || '外部图片'}]</span>;
  },
};

export const Markdown = memo(function Markdown({
  children,
  book = false,
}: {
  children: string;
  book?: boolean;
}) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={book ? bookComponents : components}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
