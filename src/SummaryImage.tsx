import { useEffect, useState } from 'react';
import { DownloadSimple } from '@phosphor-icons/react';
import { Disclosure } from './Controls';
import type { SummaryCard } from '../shared/types';

// The on-screen image and downloaded PNG use exactly the same layout.
export function SummaryImage({ card, source }: { card: SummaryCard; source: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    const width = 900,
      margin = 66,
      available = width - 2 * margin;
    const font = '"PingFang SC", "Microsoft YaHei", sans-serif';
    const lines = (text: string, size: number, bold = false) => {
      context.font = `${bold ? 600 : 400} ${size}px ${font}`;
      const result: string[] = [];
      let line = '';
      for (const char of Array.from(text)) {
        if (char === '\n' || context.measureText(line + char).width > available) {
          result.push(line);
          line = char === '\n' ? '' : char;
        } else line += char;
      }
      if (line) result.push(line);
      return result;
    };
    const blocks = [
      { text: card.title, size: 44, step: 62, bold: true, color: '#2e3d32', after: 24 },
      { text: card.takeaway, size: 27, step: 44, color: '#566659', after: 42 },
      ...card.points.flatMap((p, i) => [
        { text: `0${i + 1}  ${p.title}`, size: 27, step: 44, bold: true, color: '#2e3d32', after: 6 },
        { text: p.body, size: 25, step: 42, color: '#505b52', after: 30 },
      ]),
      { text: '合上图卡，再问自己', size: 21, step: 36, bold: true, color: '#8c653b', after: 8 },
      { text: card.nextQuestion, size: 26, step: 44, color: '#2e3d32', after: 38 },
      { text: source, size: 18, step: 30, color: '#788177', after: 8 },
    ].map((block) => ({ ...block, lines: lines(block.text, block.size, block.bold) }));
    canvas.width = width;
    canvas.height = 180 + blocks.reduce((height, b) => height + b.lines.length * b.step + b.after, 0);
    context.fillStyle = '#f0f2e9';
    context.fillRect(0, 0, width, canvas.height);
    context.fillStyle = '#b9c5ac';
    context.fillRect(0, 0, 16, canvas.height);
    context.font = `600 18px ${font}`;
    context.fillStyle = '#63745f';
    context.fillText('渐知 JIANZHI  /  学习总结', margin, 62);
    let y = 140;
    for (const block of blocks) {
      context.font = `${block.bold ? 600 : 400} ${block.size}px ${font}`;
      context.fillStyle = block.color;
      for (const line of block.lines) {
        context.fillText(line, margin, y);
        y += block.step;
      }
      y += block.after;
    }
    context.font = `17px ${font}`;
    context.fillStyle = '#788177';
    context.fillText('Codex 生成 · 结合原文核对', margin, canvas.height - 30);
    setUrl(canvas.toDataURL('image/png'));
  }, [card, source]);
  return (
    <>
      {url && <img className="summary-image" src={url} alt={`学习总结：${card.title}。${card.takeaway}`} />}
      <div className="summary-image-actions">
        <a className="outline-button" href={url || undefined} download={`jianzhi-${card.id}.png`}>
          <DownloadSimple size={16} />
          下载 PNG
        </a>
        <Disclosure title="查看文字版">
          <p>{card.takeaway}</p>
          {card.points.map((p, i) => (
            <p key={i}>
              <strong>{p.title}：</strong>
              {p.body}
            </p>
          ))}
          <p>{card.nextQuestion}</p>
        </Disclosure>
      </div>
    </>
  );
}
