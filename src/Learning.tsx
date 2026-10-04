import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChatCircleText,
  Check,
  CircleNotch,
  Clock,
  List,
  NotePencil,
  Pause,
  Play,
  Quotes,
  Sparkle,
  TreeStructure,
  X,
  GearSix,
} from '@phosphor-icons/react';
import type { Bootstrap, Course, Lesson, Rating } from '../shared/types';
import { keyFor, request } from './lib';
import { saveRequest } from './save-request';
import { Markdown } from './Markdown';
import { SelectionTools } from './SelectionTools';
import { Segmented, Disclosure } from './Controls';
import { Modal } from './Modal';
import { ModelSettings } from './ModelSettings';
import { DeleteNote } from './DeleteNote';
import { lessonCompletion } from '../shared/completions';
import { currentQuestion } from '../shared/guided';
import { GuidedLearning } from './GuidedLearning';
import { MessageComposer } from './MessageComposer';
import {
  lessonStateKey,
  readLocal,
  writeLocal,
  useLessonDraft,
  localText,
  storeText,
  recentStateKey,
  legacyLessonValue,
} from './learning-state';

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
  const viewKey = lessonStateKey(data.storagePath, course.id, lesson.id);
  const [tab, setTab] = useState<'read' | 'recall' | 'guided'>(() => {
    const requested = location.hash.split('?')[1];
    const saved = requested || readLocal(viewKey + ':mode', 'guided');
    return saved === 'read' || saved === 'recall' ? saved : 'guided';
  });
  const [focusReading, setFocusReading] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [readingPercent, setReadingPercent] = useState(0);
  const [rating, setRating] = useState<Rating | null>(null);
  const [completionActions, setCompletionActions] = useState(false);
  const focusTrigger = useRef<HTMLElement | null>(null);
  const alive = useRef(true);
  const accept = (value: Bootstrap) => {
    if (alive.current) update(value);
  };
  const [sideTab, setSideTab] = useState<'chat' | 'note'>('chat');
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [modelSettings, setModelSettings] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [checking, setChecking] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const feedbackAbort = useRef<AbortController | null>(null);
  const [answer, setAnswer] = useLessonDraft(
    viewKey + ':answer',
    legacyLessonValue(data.storagePath, course.id, lesson.id, 'draft'),
  );
  const [message, setMessage] = useLessonDraft(viewKey + ':message');
  const [quote, setQuote] = useLessonDraft(viewKey + ':quote');
  const [note, setNote] = useLessonDraft(viewKey + ':note');
  const [kind, setKind] = useState<'note' | 'question'>('question');
  const [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const [feedback, setFeedback] = useState(false),
    [assisted, setAssisted] = useState(() =>
      readLocal(
        viewKey + ':assisted',
        legacyLessonValue(data.storagePath, course.id, lesson.id, 'draft-assisted') === 'true',
      ),
    ),
    [submitted, setSubmitted] = useState(false);
  const [seconds, setSeconds] = useState(0),
    [paused, setPaused] = useState(false),
    [outline, setOutline] = useState(false);
  const abort = useRef<AbortController | null>(null),
    article = useRef<HTMLElement>(null);
  const chatPane = useRef<HTMLDivElement>(null);
  const chatAtEnd = useRef(true);
  const chatScrollTop = useRef(0);
  const chatWasVisible = useRef(false);
  const [newChat, setNewChat] = useState(false);
  const [chatError, setChatError] = useState('');
  const key = keyFor(course.id, lesson.id);
  const messages = data.state.chats[key] ?? [];
  const previousChatCount = useRef(messages.length);
  const latestDraft = useRef({ message, quote });
  latestDraft.current = { message, quote };
  const chatVisible =
    !rightCollapsed && !focusReading && sideTab === 'chat' && !(tab === 'recall' && !feedback && !assisted);
  const attachChatPane = useCallback((pane: HTMLDivElement | null) => {
    chatPane.current = pane;
    if (!pane) return;
    pane.scrollTop = chatAtEnd.current ? pane.scrollHeight : chatScrollTop.current;
    if (chatAtEnd.current) setNewChat(false);
    chatWasVisible.current = true;
  }, []);
  const progress = data.state.progress[key];
  const completion = lessonCompletion(data.state, course.id, lesson.id);
  useEffect(() => {
    const change = () => {
      const [path, mode] = location.hash.split('?');
      if (path !== `#/learn/${course.id}/${lesson.id}`) return;
      if (mode === 'guided' || mode === 'read' || mode === 'recall') setTab(mode);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, [course.id, lesson.id]);
  useEffect(() => {
    // Keep a refresh on the same learning mode without remounting an active session.
    const suffix = `?${tab}`;
    history.replaceState(null, '', `#/learn/${course.id}/${lesson.id}${suffix}`);
    writeLocal(viewKey + ':mode', tab);
    const recent = { courseId: course.id, lessonId: lesson.id };
    writeLocal(recentStateKey(data.storagePath), recent);
    writeLocal(recentStateKey(data.storagePath, course.id), recent);
  }, [tab, course.id, lesson.id, viewKey, data.storagePath]);
  useEffect(() => {
    writeLocal(viewKey + ':assisted', assisted || feedback);
    if (assisted) setRating((value) => (value === 'good' ? null : value));
  }, [assisted, feedback, viewKey]);
  useLayoutEffect(() => {
    if (article.current) article.current.scrollTop = readLocal(viewKey + ':scroll', 0);
  }, [viewKey, focusReading, tab]);
  function enterFocus() {
    focusTrigger.current = document.activeElement as HTMLElement;
    if (tab === 'recall' && !feedback) setAssisted(true);
    void markGuidedMaterial();
    setFocusReading(true);
  }
  function exitFocus() {
    setFocusReading(false);
    requestAnimationFrame(() => focusTrigger.current?.focus({ preventScroll: true }));
  }
  useEffect(() => {
    document.body.classList.toggle('reading-focus', focusReading);
    if (focusReading) document.getElementById('exit-reading-focus')?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('[role="dialog"]'))
        exitFocus();
    };
    if (focusReading) window.addEventListener('keydown', escape);
    return () => {
      document.body.classList.remove('reading-focus');
      window.removeEventListener('keydown', escape);
    };
  }, [focusReading]);
  const guided = data.state.guidedSessions?.find(
    (s) => s.courseId === course.id && s.lessonId === lesson.id && !s.endedAt,
  );
  async function markGuidedMaterial() {
    if (!guided) return;
    const pending = guided.turns.find((t) => t.status === 'pending');
    const question =
      pending && ['start', 'transfer', 'practice'].includes(pending.action)
        ? pending
        : currentQuestion(guided);
    if (!question) return;
    if (localText(`guided-material:${guided.id}:${question.id}`) === '1') return;
    storeText(`guided-material:${guided.id}:${question.id}`, '1');
    if (guided.turns.some((t) => t.action === 'material' && t.questionId === question.id)) return;
    try {
      accept(
        await request(`/guided/${guided.id}/turn`, { requestId: crypto.randomUUID(), action: 'material' }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function readMaterial() {
    if (tab === 'recall' && !feedback) setAssisted(true);
    void markGuidedMaterial();
    setTab('read');
  }
  useEffect(() => {
    const id = setInterval(() => {
      if (!paused && document.visibilityState === 'visible') setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [paused]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
      feedbackAbort.current?.abort();
    };
  }, []);
  useLayoutEffect(() => {
    const addedReply = messages.slice(previousChatCount.current).some((item) => item.role === 'assistant');
    previousChatCount.current = messages.length;
    if (!chatVisible) {
      if (addedReply) setNewChat(true);
      chatWasVisible.current = false;
      return;
    }
    const pane = chatPane.current;
    if (!pane) return;
    if (chatAtEnd.current) {
      pane.scrollTop = pane.scrollHeight;
      setNewChat(false);
    } else {
      if (!chatWasVisible.current) pane.scrollTop = chatScrollTop.current;
      if (addedReply) setNewChat(true);
    }
    chatWasVisible.current = true;
  }, [messages.length, busy, chatVisible]);
  async function ask(text = message) {
    if (!text.trim() || busy || checking) return;
    if (tab === 'recall' && !feedback) setAssisted(true);
    setBusy(true);
    setError('');
    setChatError('');
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
      if (!alive.current) return;
      accept(result);
      if (text === message && latestDraft.current.message === message) setMessage('');
      if (latestDraft.current.quote === quote) setQuote('');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setChatError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveNote(content = note, type = kind, includeQuote = false) {
    const savesDraft = content === note || includeQuote;
    if (includeQuote && quote) content = `> ${quote.replace(/\n/g, '\n> ')}\n\n${content}`.trim();
    if (!content.trim()) return;
    setSaving(true);
    setError('');
    try {
      const result = await saveRequest(
        '/notes',
        {
          courseId: course.id,
          lessonId: lesson.id,
          content,
          kind: type,
        },
        viewKey,
      );
      if (!alive.current) return;
      accept(result);
      if (savesDraft) setNote('');
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
      const result = await saveRequest(
        '/reviews',
        {
          courseId: course.id,
          lessonId: lesson.id,
          answer,
          rating,
          revealed: assisted,
          seconds,
          feedback: feedbackText,
        },
        viewKey,
      );
      if (!alive.current) return;
      accept(result);
      setAnswer('');
      writeLocal(viewKey + ':assisted', false);
      setSubmitted(true);
      setPaused(true);
      setSeconds(0);
      storeText(`draft:${course.id}:${lesson.id}`, null);
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
      accept(await request('/completions', { courseId: course.id, lessonId: lesson.id }));
      if (!alive.current) return;
      setCompletionActions(true);
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
      <button type="button" className="quiet" onClick={() => setQuoteOpen(true)}>
        查看引用
      </button>
      <button type="button" aria-label="移除引用" className="icon-button" onClick={() => setQuote('')}>
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
    <div className={`learning-shell mode-${tab} ${focusReading ? 'is-focused' : ''}`}>
      {(tab !== 'recall' || focusReading) && (
        <SelectionTools
          article={article}
          capture={setQuote}
          choose={(target) => {
            if (focusReading) setFocusReading(false);
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
        <div
          className="timer"
          title="本小节页面可见且未暂停的停留时间；提交回忆自评时保存，刷新或换小节会归零。"
        >
          <Clock size={16} aria-hidden="true" />
          <small className="timer-label">本次停留</small>
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
        <button className="quiet" onClick={enterFocus}>
          专注阅读
        </button>
        <button className="quiet" onClick={() => setOutline(true)}>
          <List size={18} />
          章节
        </button>
        {
          <button
            className="icon-button tutor-toggle"
            aria-label={rightCollapsed ? '展开右侧助手' : '收起右侧助手'}
            title={rightCollapsed ? '展开右侧助手' : '收起右侧助手'}
            aria-expanded={!rightCollapsed}
            aria-controls="tutor-panel"
            onClick={() => setRightCollapsed(!rightCollapsed)}
          >
            <NotePencil size={21} />
          </button>
        }
        <button
          className="icon-button outline-toggle"
          onClick={() => setOutline(!outline)}
          aria-label="打开章节目录"
          aria-expanded={outline}
        >
          <List size={22} />
        </button>
      </header>
      {focusReading && (
        <header className="focus-toolbar">
          <button id="exit-reading-focus" className="outline-button" onClick={exitFocus}>
            退出专注阅读
          </button>
          <span>{lesson.title}</span>
          <button className="quiet" onClick={() => setOutline(true)}>
            章节
          </button>
          <button
            className="quiet"
            aria-label="减小字号"
            disabled={fontSize <= 14}
            onClick={() => setFontSize(fontSize - 1)}
          >
            A−
          </button>
          <button
            className="quiet"
            aria-label="增大字号"
            disabled={fontSize >= 22}
            onClick={() => setFontSize(fontSize + 1)}
          >
            A＋
          </button>
          <span className="small">{readingPercent}%</span>
        </header>
      )}
      {error && (
        <p className="error learning-error" role="alert">
          {error}
        </p>
      )}
      <div className="learning-layout">
        <Modal title="学习路线" description={course.title} open={outline} onOpenChange={setOutline}>
          <div className="outline-dialog">{outlineContent}</div>
        </Modal>
        <main className="lesson-main" id="main-content" tabIndex={-1}>
          <div className="lesson-tabs" role="group" aria-label="学习方式">
            <button
              className={tab === 'guided' ? 'active' : ''}
              aria-pressed={tab === 'guided'}
              onClick={() => {
                if (tab === 'recall' && !feedback) setAssisted(true);
                setTab('guided');
              }}
            >
              <ChatCircleText size={18} />
              导师带学
            </button>
            <button
              className={tab === 'read' ? 'active' : ''}
              aria-pressed={tab === 'read'}
              onClick={readMaterial}
            >
              <BookOpen size={18} />
              自主阅读
            </button>
            <button
              aria-pressed={tab === 'recall'}
              className={tab === 'recall' ? 'active' : ''}
              onClick={() => {
                if (tab === 'guided' && guided?.turns.some((t) => t.response)) setAssisted(true);
                setTab('recall');
              }}
            >
              <Sparkle size={18} />
              主动回忆
            </button>
            <span className="small muted">第 {course.lessons.indexOf(lesson) + 1} 小节</span>
          </div>
          {tab === 'guided' && (
            <div className="material-summary">
              <strong>{lesson.title}</strong>
              <p>{lesson.content.replace(/[#`*]/g, '').slice(0, 90)}…</p>
              <button className="outline-button" onClick={enterFocus}>
                展开全文
              </button>
            </div>
          )}
          <div className="guided-pane" hidden={tab !== 'guided' || focusReading}>
            <GuidedLearning
              data={data}
              course={course}
              lesson={lesson}
              active={tab === 'guided' && !focusReading}
              update={accept}
              onRead={enterFocus}
              onMaterial={() => void markGuidedMaterial()}
              openSettings={() => setModelSettings(true)}
              navigate={navigate}
            />
          </div>
          <article
            className="lesson-article"
            ref={article}
            hidden={tab === 'recall' && !focusReading}
            tabIndex={0}
            aria-label="本节原文"
            style={{ fontSize }}
            onScroll={(event) => {
              const element = event.currentTarget;
              if (!element.clientHeight) return;
              writeLocal(viewKey + ':scroll', element.scrollTop);
              setReadingPercent(
                Math.round(
                  (100 * element.scrollTop) / Math.max(1, element.scrollHeight - element.clientHeight),
                ),
              );
            }}
            onPointerDown={() => {
              if (tab === 'guided') void markGuidedMaterial();
            }}
            onKeyDown={() => {
              if (tab === 'guided') void markGuidedMaterial();
            }}
          >
            <div className="source-label">
              {course.source} {lesson.source && <span> / {lesson.source}</span>}
            </div>
            <h1>{lesson.title}</h1>
            <p className="lesson-goal">这一节，试着用自己的话解释它，并举出一个具体例子。</p>
            <p className="quote-button">
              <Quotes size={16} />
              划选正文，引用提问或记录笔记
            </p>
            <div className="guided-entry" hidden={tab !== 'read' || focusReading}>
              <div>
                <strong>{guided ? '接着刚才的问题，继续想一想。' : '从一个问题开始，学得更深入。'}</strong>
                <p className="small muted">逐层提示，针对缺口补讲，再用新情境验证理解。</p>
              </div>
              <button className="outline-button" onClick={() => setTab('guided')}>
                {guided ? '继续带学' : '跟导师学'}
                <ArrowLeft size={16} style={{ transform: 'rotate(180deg)' }} />
              </button>
            </div>
            <Markdown book={course.id === 'ai-agent-book'}>{lesson.content}</Markdown>
            <div className="reading-end" hidden={focusReading || tab === 'guided'}>
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
          {tab === 'recall' && (
            <section className="recall-panel" hidden={focusReading}>
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
                    先选择，再保存本次结果。评价的是核对前的回答；点评仅供参考，不会自动判定掌握。
                  </p>
                  {assisted && (
                    <p className="small muted">回答前已看过材料、提示或旧对话，本次不计为独立回忆。</p>
                  )}
                  <div className="rating-buttons">
                    <button
                      aria-pressed={rating === 'again'}
                      disabled={saving || checking}
                      onClick={() => setRating('again')}
                    >
                      还没记住<small>仍讲不清 · 明天再练</small>
                    </button>
                    <button
                      aria-pressed={rating === 'hint'}
                      disabled={saving || checking}
                      onClick={() => setRating('hint')}
                    >
                      提示后能解释<small>借助提示才想起 · 明天再练</small>
                    </button>
                    <button
                      aria-pressed={rating === 'good'}
                      disabled={saving || checking || assisted}
                      onClick={() => setRating('good')}
                    >
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
                  <button
                    className="primary"
                    disabled={!rating || saving || checking}
                    onClick={() => rating && void rate(rating)}
                  >
                    {saving ? '正在保存…' : '保存本次结果'}
                  </button>
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
        <Modal
          title="提问与笔记"
          description="关闭面板会保留尚未提交的草稿。"
          className="assistant-dialog"
          open={!rightCollapsed && !focusReading}
          onOpenChange={(open) => setRightCollapsed(!open)}
        >
          <aside className="tutor-panel" id="tutor-panel" aria-label="学习助手面板">
            <div className="assistant-toolbar">
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
                {newChat && (
                  <button
                    className="quiet new-chat-notice"
                    onClick={() => {
                      if (chatPane.current) chatPane.current.scrollTop = chatPane.current.scrollHeight;
                      chatAtEnd.current = true;
                      setNewChat(false);
                    }}
                  >
                    有新回复 · 回到最新
                  </button>
                )}
                <div
                  className={`chat-messages ${messages.length || busy ? '' : 'is-empty'}`}
                  ref={attachChatPane}
                  onScroll={(e) => {
                    const p = e.currentTarget;
                    if (!p.clientHeight) return;
                    chatScrollTop.current = p.scrollTop;
                    chatAtEnd.current = p.scrollHeight - p.scrollTop - p.clientHeight < 64;
                    if (chatAtEnd.current) setNewChat(false);
                  }}
                >
                  {!messages.length && (
                    <div className="tutor-welcome">
                      <p>写下问题，或选一个方式开始。</p>
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
                </div>
                <MessageComposer
                  id="chat-question"
                  value={message}
                  onChange={setMessage}
                  onSend={() => void ask()}
                  onStop={() => abort.current?.abort()}
                  busy={busy}
                  disabled={checking}
                  error={chatError}
                  context={quotePreview}
                />
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
        </Modal>
      </div>
      <Modal
        title="引用原文"
        description="这段内容会随问题或笔记一起保存。"
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
      >
        <p className="quote-full-text">{quote}</p>
      </Modal>
      <Modal
        title="本节已学完"
        description="已记录学习足迹。你可以检验理解，也可以按自己的节奏结束。"
        open={completionActions}
        onOpenChange={setCompletionActions}
      >
        <div className="form-stack">
          <button
            className="primary"
            onClick={() => {
              setCompletionActions(false);
              setTab('recall');
            }}
          >
            开始主动回忆
          </button>
          {next && (
            <button className="outline-button" onClick={() => navigate(`/learn/${course.id}/${next.id}`)}>
              进入下一小节
            </button>
          )}
          <button className="quiet" onClick={() => navigate('/today')}>
            今天先到这里
          </button>
        </div>
      </Modal>
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
