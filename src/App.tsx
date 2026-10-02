import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookBookmark,
  BookOpen,
  CalendarBlank,
  CaretRight,
  Check,
  CheckCircle,
  CircleNotch,
  Clock,
  DownloadSimple,
  FileText,
  GearSix,
  GitBranch,
  Leaf,
  MagnifyingGlass,
  Moon,
  NotePencil,
  Play,
  Plus,
  Quotes,
  Repeat,
  Sparkle,
  Sun,
  Target,
  TerminalWindow,
  TreeStructure,
  UploadSimple,
} from '@phosphor-icons/react';
import type { Bootstrap, Course, Note } from '../shared/types';
import { courseProgress, dayKey, daysEnding, formatDay, keyFor, request, toLesson } from './lib';
import { NewCourse } from './NewCourse';
import { Learning } from './Learning';
import { Markdown } from './Markdown';
import { Modal } from './Modal';
import { ModelSettings } from './ModelSettings';
import { Footprint } from './Footprint';
import { SelectField, Segmented, Disclosure } from './Controls';

const nav = [
  { path: '/today', label: '今日', icon: Sun },
  { path: '/courses', label: '书架', icon: BookOpen },
  { path: '/map', label: '知识路线', icon: TreeStructure },
  { path: '/reviews', label: '复习', icon: Repeat },
  { path: '/notes', label: '笔记', icon: NotePencil },
  { path: '/activity', label: '足迹', icon: Leaf },
] as const;

