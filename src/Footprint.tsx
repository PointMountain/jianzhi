import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarBlank, Repeat, Images, Sparkle } from '@phosphor-icons/react';
import type { Bootstrap, Progress } from '../shared/types';
import { dayKey, formatDay, keyFor, request } from './lib';
import { Markdown } from './Markdown';
import { SummaryImage } from './SummaryImage';
import { SelectField, Segmented } from './Controls';

function shift(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + offset);
  return dayKey(date);
}
export function calendarDays(month: string) {
  const first = `${month}-01`,
    weekday = new Date(`${first}T12:00:00+08:00`).getUTCDay();
  return Array.from({ length: 42 }, (_, i) => shift(first, i - ((weekday + 6) % 7)));
}
function recallState(progress: Progress, today: string) {
  return progress.due <= today ? 'due' : progress.independentDates.length >= 2 ? 'steady' : 'learning';
}

export function Footprint({
  data,
  route,
  update,
  navigate,
}: {
  data: Bootstrap;
  route: string;
  update: (data: Bootstrap) => void;
  navigate: (path: string) => void;
}) {
  const { state, today } = data;
  const parameter = new URLSearchParams(route.split('?')[1]);
  const tab = route === '/reviews' ? 'reviews' : parameter.get('tab') || 'calendar';
  const [month, setMonth] = useState(today.slice(0, 7)),
    [day, setDay] = useState(today);
  const [filter, setFilter] = useState('due'),
    [courseId, setCourseId] = useState(parameter.get('course') || state.courses[0]?.id || '');
  const course = state.courses.find((c) => c.id === courseId);
  const [lessonId, setLessonId] = useState(parameter.get('lesson') || '');
  const lesson = course?.lessons.find((l) => l.id === lessonId) || course?.lessons[0];
  useEffect(() => {
    const params = new URLSearchParams(route.split('?')[1]);
    const requestedCourse = params.get('course');
    if (requestedCourse) {
      setCourseId(requestedCourse);
      setLessonId(params.get('lesson') || '');
    }
  }, [route]);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const cards = state.summaries || [];
  const activities = [...state.reviews, ...state.notes, ...cards];
  const activeDays = new Set(activities.map((a) => dayKey(new Date(a.createdAt))));
  let streak = 0,
    cursor = activeDays.has(today) ? today : shift(today, -1);
  while (activeDays.has(cursor)) {
    streak++;
    cursor = shift(cursor, -1);
  }
  const progress = Object.values(state.progress);
  const stats = [
    ['连续记录', streak, '天'],
    ['累计学习', activeDays.size, '天'],
    ['跨日独立回忆', progress.filter((p) => p.independentDates.length >= 2).length, '节'],
    ['总结图卡', cards.length, '张'],
  ];
  const source = (c: string, l?: string) => {
    const course = state.courses.find((item) => item.id === c);
    return { course, lesson: course?.lessons.find((item) => item.id === l) };
  };
  const diagrams = Object.entries(state.chats).flatMap(([key, messages]) =>
    messages.flatMap((message, index) => {
      if (message.role !== 'assistant' || !/```mermaid\s/.test(message.content)) return [];
      const found = state.courses
        .flatMap((c) => c.lessons.map((l) => ({ c, l })))
        .find(({ c, l }) => keyFor(c.id, l.id) === key);
      return found ? [{ id: `${key}:${index}`, ...found, content: message.content }] : [];
    }),
  );
  async function generate() {
    if (!course || !lesson) return;
    setBusy(true);
    setError('');
    controller.current = new AbortController();
    try {
      update(
        await request(
          '/summaries',
          { courseId: course.id, lessonId: lesson.id },
          'POST',
          controller.current.signal,
        ),
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function changeMonth(offset: number) {
    const date = new Date(`${month}-01T12:00:00+08:00`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    setMonth(dayKey(date).slice(0, 7));
  }
  const dayReviews = state.reviews.filter((r) => dayKey(new Date(r.createdAt)) === day);
  const dayNotes = state.notes.filter((n) => dayKey(new Date(n.createdAt)) === day);
  const dayCards = cards.filter((c) => dayKey(new Date(c.createdAt)) === day);
  return (
    <div className="page footprint-page">
      <div className="page-heading">
        <div>
          <h1>
            {tab === 'reviews'
              ? '把学过的，再想起来。'
              : tab === 'gallery'
                ? '把理解，留成一张图。'
                : '学习留下的形状'}
          </h1>
          <p>
            {tab === 'reviews'
              ? '从一次独立回忆开始，让知识慢慢变牢固。'
              : tab === 'gallery'
                ? '收好知识的要点，也保留回到原文的线索。'
                : '回看走过的路，把理解留到更久以后。'}
          </p>
        </div>
      </div>
      <div className="footprint-tabs" aria-label="足迹视图">
        {[
          { id: 'calendar', label: '足迹日历', Icon: CalendarBlank },
          { id: 'reviews', label: '间隔复习', Icon: Repeat },
          { id: 'gallery', label: '总结画廊', Icon: Images },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            aria-pressed={tab === id}
            onClick={() => navigate(id === 'reviews' ? '/reviews' : `/activity?tab=${id}`)}
          >
            <Icon size={19} />
            {label}
          </button>
        ))}
      </div>
      {tab === 'calendar' && (
        <>
          <div className="activity-stats footprint-stats">
            {stats.map(([label, count, unit]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>
                  {count}
                  <small>{unit}</small>
                </strong>
              </div>
            ))}
          </div>
          <div className="calendar-layout">
            <section className="panel calendar-panel">
              <div className="section-heading">
                <h2>
                  {Number(month.slice(0, 4))} 年 {Number(month.slice(5))} 月
                </h2>
                <div className="button-row">
                  <button className="icon-button" aria-label="上个月" onClick={() => changeMonth(-1)}>
                    <ArrowLeft size={18} />
                  </button>
                  <button
                    className="quiet"
                    onClick={() => {
                      setMonth(today.slice(0, 7));
                      setDay(today);
                    }}
                  >
                    今天
                  </button>
                  <button className="icon-button" aria-label="下个月" onClick={() => changeMonth(1)}>
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
              <div className="calendar-week">
                {'一二三四五六日'.split('').map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>
              <div className="calendar-grid">
                {calendarDays(month).map((date) => {
                  const reviews = state.reviews.filter((r) => dayKey(new Date(r.createdAt)) === date).length;
                  const notes = state.notes.filter((n) => dayKey(new Date(n.createdAt)) === date).length;
                  const summaries = cards.filter((c) => dayKey(new Date(c.createdAt)) === date).length;
                  return (
                    <button
                      key={date}
                      className={`${date.slice(0, 7) !== month ? 'outside' : ''} ${date === today ? 'today' : ''} ${date === day ? 'selected' : ''}`}
                      aria-label={`${date}，${reviews} 次练习，${notes} 条笔记，${summaries} 张总结`}
                      aria-pressed={date === day}
                      onClick={() => setDay(date)}
                    >
                      <span>{Number(date.slice(-2))}</span>
                      <div className="day-markers">
                        {!!reviews && <i className="practice" />}
                        {!!notes && <i className="note" />}
                        {!!summaries && <i className="image" />}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="calendar-legend">
                <span>
                  <i className="practice" />
                  回忆练习
                </span>
                <span>
                  <i className="note" />
                  笔记与疑问
                </span>
                <span>
                  <i className="image" />
                  总结图卡
                </span>
              </div>
            </section>
            <section className="panel day-detail">
              <span className="eyebrow">DAILY FOOTPRINT</span>
              <h2>{formatDay(day)}的足迹</h2>
              <p className="small muted">
                {dayReviews.length} 次练习 · {dayNotes.length} 条笔记 · {dayCards.length} 张总结
              </p>
              {!dayReviews.length && !dayNotes.length && !dayCards.length && (
                <div className="footprint-empty">
                  <CalendarBlank size={32} />
                  <h3>这一天，还没有记录。</h3>
                  <p>完成回忆练习、记笔记或生成总结后，会在日历里留下足迹。</p>
                </div>
              )}
              {dayReviews.map((r) => {
                const { lesson } = source(r.courseId, r.lessonId);
                return (
                  <div className="day-entry" key={r.id}>
                    <span className="badge">
                      {{ again: '还需巩固', hint: '提示后解释', good: '独立解释' }[r.rating]}
                    </span>
                    <h3>{lesson?.title}</h3>
                    <p>{r.answer}</p>
                    <button
                      className="quiet"
                      onClick={() => navigate(`/learn/${r.courseId}/${r.lessonId}?recall`)}
                    >
                      再试一次 <ArrowRight size={15} />
                    </button>
                  </div>
                );
              })}
              {dayNotes.map((n) => (
                <div className="day-entry" key={n.id}>
                  <span className="badge">{n.kind === 'question' ? '留下的疑问' : '个人笔记'}</span>
                  <h3>{source(n.courseId, n.lessonId).lesson?.title || source(n.courseId).course?.title}</h3>
                  <Markdown>{n.content}</Markdown>
                  <button
                    className="quiet"
                    onClick={() => navigate(n.lessonId ? `/learn/${n.courseId}/${n.lessonId}` : '/notes')}
                  >
                    回到记录出处 <ArrowRight size={15} />
                  </button>
                </div>
              ))}
              {dayCards.map((c) => (
                <div className="day-entry" key={c.id}>
                  <span className="badge">总结图卡</span>
                  <h3>{c.title}</h3>
                  <button className="quiet" onClick={() => navigate('/activity?tab=gallery')}>
                    在画廊查看 <ArrowRight size={15} />
                  </button>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
      {tab === 'reviews' && (
        <>
          <section className="panel review-overview">
            <div>
              <span className="eyebrow">SPACED PRACTICE</span>
              <h2>隔一段时间，再把它想起来。</h2>
              <p>独立回忆后逐步延长间隔；需要提示时，回到短间隔。当天重复练习不会推进复习阶段。</p>
            </div>
            <div className="interval-track">
              {[1, 3, 7, 14, 30].map((days, i) => (
                <div key={days}>
                  <strong>
                    {days}
                    <small>天</small>
                  </strong>
                  <span>{progress.filter((p) => p.stage === i).length} 个小节</span>
                </div>
              ))}
            </div>
            <p className="small muted">这是按回答安排的复习计划，不代表对记忆率或掌握程度的测量。</p>
          </section>
          <div className="review-forecast" aria-label="未来七天复习安排">
            {Array.from({ length: 7 }, (_, i) => shift(today, i)).map((date, i) => {
              const count = progress.filter((p) => (i === 0 ? p.due <= date : p.due === date)).length;
              return (
                <div key={date}>
                  <span>{i === 0 ? '今天 · 含逾期' : formatDay(date)}</span>
                  <strong>{count}</strong>
                  <div style={{ height: Math.min(56, count * 8 + 4) }} />
                </div>
              );
            })}
          </div>
          <div className="filter-row">
            <Segmented
              label="复习状态"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'due', label: '到期复习' },
                { value: 'learning', label: '正在巩固' },
                { value: 'steady', label: '跨日独立回忆' },
                { value: 'all', label: '全部' },
              ].map((f) => ({
                ...f,
                label: (
                  <>
                    {f.label}
                    <span className="segment-count">
                      {progress.filter((p) => f.value === 'all' || recallState(p, today) === f.value).length}
                    </span>
                  </>
                ),
              }))}
            />
          </div>
          <div className="review-list">
            {progress
              .filter((p) => filter === 'all' || recallState(p, today) === filter)
              .sort((a, b) => a.due.localeCompare(b.due))
              .map((p) => {
                const { course, lesson } = source(p.courseId, p.lessonId);
                if (!course || !lesson) return null;
                return (
                  <div className="review-row panel" key={keyFor(p.courseId, p.lessonId)}>
                    <div className="review-icon">
                      <Repeat size={24} />
                    </div>
                    <div>
                      <span className="small muted">{course.title}</span>
                      <h3>{lesson.title}</h3>
                      <p>
                        下次复习 {p.due} · 已练习 {p.attempts} 次 · {p.independentDates.length} 天独立回忆
                      </p>
                    </div>
                    <button
                      className="primary"
                      onClick={() => navigate(`/learn/${p.courseId}/${p.lessonId}?recall`)}
                    >
                      开始回忆
                    </button>
                  </div>
                );
              })}
          </div>
          {!progress.some((p) => filter === 'all' || recallState(p, today) === filter) && (
            <div className="footprint-empty">
              <Repeat size={32} />
              <h3>{progress.length ? '这一组暂时没有复习任务。' : '先留下第一次回忆。'}</h3>
              <p>完成小节自测并记录自评后，会自动安排下一次复习。</p>
              <button className="outline-button" onClick={() => navigate('/courses')}>
                去书架学习
              </button>
            </div>
          )}
        </>
      )}
      {tab === 'gallery' && (
        <>
          <section className="panel gallery-compose">
            <div>
              <span className="eyebrow">KEEP THE ESSENCE</span>
              <h2>把一个小节，收进一张图。</h2>
              <p>
                Codex 结合原文、你的笔记与回答生成要点，排成可下载的 PNG 图卡。共学中的 Mermaid
                图解也会自动收录。
              </p>
            </div>
            <div className="gallery-controls">
              <label>
                学习主题
                <SelectField
                  label="总结主题"
                  value={courseId}
                  disabled={busy}
                  placeholder="请先添加学习主题"
                  onChange={(value) => {
                    setCourseId(value);
                    setLessonId('');
                  }}
                  options={state.courses.map((c) => ({ value: c.id, label: c.title }))}
                />
              </label>
              <label>
                小节
                <SelectField
                  label="总结小节"
                  value={lesson?.id || ''}
                  disabled={busy}
                  placeholder="选择学习小节"
                  onChange={setLessonId}
                  options={course?.lessons.map((l) => ({ value: l.id, label: l.title })) || []}
                />
              </label>
              <div className="button-row">
                <button className="primary" disabled={busy || !lesson} onClick={() => void generate()}>
                  <Sparkle size={18} />
                  {busy ? '正在整理总结…' : '生成总结图卡'}
                </button>
                {busy && (
                  <button className="quiet" onClick={() => controller.current?.abort()}>
                    取消
                  </button>
                )}
              </div>
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </section>
          <div className="section-heading spaced">
            <h2>我的总结与图解</h2>
            <span className="small muted">
              {cards.length} 张图卡 · {diagrams.length} 份图解
            </span>
          </div>
          {!cards.length && !diagrams.length && (
            <div className="footprint-empty">
              <Images size={34} />
              <h3>给刚理解的知识，留一张便签。</h3>
              <p>生成第一张总结，或在共学中让 Codex 画清概念关系。</p>
            </div>
          )}
          <div className="summary-gallery">
            {cards.map((card) => {
              const { course, lesson } = source(card.courseId, card.lessonId);
              return (
                <article className="panel gallery-card" key={card.id}>
                  <SummaryImage card={card} source={`${course?.title || ''} / ${lesson?.title || ''}`} />
                  <button
                    className="quiet"
                    onClick={() => navigate(`/learn/${card.courseId}/${card.lessonId}`)}
                  >
                    回到来源小节 <ArrowRight size={15} />
                  </button>
                </article>
              );
            })}
            {diagrams.map((diagram) => (
              <article className="panel gallery-card diagram-card" key={diagram.id}>
                <span className="badge">共学图解</span>
                <h3>{diagram.l.title}</h3>
                <Markdown>{diagram.content}</Markdown>
                <button className="quiet" onClick={() => navigate(`/learn/${diagram.c.id}/${diagram.l.id}`)}>
                  继续追问 <ArrowRight size={15} />
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
