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
  SidebarSimple,
  GearSix,
} from '@phosphor-icons/react';
import type { Bootstrap, Course, Lesson, Rating } from '../shared/types';
import { keyFor, request } from './lib';
import { Markdown } from './Markdown';
import { SelectionTools } from './SelectionTools';
import { Segmented, Disclosure } from './Controls';
import { Modal } from './Modal';
import { ModelSettings } from './ModelSettings';
import { DeleteNote } from './DeleteNote';
import { lessonCompletion } from '../shared/completions';

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
  const [leftCollapsed, setLeftCollapsed] = useState(
    () => localStorage.getItem('jianzhi:outline-collapsed') === 'true',
  );
  const [rightCollapsed, setRightCollapsed] = useState(
    () => localStorage.getItem('jianzhi:tutor-collapsed') === 'true',
  );
  const [modelSettings, setModelSettings] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [checking, setChecking] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const feedbackAbort = useRef<AbortController | null>(null);
  const [answer, setAnswer] = useState(() => localStorage.getItem(`draft:${course.id}:${lesson.id}`) || '');
  const [message, setMessage] = useState(''),
    [quote, setQuote] = useState(''),
    [note, setNote] = useState('');
  const [kind, setKind] = useState<'note' | 'question'>('question');
  const [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const [feedback, setFeedback] = useState(false),
    [assisted, setAssisted] = useState(
      () => localStorage.getItem(`draft-assisted:${course.id}:${lesson.id}`) === 'true',
    ),
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
  const completion = lessonCompletion(data.state, course.id, lesson.id);
  useEffect(() => {
    localStorage.setItem('jianzhi:outline-collapsed', String(leftCollapsed));
  }, [leftCollapsed]);
  useEffect(() => {
    localStorage.setItem('jianzhi:tutor-collapsed', String(rightCollapsed));
  }, [rightCollapsed]);
  useEffect(() => {
    if (submitted) {
      localStorage.removeItem(`draft:${course.id}:${lesson.id}`);
      localStorage.removeItem(`draft-assisted:${course.id}:${lesson.id}`);
    } else {
      localStorage.setItem(`draft:${course.id}:${lesson.id}`, answer);
      localStorage.setItem(`draft-assisted:${course.id}:${lesson.id}`, String(assisted || feedback));
    }
  }, [answer, assisted, feedback, submitted, course.id, lesson.id]);
  useEffect(() => {
    const id = setInterval(() => {
      if (!paused && document.visibilityState === 'visible') setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [paused]);
  useEffect(
    () => () => {
      abort.current?.abort();
      feedbackAbort.current?.abort();
    },
    [],
  );
  useEffect(() => {
    chatEnd.current?.scrollIntoView({
      block: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }, [messages.length, busy]);
  async function ask(text = message) {
    if (!text.trim() || busy || checking) return;
    if (tab === 'recall' && !feedback) setAssisted(true);
    setBusy(true);
    setError('');
    setSideTab('chat');
    setRightCollapsed(false);
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
    if (!answer.trim() || saving || checking) return;
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
        feedback: feedbackText,
      });
      update(result);
      setSubmitted(true);
      setPaused(true);
      setSeconds(0);
      localStorage.removeItem(`draft:${course.id}:${lesson.id}`);
      toast('本节已学完，回答已保存，下一次复习已安排');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function checkAnswer() {
    if (!answer.trim() || checking || busy) return;
    setFeedback(true);
    setChecking(true);
    setFeedbackError('');
    feedbackAbort.current = new AbortController();
    try {
      const result = await request<{ feedback: string }>(
        '/recall-feedback',
        {
          courseId: course.id,
          lessonId: lesson.id,
          answer,
        },
        'POST',
        feedbackAbort.current.signal,
      );
      setFeedbackText(result.feedback);
    } catch (e) {
      setFeedbackError(
        (e as Error).name === 'AbortError'
          ? '核对已停止，回答仍保留。可以重试或自行记录回忆结果。'
          : (e as Error).message,
      );
    } finally {
      setChecking(false);
    }
  }
  async function completeLesson() {
    if (saving || completion) return;
    setSaving(true);
    setError('');
    try {
      update(await request('/completions', { courseId: course.id, lessonId: lesson.id }));
      toast('本节已学完，已记录到足迹');
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
          {course.lessons.filter((l) => lessonCompletion(data.state, course.id, l.id)).length}/
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
                <span className={`lesson-dot ${lessonCompletion(data.state, course.id, l.id) ? 'done' : ''}`}>
                  {lessonCompletion(data.state, course.id, l.id) && <Check size={10} />}
                </span>
                <span>{l.title}</span>
                {lessonCompletion(data.state, course.id, l.id) && (
                  <span className="outline-completed">已学完</span>
                )}
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
            setRightCollapsed(false);
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
        <button
          className={`quiet completion-toggle ${completion ? 'completed' : ''}`}
          disabled={saving || !!completion}
          onClick={() => void completeLesson()}
        >
          <Check size={16} /> {completion ? '本节已学完' : '学完本节'}
        </button>
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
          className="icon-button desktop-outline-toggle"
          aria-label={leftCollapsed ? '展开左侧目录' : '收起左侧目录'}
          title={leftCollapsed ? '展开左侧目录' : '收起左侧目录'}
          aria-expanded={!leftCollapsed}
          aria-controls="lesson-outline"
          onClick={() => setLeftCollapsed(!leftCollapsed)}
        >
          <SidebarSimple size={21} />
        </button>
        <button
          className="icon-button tutor-toggle"
          aria-label={rightCollapsed ? '展开右侧助手' : '收起右侧助手'}
          title={rightCollapsed ? '展开右侧助手' : '收起右侧助手'}
          aria-expanded={!rightCollapsed}
          aria-controls="tutor-panel"
          onClick={() => setRightCollapsed(!rightCollapsed)}
        >
          <ChatCircleText size={21} />
        </button>
        <button
          className="icon-button outline-toggle"
          onClick={() => setOutline(!outline)}
          aria-label="打开章节目录"
          aria-expanded={outline}
        >
          <List size={22} />
        </button>
      </header>
      {error && (
        <p className="error learning-error" role="alert">
          {error}
        </p>
      )}
      <div
        className={`learning-layout ${leftCollapsed ? 'left-collapsed' : ''} ${rightCollapsed ? 'right-collapsed' : ''}`}
      >
        <aside className="lesson-outline" id="lesson-outline" aria-label="学习路线">
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
                  className="outline-button"
                  disabled={saving || !!completion}
                  onClick={() => void completeLesson()}
                >
                  <Check size={16} /> {completion ? '本节已学完' : '学完本节，记录到足迹'}
                </button>
                <span className="small muted">学完记录学习足迹；完成回忆自评后才会安排复习。</span>
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
                  <button
                    className="primary"
                    disabled={!answer.trim() || busy}
                    onClick={() => void checkAnswer()}
                  >
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
                  <h3>针对这道题，核对你的回答</h3>
                  {checking && (
                    <div className="thinking" role="status">
                      <CircleNotch className="spin" size={17} />
                      正在逐点核对…
                      <button className="quiet" onClick={() => feedbackAbort.current?.abort()}>
                        停止核对
                      </button>
                    </div>
                  )}
                  {feedbackError && (
                    <p className="error" role="alert">
                      {feedbackError}
                    </p>
                  )}
                  {feedbackText && (
                    <div className="recall-feedback">
                      <Markdown>{feedbackText}</Markdown>
                    </div>
                  )}
                  {!checking && !feedbackText && (
                    <button className="outline-button" disabled={busy} onClick={() => void checkAnswer()}>
                      重试核对
                    </button>
                  )}
                  {!checking && (
                    <button
                      className="quiet"
                      onClick={() => {
                        setFeedback(false);
                        setFeedbackText('');
                        setFeedbackError('');
                        setAssisted(true);
                      }}
                    >
                      修改解释（按提示后作答记录）
                    </button>
                  )}
                  <Disclosure title="需要时回看本节原文">
                    <Markdown book={course.id === 'ai-agent-book'}>{lesson.content}</Markdown>
                  </Disclosure>
                  <h3>回看刚才提交的解释，选择本次结果</h3>
                  <p className="small muted">
                    点击后保存回答并安排复习。评价的是核对前的回答；点评仅供参考，不会自动判定掌握。
                  </p>
                  {assisted && (
                    <p className="small muted">回答前已看过材料、提示或旧对话，本次不计为独立回忆。</p>
                  )}
                  <div className="rating-buttons">
                    <button disabled={saving || checking} onClick={() => void rate('again')}>
                      还没记住<small>仍讲不清 · 明天再练</small>
                    </button>
                    <button disabled={saving || checking} onClick={() => void rate('hint')}>
                      提示后能解释<small>借助提示才想起 · 明天再练</small>
                    </button>
                    <button disabled={saving || checking || assisted} onClick={() => void rate('good')}>
                      独立解释
                      <small>
                        {assisted
                          ? '本次已用提示，不能选择'
                          : !progress
                            ? '没用提示 · 明天巩固'
                            : '没用提示 · 按计划延长间隔'}
                      </small>
                    </button>
                  </div>
                  <p className="small muted">
                    独立回忆按 1、3、7、14、30 天安排；到期且跨日完成才推进，当天重复不会拉长间隔。
                  </p>
                </div>
              )}
              {submitted && (
                <div className="success-panel">
                  <Check size={26} />
                  <h2>本节已学完，回忆已记录。</h2>
                  <p>你的回答已保存。下次复习：{progress?.due}。</p>
                  <button className="quiet" onClick={() => navigate('/activity')}>
                    查看学习足迹
                  </button>
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
        <aside className="tutor-panel" id="tutor-panel" aria-label="学习助手面板">
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
          <button
            className="model-shortcut"
            onClick={() => setModelSettings(true)}
            aria-label="快捷设置模型、Effort 和 Fast"
          >
            <GearSix size={16} />
            <span>
              {data.state.preferences.codexModel === '@global'
                ? data.codex.globalModel
                : data.state.preferences.codexModel || data.codex.defaultModel || '选择模型'}
            </span>
            <small>
              {data.state.preferences.codexEffort || '默认强度'} · Fast{' '}
              {data.state.preferences.codexFast ? '开' : '关'}
            </small>
          </button>
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
                      disabled={!message.trim() || checking}
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
                      <DeleteNote note={n} update={update} toast={toast} />
                    </div>
                  ))}
              </div>
            </div>
          )}
        </aside>
      </div>
      <Modal
        title="本次学习的请求设置"
        description="保存后用于下一次讲解、答案核对和总结请求。"
        open={modelSettings}
        onOpenChange={setModelSettings}
      >
        {modelSettings && <ModelSettings compact data={data} update={update} toast={toast} />}
      </Modal>
    </div>
  );
}