export function App() {
  useEffect(() => {
    const updateDay = () =>
      setData((previous) => {
        const today = dayKey(new Date());
        return previous && previous.today !== today ? { ...previous, today } : previous;
      });
    const timer = setInterval(updateDay, 60_000);
    document.addEventListener('visibilitychange', updateDay);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', updateDay);
    };
  }, []);
  const [data, setData] = useState<Bootstrap | null>(null),
    [error, setError] = useState('');
  const [route, setRoute] = useState(location.hash.slice(1) || '/today');
  const [theme, setTheme] = useState(
    () =>
      localStorage.getItem('jianzhi-theme') ||
      localStorage.getItem('learn-local-theme') ||
      localStorage.getItem('shizhi-theme') ||
      'light',
  );
  const [notice, setNotice] = useState(''),
    [newCourse, setNewCourse] = useState(false),
    [initialTitle, setInitialTitle] = useState(''),
    [imported, setImported] = useState(false);
  const [topic, setTopic] = useState(''),
    [search, setSearch] = useState(''),
    [activeCourse, setActiveCourse] = useState('');
  const [noteModal, setNoteModal] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalError, setGoalError] = useState('');
  useEffect(() => {
    const change = () => {
      setRoute(location.hash.slice(1) || '/today');
      window.scrollTo(0, 0);
      requestAnimationFrame(() => document.getElementById('main-content')?.focus({ preventScroll: true }));
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('jianzhi-theme', theme);
  }, [theme]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function refresh(force = false) {
    setError('');
    try {
      setData(await request(force ? '/bootstrap?refresh=1' : '/bootstrap'));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const navigate = (path: string) => {
    location.hash = path;
  };
  function create(title = '', isImport = false) {
    setInitialTitle(title);
    setImported(isImport);
    setNewCourse(true);
  }
  if (!data)
    return (
      <div className="boot">
        <div className="brand-symbol">
          <BookBookmark size={28} />
        </div>
        <h1>渐知</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="primary" onClick={() => void refresh()}>
              重新连接
            </button>
          </>
        ) : (
          <>
            <div className="skeleton" />
            <p>正在打开你的学习空间…</p>
          </>
        )}
      </div>
    );
  const { state, today } = data;
  const due = Object.values(state.progress).filter((p) => p.due <= today);
  const totalLearned = Object.keys(state.progress).length;
  const delayed = Object.values(state.progress).filter((p) => p.independentDates.length >= 2).length;
  const parts = route.split('?')[0].split('/').filter(Boolean);
  const course = state.courses.find((c) => c.id === parts[1]);
  const lesson = course?.lessons.find((l) => l.id === parts[2]);
  const learning = parts[0] === 'learn' && course && lesson;
  const selected = state.courses.find((c) => c.id === activeCourse) ?? state.courses[0];
  const minutesToday = Math.floor(
    state.reviews
      .filter((r) => dayKey(new Date(r.createdAt)) === today)
      .reduce((sum, r) => sum + r.seconds, 0) / 60,
  );
  const first = state.courses.find((c) => c.id === state.reviews.at(-1)?.courseId) ?? state.courses[0];
  const next = first?.lessons.find((l) => !state.progress[keyFor(first.id, l.id)]) ?? first?.lessons[0];
  const week = daysEnding(today, 7);
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        跳到主要内容
      </a>
      <aside className="sidebar">
        <a href="#/today" className="brand" aria-label="渐知首页">
          <BookBookmark size={29} weight="duotone" />
          <span>渐知</span>
        </a>
        <nav aria-label="主要导航">
          {nav.map(({ path, label, icon: Icon }) => (
            <a
              key={path}
              href={`#${path}`}
              className={
                route.split('?')[0] === path ||
                (path === '/courses' && ['course', 'learn'].includes(parts[0]))
                  ? 'active'
                  : ''
              }
              aria-current={
                route.split('?')[0] === path ||
                (path === '/courses' && ['course', 'learn'].includes(parts[0]))
                  ? 'page'
                  : undefined
              }
              title={label}
            >
              <Icon size={23} weight={route === path ? 'duotone' : 'regular'} />
              <span>{label}</span>
              {path === '/reviews' && due.length > 0 && <b className="nav-count">{due.length}</b>}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => create()} className="add-button" aria-label="新建学习主题">
            <Plus size={22} />
          </button>
          <button
            className="icon-button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <a
            href="#/settings"
            className={`settings-link ${route === '/settings' ? 'active' : ''}`}
            aria-current={route === '/settings' ? 'page' : undefined}
            aria-label="学习设置"
          >
            <GearSix size={21} />
          </a>
          <div className="avatar" title="我的本地学习空间">
            我
          </div>
        </div>
      </aside>
      {learning ? (
        <Learning
          key={`${course.id}:${lesson.id}`}
          data={data}
          course={course}
          lesson={lesson}
          navigate={navigate}
          update={setData}
          toast={setNotice}
        />
      ) : (
        <main className="workspace" id="main-content" tabIndex={-1}>
          <header className="topbar">
            <div className="breadcrumb">
              渐知 · 本地学习工作台 <CaretRight size={13} />
              <span>
                {nav.find((n) => n.path === route.split('?')[0])?.label ||
                  (parts[0] === 'course' ? '课程详情' : '学习设置')}
              </span>
            </div>
            <div className="storage-state">
              <span />
              所有记录保存在本机
            </div>
          </header>
          {route === '/today' ? (
            <div className="page today-page">
              <div className="page-heading">
                <div>
                  <p className="date-label">
                    {new Date(`${today}T12:00:00+08:00`).toLocaleDateString('zh-CN', {
                      month: 'long',
                      day: 'numeric',
                      weekday: 'long',
                    })}
                  </p>
                  <h1>今天，学懂一点。</h1>
                  <p>带着好奇开始，带着理解离开。</p>
                </div>
                <div className="daily-goal">
                  <Target size={18} />
                  <span>
                    每日目标 <strong>{state.preferences.dailyMinutes} 分钟</strong>
                  </span>
                </div>
              </div>
              <div className="today-grid">
                <section className="main-column">
                  <section className="discover panel">
                    <div className="section-heading">
                      <h2>你想弄懂什么？</h2>
                      <Sparkle size={21} />
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        create(topic);
                      }}
                    >
                      <label className="sr-only" htmlFor="topic">
                        想学习的主题
                      </label>
                      <input
                        id="topic"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="一本书、一个概念，或一个一直没想明白的问题…"
                        maxLength={120}
                      />
                      <button aria-label="创建这个学习主题" className="round-send" type="submit">
                        <ArrowRight size={20} />
                      </button>
                    </form>
                    <div className="discover-bottom">
                      <button onClick={() => create('', true)}>
                        <UploadSimple size={16} />
                        导入学习材料
                      </button>
                      <span>也可以导入自己的材料</span>
                    </div>
                  </section>
                  <div className="section-heading spaced">
                    <h2>接着上次的小步</h2>
                    <a href="#/courses">
                      全部主题 <CaretRight size={14} />
                    </a>
                  </div>
                  {first && next ? (
                    <section className="continue-card panel">
                      <div className="book-cover">
                        <div className="cover-top">LOCAL / LEARNING</div>
                        <BookOpen size={33} weight="thin" />
                        <div>
                          <span>正在学习</span>
                          <strong>{first.title}</strong>
                          <small>{first.lessons.length} 个值得弄懂的小节</small>
                        </div>
                        <div className="cover-bottom">
                          学习手记 <span>01</span>
                        </div>
                      </div>
                      <div className="continue-copy">
                        <span className="badge">{totalLearned ? '继续学习' : '从零开始'}</span>
                        <h3>{first.title}</h3>
                        <p>{first.goal}</p>
                        <div className="course-progress">
                          <span>
                            {courseProgress(first, state)} / {first.lessons.length} 个小节已练习
                          </span>
                          <span>
                            {Math.round((courseProgress(first, state) / first.lessons.length) * 100)}%
                          </span>
                        </div>
                        <div className="progress-track">
                          <i
                            style={{
                              width: `${(courseProgress(first, state) / first.lessons.length) * 100}%`,
                            }}
                          />
                        </div>
                        <div className="continue-bottom">
                          <span>
                            <BookOpen size={16} />
                            {next.title}
                          </span>
                          <button className="primary" onClick={() => navigate(toLesson(first, state))}>
                            {totalLearned ? '继续学习' : '开始第一课'}
                            <Play size={15} weight="fill" />
                          </button>
                        </div>
                      </div>
                    </section>
                  ) : (
                    <div className="empty panel">
                      <BookOpen size={32} />
                      <h3>第一段学习，从一个问题开始。</h3>
                      <button className="primary" onClick={() => create()}>
                        添加学习主题
                      </button>
                    </div>
                  )}
                  <section className="review-strip panel">
                    <div className="review-icon">
                      <Repeat size={23} />
                    </div>
                    <div>
                      <h3>{due.length ? `${due.length} 个知识点，到了重逢的时候` : '今天还没有到期复习'}</h3>
                      <p>
                        {totalLearned
                          ? '复习日期会跟着你的实际回答调整。'
                          : '完成第一次回忆练习后，这里会提醒你回来巩固。'}
                      </p>
                    </div>
                    <button className="quiet" onClick={() => navigate('/reviews')}>
                      查看安排
                      <CaretRight size={16} />
                    </button>
                  </section>
                  <div className="section-heading spaced">
                    <h2>让学习留下来</h2>
                  </div>
                  <div className="learning-loop">
                    <div>
                      <span>01</span>
                      <BookOpen size={21} />
                      <h3>读一小段</h3>
                      <p>一次聚焦一个问题</p>
                    </div>
                    <CaretRight size={17} />
                    <div>
                      <span>02</span>
                      <ChatIcon />
                      <h3>说出你的理解</h3>
                      <p>用自己的话解释</p>
                    </div>
                    <CaretRight size={17} />
                    <div>
                      <span>03</span>
                      <Repeat size={21} />
                      <h3>隔几天再想起</h3>
                      <p>让理解慢慢变牢固</p>
                    </div>
                  </div>
                </section>
                <aside className="right-column">
                  <section className="week-panel panel">
                    <div className="section-heading">
                      <h2>这一周</h2>
                      <CalendarBlank size={18} />
                    </div>
                    <div className="week-grid">
                      {week.map((day) => {
                        const count = state.reviews.filter(
                          (r) => dayKey(new Date(r.createdAt)) === day,
                        ).length;
                        return (
                          <div key={day}>
                            <span>
                              {new Date(`${day}T12:00:00+08:00`).toLocaleDateString('zh-CN', {
                                weekday: 'narrow',
                              })}
                            </span>
                            <div
                              className={`day-square ${day === today ? 'today' : ''} ${count ? 'studied' : ''}`}
                              title={`${day}：${count} 次练习`}
                            >
                              {count ? <Check size={15} /> : new Date(`${day}T12:00:00+08:00`).getDate()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="week-stats">
                      <div>
                        <strong>{totalLearned}</strong>
                        <span>小节已练习</span>
                      </div>
                      <div>
                        <strong>{state.reviews.length}</strong>
                        <span>回忆练习</span>
                      </div>
                    </div>
                    <div className="daily-track">
                      <div>
                        <span>今日专注</span>
                        <strong>
                          {minutesToday} <small>/ {state.preferences.dailyMinutes} 分钟</small>
                        </strong>
                      </div>
                      <div className="progress-track">
                        <i
                          style={{
                            width: `${Math.min(100, (minutesToday / state.preferences.dailyMinutes) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </section>
                  <section className="notes-preview panel">
                    <div className="section-heading">
                      <h2>留个问号</h2>
                      <Quotes size={19} />
                    </div>
                    {state.notes.some((n) => n.kind === 'question' && !n.resolved) ? (
                      state.notes
                        .filter((n) => n.kind === 'question' && !n.resolved)
                        .slice(0, 2)
                        .map((n) => (
                          <p className="question-preview" key={n.id}>
                            {n.content}
                          </p>
                        ))
                    ) : (
                      <p>遇到一个不熟悉的词，先记下来。问题也可以成为下一次学习的起点。</p>
                    )}
                    <button className="outline-button wide" onClick={() => setNoteModal(true)}>
                      <Plus size={15} />
                      记下一个疑问
                    </button>
                  </section>
                  <section className="quiet-note">
                    <span className="quote-mark">“</span>
                    <p>
                      能看懂，是起点。
                      <br />
                      能讲清楚，是下一步。
                    </p>
                    <span>记录真实的理解，不着急打勾。</span>
                  </section>
                </aside>
              </div>
            </div>
          ) : route === '/courses' ? (
            <div className="page">
              <PageHeading
                title="我的书架"
                subtitle="把值得学习的内容，放在一个地方。"
                action={
                  <button className="primary" onClick={() => create()}>
                    <Plus size={17} />
                    新建主题
                  </button>
                }
              />
              <div className="filter-row">
                <span>{state.courses.length} 个学习主题</span>
                <Search value={search} change={setSearch} placeholder="搜索学习主题" />
              </div>
              {search.trim() &&
                !state.courses.some((c) =>
                  `${c.title} ${c.goal}`.toLowerCase().includes(search.trim().toLowerCase()),
                ) && (
                  <Empty
                    label="没有找到匹配的主题"
                    description="试试更短的关键词，或清空搜索查看全部主题。"
                  />
                )}
              <div className="courses-grid">
                {state.courses
                  .filter((c) => `${c.title} ${c.goal}`.toLowerCase().includes(search.trim().toLowerCase()))
                  .map((c, i) => (
                    <CourseCard key={c.id} course={c} data={data} index={i} navigate={navigate} />
                  ))}
                <button className="new-course-card" onClick={() => create('', true)}>
                  <UploadSimple size={29} />
                  <strong>带来新的学习材料</strong>
                  <span>选择本地仓库、导入文档，或让 Codex 帮你规划</span>
                </button>
              </div>
            </div>
          ) : parts[0] === 'course' && course ? (
            <CourseDetail course={course} data={data} navigate={navigate} />
          ) : route === '/map' ? (
            <div className="page">
              <PageHeading
                title="知识有了路线"
                subtitle="看清知识之间的先后关系，找到你现在的位置。"
                action={
                  <SelectField
                    label="选择路线主题"
                    value={selected?.id || ''}
                    onChange={setActiveCourse}
                    placeholder="先添加学习主题"
                    options={state.courses.map((c) => ({ value: c.id, label: c.title }))}
                  />
                }
              />
              {selected ? (
                <>
                  <div className="map-intro">
                    <div>
                      <span className="badge">当前学习目标</span>
                      <h2>{selected.goal}</h2>
                    </div>
                    <div className="map-legend">
                      <span>
                        <i />
                        待探索
                      </span>
                      <span>
                        <i className="current" />
                        下一步
                      </span>
                      <span>
                        <i className="done" />
                        已练习
                      </span>
                    </div>
                  </div>
                  <div className="knowledge-map">
                    {Array.from(new Set(selected.lessons.map((l) => l.chapterIndex))).map((ch, i) => {
                      const lessons = selected.lessons.filter((l) => l.chapterIndex === ch);
                      const done = lessons.filter((l) => state.progress[keyFor(selected.id, l.id)]).length;
                      const target =
                        lessons.find((l) => !state.progress[keyFor(selected.id, l.id)]) ?? lessons[0];
                      return (
                        <button
                          className={`map-node ${target.id === selected.lessons.find((l) => !state.progress[keyFor(selected.id, l.id)])?.id ? 'current' : ''} ${done === lessons.length ? 'done' : ''}`}
                          key={ch}
                          onClick={() => navigate(`/learn/${selected.id}/${target.id}`)}
                        >
                          <span className="node-number">{String(ch).padStart(2, '0')}</span>
                          <h3>{lessons[0].chapter}</h3>
                          <p>
                            {lessons.length} 个小节 · {done} 个已练习
                          </p>
                          <div className="node-dots">
                            {lessons.slice(0, 18).map((l) => (
                              <i
                                key={l.id}
                                className={state.progress[keyFor(selected.id, l.id)] ? 'done' : ''}
                              />
                            ))}
                            {lessons.length > 18 && <small>+{lessons.length - 18}</small>}
                          </div>
                          <span className="node-link">
                            {done ? '接着往前走' : '开始探索'}
                            <CaretRight size={15} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="map-footnote">
                    路线表示学习顺序；是否真正记住，会在后续的回忆练习中留下证据。
                  </p>
                </>
              ) : (
                <Empty label="先添加一个学习主题" />
              )}
            </div>
          ) : route === '/reviews' || parts[0] === 'activity' ? (
            <Footprint data={data} route={route} update={setData} navigate={navigate} />
          ) : route === '/notes' ? (
            <NotesPage data={data} update={setData} toast={setNotice} open={() => setNoteModal(true)} />
          ) : route === '/settings' ? (
            <div className="page settings-page">
              <PageHeading title="按自己的节奏" subtitle="学习需要持续，也需要留一点余地。" />
              <section className="panel settings-panel">
                <div className="section-heading">
                  <h2>每日学习目标</h2>
                  <Target size={21} />
                </div>
                <p>这个目标用于安排节奏，随时可以调整。</p>
                <div className="time-options" role="group" aria-label="每日学习时长" aria-busy={savingGoal}>
                  {[15, 30, 60].map((m) => (
                    <button
                      key={m}
                      className={state.preferences.dailyMinutes === m ? 'selected' : ''}
                      aria-pressed={state.preferences.dailyMinutes === m}
                      disabled={savingGoal}
                      onClick={async () => {
                        setSavingGoal(true);
                        setGoalError('');
                        try {
                          setData(await request('/preferences', { dailyMinutes: m }));
                          setNotice('学习节奏已更新');
                        } catch (e) {
                          setGoalError((e as Error).message);
                        } finally {
                          setSavingGoal(false);
                        }
                      }}
                    >
                      <strong>{m}</strong> 分钟
                    </button>
                  ))}
                </div>
              </section>
              {goalError && (
                <p className="error" role="alert">
                  {goalError}
                </p>
              )}
              <ModelSettings data={data} update={setData} toast={setNotice} />
              <section className="panel settings-panel">
                <h2>我的学习空间</h2>
                <p>所有主题的资料、回答、笔记和复习记录，统一保存在本机。</p>
                <p className="workspace-path">
                  <code>{data.storagePath}</code>
                </p>
                <p>
                  study.json 保存完整记录；topics 按主题收纳资料与练习；exports 保存自动更新的学习笔记。
                  备份整个学习空间即可一起带走。
                </p>
                <div className="button-row">
                  <a className="outline-button" href="/api/export?format=markdown" download>
                    <DownloadSimple size={17} />
                    导出 Markdown
                  </a>
                  <a className="outline-button" href="/api/export" download>
                    <DownloadSimple size={17} />
                    备份 JSON
                  </a>
                </div>
              </section>
            </div>
          ) : (
            <div className="page">
              <Empty label="这里还没有内容" />
              <button className="primary" onClick={() => navigate('/today')}>
                回到今日
              </button>
            </div>
          )}
        </main>
      )}
      <NewCourse
        open={newCourse}
        close={() => setNewCourse(false)}
        initialTitle={initialTitle}
        imported={imported}
        saved={(result) => {
          setData(result);
          setNewCourse(false);
          setTopic('');
          navigate(`/course/${result.courseId}`);
          setNotice('新的学习主题已准备好');
        }}
      />
      <NoteForm
        data={data}
        open={noteModal}
        close={() => setNoteModal(false)}
        saved={(result) => {
          setData(result);
          setNoteModal(false);
          setNotice('已保存到笔记本');
        }}
      />
      {notice && (
        <div className="toast" role="status">
          <CheckCircle size={18} />
          {notice}
        </div>
      )}
    </>
  );
}
function ChatIcon() {
  return <Quotes size={21} />;
}
function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function Search({
  value,
  change,
  placeholder,
}: {
  value: string;
  change: (s: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search">
      <MagnifyingGlass size={18} />
      <input
        type="search"
        value={value}
        onChange={(e) => change(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </label>
  );
}
function Empty({ label, description }: { label: string; description?: string }) {
  return (
    <div className="empty">
      <BookOpen size={30} weight="thin" />
      <h3>{label}</h3>
      {description && <p>{description}</p>}
    </div>
  );
}
function CourseCard({
  course,
  data,
  index,
  navigate,
}: {
  course: Course;
  data: Bootstrap;
  index: number;
  navigate: (p: string) => void;
}) {
  const count = courseProgress(course, data.state);
  return (
    <button className="course-card panel" onClick={() => navigate(`/course/${course.id}`)}>
      <div className={`course-cover tone-${index % 3}`}>
        <span>{String(index + 1).padStart(2, '0')}</span>
        <BookOpen size={29} weight="thin" />
        <h2>{course.title}</h2>
        <small>{course.description}</small>
      </div>
      <div className="course-card-body">
        <span className="small muted">{course.source}</span>
        <h3>{course.title}</h3>
        <p>{course.goal}</p>
        <div className="course-progress">
          <span>
            {count} / {course.lessons.length} 小节
          </span>
          <span>{count ? '继续学习' : '尚未开始'}</span>
        </div>
        <div className="progress-track">
          <i style={{ width: `${(count / course.lessons.length) * 100}%` }} />
        </div>
      </div>
    </button>
  );
}
function CourseDetail({
  course,
  data,
  navigate,
}: {
  course: Course;
  data: Bootstrap;
  navigate: (p: string) => void;
}) {
  return (
    <div className="page">
      <PageHeading
        title={course.title}
        subtitle={course.goal}
        action={
          <button className="primary" onClick={() => navigate(toLesson(course, data.state))}>
            <Play size={16} weight="fill" />
            开始学习
          </button>
        }
      />
      <div className="course-meta">
        <span>
          <FileText size={16} />
          {course.source}
        </span>
        <span>
          <BookOpen size={16} />
          {course.lessons.length} 个学习小节
        </span>
        {course.sourceUrl && (
          <a href={course.sourceUrl} target="_blank" rel="noreferrer">
            查看来源
          </a>
        )}
      </div>
      <div className="chapter-list">
        {Array.from(new Set(course.lessons.map((l) => l.chapterIndex))).map((ch) => (
          <Disclosure
            key={ch}
            defaultOpen={ch === 1}
            title={
              <>
                <span className="chapter-number">{String(ch).padStart(2, '0')}</span>
                <div>
                  <h2>{course.lessons.find((l) => l.chapterIndex === ch)!.chapter}</h2>
                  <span>{course.lessons.filter((l) => l.chapterIndex === ch).length} 个小节</span>
                </div>
              </>
            }
          >
            <div className="chapter-lessons">
              {course.lessons
                .filter((l) => l.chapterIndex === ch)
                .map((l) => (
                  <button key={l.id} onClick={() => navigate(`/learn/${course.id}/${l.id}`)}>
                    <span
                      className={`lesson-dot ${data.state.progress[keyFor(course.id, l.id)] ? 'done' : ''}`}
                    />
                    <span>{l.title}</span>
                    <small>{data.state.progress[keyFor(course.id, l.id)] ? '已练习' : '待探索'}</small>
                    <CaretRight size={16} />
                  </button>
                ))}
            </div>
          </Disclosure>
        ))}
      </div>
    </div>
  );
}
function NotesPage({
  data,
  update,
  toast,
  open,
}: {
  data: Bootstrap;
  update: (d: Bootstrap) => void;
  toast: (s: string) => void;
  open: () => void;
}) {
  const [filter, setFilter] = useState('all'),
    [search, setSearch] = useState('');
  const notes = data.state.notes.filter(
    (n) => (filter === 'all' || n.kind === filter) && n.content.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="page">
      <PageHeading
        title="我的理解，慢慢成形。"
        subtitle="解释、疑问和自己的话，都值得有个归处。"
        action={
          <button className="primary" onClick={open}>
            <Plus size={17} />
            新建记录
          </button>
        }
      />
      <div className="filter-row">
        <Segmented
          label="记录筛选"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: '全部' },
            { value: 'question', label: '疑问' },
            { value: 'note', label: '笔记' },
          ]}
        />
        <Search value={search} change={setSearch} placeholder="搜索笔记与疑问" />
      </div>
      <div className="notes-grid">
        {notes.map((n) => (
          <NoteCard
            key={n.id}
            note={n}
            course={data.state.courses.find((c) => c.id === n.courseId)}
            update={update}
            toast={toast}
          />
        ))}
      </div>
      {!notes.length && (
        <Empty
          label={search || filter !== 'all' ? '没有匹配的记录' : '把第一个问号留在这里'}
          description={
            search || filter !== 'all'
              ? '试试其他关键词或切换到“全部”。'
              : '阅读时记下问题，或把 Codex 的讲解收藏进来。'
          }
        />
      )}
    </div>
  );
}
function NoteCard({
  note,
  course,
  update,
  toast,
}: {
  note: Note;
  course?: Course;
  update: (d: Bootstrap) => void;
  toast: (s: string) => void;
}) {
  const [editing, setEditing] = useState(false),
    [text, setText] = useState(note.content),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save(body: unknown) {
    setBusy(true);
    setError('');
    try {
      update(await request(`/notes/${note.id}`, body, 'PATCH'));
      setEditing(false);
      toast('记录已更新');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="note-card panel">
      <div className="section-heading">
        <span className={`badge ${note.kind === 'question' ? 'accent' : ''}`}>
          {note.kind === 'question' ? (note.resolved ? '已解决' : '待解决的疑问') : '我的笔记'}
        </span>
        <span className="small muted">{formatDay(note.createdAt)}</span>
      </div>
      {editing ? (
        <label>
          编辑内容
          <textarea rows={8} disabled={busy} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      ) : (
        <Markdown>{note.content}</Markdown>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="note-footer">
        <span>{course?.title}</span>
        <div>
          {editing ? (
            <>
              <button
                className="quiet"
                disabled={busy}
                onClick={() => {
                  setText(note.content);
                  setEditing(false);
                }}
              >
                取消
              </button>
              <button
                className="primary"
                disabled={busy || !text.trim()}
                onClick={() => void save({ content: text })}
              >
                {busy ? '正在保存…' : '保存'}
              </button>
            </>
          ) : (
            <>
              <button className="quiet" onClick={() => setEditing(true)}>
                编辑
              </button>
              {note.kind === 'question' && (
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => void save({ resolved: !note.resolved })}
                >
                  {note.resolved ? '重新打开' : '标记解决'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
function NoteForm({
  data,
  open,
  close,
  saved,
}: {
  data: Bootstrap;
  open: boolean;
  close: () => void;
  saved: (d: Bootstrap) => void;
}) {
  const [courseId, setCourseId] = useState(data.state.courses[0]?.id ?? ''),
    [content, setContent] = useState(''),
    [kind, setKind] = useState('question'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal
      busy={busy}
      title="留下一点想法"
      description="没想明白的问题，也值得先保存。"
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            saved(await request('/notes', { courseId, content, kind }));
            setContent('');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          所属主题
          <SelectField
            label="所属主题"
            value={courseId}
            onChange={setCourseId}
            placeholder={data.state.courses.length ? '选择学习主题' : '请先在书架添加主题'}
            disabled={busy}
            required
            options={data.state.courses.map((c) => ({ value: c.id, label: c.title }))}
          />
        </label>
        <Segmented
          label="记录类型"
          value={kind}
          onChange={setKind}
          disabled={busy}
          options={[
            { value: 'question', label: '疑问' },
            { value: 'note', label: '笔记' },
          ]}
        />
        <label>
          内容
          <textarea
            rows={6}
            value={content}
            disabled={busy}
            onChange={(e) => setContent(e.target.value)}
            required
            placeholder="用你自己的话写下来…"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="primary wide" disabled={busy || !courseId || !content.trim()}>
            {busy ? <CircleNotch size={17} className="spin" /> : <Check size={17} />}
            {busy ? '正在保存…' : '保存记录'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
