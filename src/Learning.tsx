import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChatCircleText,
  Check,
  CircleNotch,
  Clock,
  List,
  NotePencil,
  PaperPlaneTilt,
  Pause,
  Play,
  Quotes,
  Sparkle,
  TreeStructure,
  X,
} from '@phosphor-icons/react';
import type { Bootstrap, Course, Lesson, Rating } from '../shared/types';
import { keyFor, request } from './lib';
import { Markdown } from './Markdown';
import { SelectionTools } from './SelectionTools';
import { Segmented, Disclosure } from './Controls';
import { Modal } from './Modal';

export function Learning({
  data,
  course,
  lesson,
  navigate,
  update,
  toast,
}: {
  data: Bootstrap;
  course: Course;
  lesson: Lesson;
  navigate: (path: string) => void;
  update: (data: Bootstrap) => void;
  toast: (message: string) => void;
}) {
  const [tab, setTab] = useState<'read' | 'recall'>(() =>
    location.hash.endsWith('?recall') ? 'recall' : 'read',
  );
  const [sideTab, setSideTab] = useState<'chat' | 'note'>('chat');
  const [answer, setAnswer] = useState(() => localStorage.getItem(`draft:${course.id}:${lesson.id}`) || '');
  const [message, setMessage] = useState(''),
    [quote, setQuote] = useState(''),
    [note, setNote] = useState('');
  const [kind, setKind] = useState<'note' | 'question'>('question');
  const [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const [feedback, setFeedback] = useState(false),
    [assisted, setAssisted] = useState(false),
    [submitted, setSubmitted] = useState(false);
  const [seconds, setSeconds] = useState(0),
    [paused, setPaused] = useState(false),
    [outline, setOutline] = useState(false);
  const abort = useRef<AbortController | null>(null),
    article = useRef<HTMLElement>(null),
    chatEnd = useRef<HTMLDivElement>(null);
  const key = keyFor(course.id, lesson.id);
  const messages = data.state.chats[key] ?? [];
  const progress = data.state.progress[key];
  useEffect(() => {
    localStorage.setItem(`draft:${course.id}:${lesson.id}`, answer);
  }, [answer, course.id, lesson.id]);
  useEffect(() => {
    const id = setInterval(() => {
      if (!paused && document.visibilityState === 'visible') setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [paused]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({
      block: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }, [messages.length, busy]);
  async function ask(text = message) {
    if (!text.trim() || busy) return;
    if (tab === 'recall' && !feedback) setAssisted(true);
    setBusy(true);
    setError('');
    setSideTab('chat');
    abort.current = new AbortController();
    try {
      const result = await request(
        '/tutor',
        {
          courseId: course.id,
          lessonId: lesson.id,
          message: quote ? `引用原文：\n${quote}\n\n${text}` : text,
        },
        'POST',
        abort.current.signal,
      );
      update(result);
      setMessage('');
      setQuote('');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveNote(content = note, type = kind, includeQuote = false) {
    if (includeQuote && quote) content = `> ${quote.replace(/\n/g, '\n> ')}\n\n${content}`.trim();
    if (!content.trim()) return;
    setSaving(true);
    setError('');
    try {
      update(await request('/notes', { courseId: course.id, lessonId: lesson.id, content, kind: type }));
      setNote('');
      if (includeQuote) setQuote('');
      toast(type === 'question' ? '疑问已留下，之后可以接着讨论' : '已保存到笔记本');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function rate(rating: Rating) {
    if (!answer.trim()) return;
    setSaving(true);
    setError('');
    try {
      const result = await request('/reviews', {
        courseId: course.id,
        lessonId: lesson.id,
        answer,
        rating,
        revealed: assisted,
        seconds,
      });
      update(result);
      setSubmitted(true);
      setSeconds(0);
      localStorage.removeItem(`draft:${course.id}:${lesson.id}`);
      toast('回答已保存，下一次复习已安排');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const next = course.lessons[course.lessons.indexOf(lesson) + 1];
  const quotePreview = quote && (
    <div className="quote-preview" aria-label="已引用原文">
      <Quotes size={15} />
      <span>{quote}</span>
      <button aria-label="移除引用" className="icon-button" onClick={() => setQuote('')}>
        <X size={15} />
      </button>
    </div>
  );
  const outlineContent = (
    <>
      <div className="outline-title">
        学习路线{' '}
        <span>
          {course.lessons.filter((l) => data.state.progress[keyFor(course.id, l.id)]).length}/
          {course.lessons.length}
        </span>
      </div>
      {Array.from(new Set(course.lessons.map((l) => l.chapterIndex))).map((chapter) => (
        <div key={chapter} className="outline-chapter">
          <h3>
            {String(chapter).padStart(2, '0')} ·{' '}
            {course.lessons.find((l) => l.chapterIndex === chapter)!.chapter}
          </h3>
          {course.lessons
            .filter((l) => l.chapterIndex === chapter)
            .map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  navigate(`/learn/${course.id}/${l.id}`);
                  setOutline(false);
                }}
                aria-current={l.id === lesson.id ? 'step' : undefined}
                className={l.id === lesson.id ? 'active' : ''}
              >
                <span className={`lesson-dot ${data.state.progress[keyFor(course.id, l.id)] ? 'done' : ''}`}>
                  {data.state.progress[keyFor(course.id, l.id)] && <Check size={10} />}
                </span>
                <span>{l.title}</span>
              </button>
            ))}
        </div>
      ))}
    </>
  );
  return (
    <div className="learning-shell">
      {tab === 'read' && (
        <SelectionTools
          article={article}
          capture={setQuote}
          choose={(target) => {
            setSideTab(target);
            if (target === 'note') setKind('note');
            requestAnimationFrame(() => {
              const input = document.getElementById(target === 'chat' ? 'chat-question' : 'personal-note');
              input?.focus();
              input?.scrollIntoView({
                block: 'nearest',
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'instant'
                  : 'smooth',
              });
            });
          }}
        />
      )}
      <header className="learning-header">
        <button
          className="icon-button"
          onClick={() => navigate(`/course/${course.id}`)}
          aria-label="返回课程"
        >
          <ArrowLeft size={21} />
        </button>
        <div className="lesson-breadcrumb">
          <span>{course.title}</span>
          <strong>{lesson.title}</strong>
        </div>
        <div className="timer">
          <Clock size={16} />
          <span>
            {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
          </span>
          <button
            className="icon-button"
            aria-label={paused ? '继续计时' : '暂停计时'}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
        </div>
        <button
          className="icon-button outline-toggle"
          onClick={() => setOutline(!outline)}
          aria-label="打开章节目录"
          aria-expanded={outline}
        >
          <List size={22} />
        </button>
      </header>
      <div className="learning-layout">
        <aside className="lesson-outline" aria-label="学习路线">
          {outlineContent}
        </aside>
        <Modal title="学习路线" description={course.title} open={outline} onOpenChange={setOutline}>
          <div className="outline-dialog">{outlineContent}</div>
        </Modal>
        <main className="lesson-main" id="main-content" tabIndex={-1}>
          <div className="lesson-tabs" role="group" aria-label="学习方式">
            <button
              className={tab === 'read' ? 'active' : ''}
              aria-pressed={tab === 'read'}
              onClick={() => {
                if (tab === 'recall' && !feedback) setAssisted(true);
                setTab('read');
              }}
            >
              <BookOpen size={18} />
              阅读材料
            </button>
            <button
              aria-pressed={tab === 'recall'}
              className={tab === 'recall' ? 'active' : ''}
              onClick={() => setTab('recall')}
            >
              <Sparkle size={18} />
              主动回忆
            </button>
            <span className="small muted">第 {course.lessons.indexOf(lesson) + 1} 小节</span>
          </div>
          {tab === 'read' ? (
            <article className="lesson-article" ref={article}>
              <div className="source-label">
                {course.source} {lesson.source && <span> / {lesson.source}</span>}
              </div>
              <h1>{lesson.title}</h1>
              <p className="lesson-goal">这一节，试着用自己的话解释它，并举出一个具体例子。</p>
              <p className="quote-button">
                <Quotes size={16} />
                划选正文，引用提问或记录笔记
              </p>
              <Markdown book={course.id === 'ai-agent-book'}>{lesson.content}</Markdown>
              <div className="reading-end">
                <span>读到这里，试着合上材料解释一次。</span>
                <button className="primary" onClick={() => setTab('recall')}>
                  开始主动回忆
                </button>
                <button
                  className="quiet"
                  onClick={() =>
                    navigate(
                      `/activity?tab=gallery&course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(lesson.id)}`,
                    )
                  }
                >
                  <Sparkle size={16} />
                  整理本节总结图卡
                </button>
              </div>
            </article>
          ) : (
            <section className="recall-panel">
              <span className="eyebrow">RETRIEVAL PRACTICE</span>
              <h1>把理解说出来。</h1>
              <p className="muted">先回想，再核对。说不清的地方，就是下一步要学的。</p>
              <div className="question-card">
                <span className="badge">本节自测</span>
                <h2>{lesson.question}</h2>
              </div>
              <label className="answer-label">
                你的解释
                <textarea
                  rows={7}
                  value={answer}
                  disabled={feedback || submitted}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="用两三句话说说你的理解，也可以写下不确定的部分…"
                />
              </label>
              {!feedback && !submitted && (
                <div className="button-row">
                  <button className="primary" disabled={!answer.trim()} onClick={() => setFeedback(true)}>
                    提交解释并核对
                  </button>
                  <button
                    className="quiet"
                    onClick={() => {
                      setAssisted(true);
                      setTab('read');
                    }}
                  >
                    我需要回看材料
                  </button>
                </div>
              )}
              {feedback && !submitted && (
                <div className="feedback-box">
                  <h3>核对后，你能独立解释吗？</h3>
                  <p className="small muted">如实记录。自评用于安排复习，Codex 点评不会自动判定掌握。</p>
                  <Disclosure title="查看材料，核对你的解释">
                    <Markdown book={course.id === 'ai-agent-book'}>{lesson.content}</Markdown>
                  </Disclosure>
                  <button
                    className="outline-button"
                    disabled={busy}
                    onClick={() => {
                      void ask(
                        `请点评我的自测答案：\n题目：${lesson.question}\n我的回答：${answer}\n请指出对的部分、缺口和误解，然后给一个变式问题。`,
                      );
                    }}
                  >
                    请 Codex 点评我的回答
                  </button>
                  <div className="rating-buttons">
                    <button disabled={saving} onClick={() => void rate('again')}>
                      还没记住<small>明天再练</small>
                    </button>
                    <button disabled={saving} onClick={() => void rate('hint')}>
                      需要提示<small>明天再练</small>
                    </button>
                    <button disabled={saving} onClick={() => void rate('good')}>
                      {assisted ? '提示后能解释' : '能独立解释'}
                      <small>{assisted || !progress ? '明天巩固' : '逐步拉长间隔'}</small>
                    </button>
                  </div>
                </div>
              )}
              {submitted && (
                <div className="success-panel">
                  <Check size={26} />
                  <h2>这一步，留下了。</h2>
                  <p>你的回答已保存。下次复习：{progress?.due}。</p>
                  {next && (
                    <button className="primary" onClick={() => navigate(`/learn/${course.id}/${next.id}`)}>
                      进入下一小节
                    </button>
                  )}
                  <button className="quiet" onClick={() => navigate('/today')}>
                    今天先到这里
                  </button>
                </div>
              )}
            </section>
          )}
        </main>
        <aside className="tutor-panel">
          <div className="tutor-heading">
            <div className="tutor-mark">
              <Sparkle size={19} />
            </div>
            <div>
              <strong>一起弄懂</strong>
              <span>
                Codex ·{' '}
                {data.state.preferences.codexModel === '@global'
                  ? data.codex.globalModel
                  : data.state.preferences.codexModel || data.codex.defaultModel || 'CLI 默认'}
              </span>
            </div>
            <span
              className={`connection-dot ${data.codex.authenticated ? 'connected' : ''}`}
              title={data.codex.authenticated ? 'Codex 已登录' : 'Codex 未登录'}
            />
          </div>
          <div className="side-tabs" role="group" aria-label="学习助手">
            <button
              aria-pressed={sideTab === 'chat'}
              className={sideTab === 'chat' ? 'active' : ''}
              onClick={() => setSideTab('chat')}
            >
              <ChatCircleText size={16} />
              共学
            </button>
            <button
              aria-pressed={sideTab === 'note'}
              className={sideTab === 'note' ? 'active' : ''}
              onClick={() => setSideTab('note')}
            >
              <NotePencil size={16} />
              随手记
            </button>
          </div>
          {tab === 'recall' && !feedback && !assisted ? (
            <div className="tutor-welcome recall-cover">
              <BookOpen size={28} weight="duotone" />
              <h3>先给记忆一点空间。</h3>
              <p>提交解释后，再查看旧对话和笔记。如果现在需要提示，也可以如实记录。</p>
              <button className="outline-button" onClick={() => setAssisted(true)}>
                查看提示与旧对话
              </button>
            </div>
          ) : sideTab === 'chat' ? (
            <>
              <div className="chat-messages">
                {!messages.length && (
                  <div className="tutor-welcome">
                    <Sparkle size={28} weight="duotone" />
                    <h3>哪里不明白，就从哪里开始。</h3>
                    <p>可以问概念、请我画图，或把你的解释交给我看看。</p>
                    <div className="tutor-actions">
                      <button
                        disabled={busy}
                        onClick={() =>
                          void ask('先问我一个简短问题，了解我对这一节的基础。等我回答后，再针对缺口讲解。')
                        }
                      >
                        <ChatCircleText size={16} />
                        从我的基础讲起
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void ask(
                            '请用一个 Mermaid flowchart 图解这一节最核心的关系，节点不超过 7 个，并给一个简短例子。',
                          )
                        }
                      >
                        <TreeStructure size={16} />
                        画清楚概念关系
                      </button>
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div className={`chat-message ${m.role}`} key={i}>
                    <span className="message-author">{m.role === 'user' ? '我' : 'Codex'}</span>
                    <Markdown>{m.content}</Markdown>
                    {m.role === 'assistant' && (
                      <button
                        className="save-response"
                        disabled={saving}
                        onClick={() => void saveNote(m.content, 'note')}
                      >
                        <NotePencil size={14} />
                        收进笔记
                      </button>
                    )}
                  </div>
                ))}
                {busy && (
                  <div className="thinking" role="status">
                    <CircleNotch className="spin" size={17} />
                    Codex 正在组织讲解…
                  </div>
                )}
                <div ref={chatEnd} />
              </div>
              <div className="chat-composer">
                {quotePreview}
                <label className="sr-only" htmlFor="chat-question">
                  共学问题
                </label>
                <textarea
                  id="chat-question"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="哪里卡住了？说说你的想法…"
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      void ask();
                    }
                  }}
                />
                <div className="composer-bottom">
                  <span>⌘ / Ctrl + Enter</span>
                  {busy ? (
                    <button className="quiet" onClick={() => abort.current?.abort()}>
                      停止
                    </button>
                  ) : (
                    <button
                      aria-label="发送问题"
                      className="send-button"
                      disabled={!message.trim()}
                      onClick={() => void ask()}
                    >
                      <PaperPlaneTilt size={19} />
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="inline-notes">
              <h3>先记下来，不用一次想透。</h3>
              {quotePreview}
              <Segmented
                label="随手记类型"
                value={kind}
                onChange={setKind}
                disabled={saving}
                options={[
                  { value: 'question', label: '留个疑问' },
                  { value: 'note', label: '记下理解' },
                ]}
              />
              <label>
                内容
                <textarea
                  id="personal-note"
                  rows={6}
                  value={note}
                  disabled={saving}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="哪句话没理解？或者你刚刚想通了什么？"
                />
              </label>
              <button
                className="primary wide"
                disabled={(!note.trim() && !quote) || saving}
                onClick={() => void saveNote(note, kind, true)}
              >
                {saving ? '正在保存…' : '保存到笔记本'}
              </button>
              <div className="lesson-notes">
                {data.state.notes
                  .filter((n) => n.courseId === course.id && n.lessonId === lesson.id)
                  .map((n) => (
                    <div key={n.id}>
                      <span className="badge">{n.kind === 'question' ? '疑问' : '笔记'}</span>
                      <Markdown>{n.content}</Markdown>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {error && (
            <p className="error tutor-error" role="alert">
              {error}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
