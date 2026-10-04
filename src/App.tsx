import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import {
  ArrowRight,
  BookBookmark,
  BookOpen,
  CaretRight,
  Check,
  CheckCircle,
  CircleNotch,
  DownloadSimple,
  FileText,
  GearSix,
  Leaf,
  MagnifyingGlass,
  List,
  NotePencil,
  Play,
  Plus,
  Repeat,
  Sun,
  Target,
  TreeStructure,
  UploadSimple,
} from '@phosphor-icons/react';
import type { Bootstrap, Course, Note } from '../shared/types';
import { courseProgress, dayKey, formatDay, request, toLesson } from './lib';
import { Today } from './Today';
import { saveRequest } from './save-request';
import { NewCourse } from './NewCourse';
import { Learning } from './Learning';
import { Markdown } from './Markdown';
import { Modal } from './Modal';
import { ModelSettings } from './ModelSettings';
import { Footprint } from './Footprint';
import { DeleteNote } from './DeleteNote';
import { lessonCompletion } from '../shared/completions';
import { SelectField, Segmented, Disclosure } from './Controls';
import { recentLesson, acceptSnapshot, localText, storeText } from './learning-state';

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
  const [data, storeData] = useState<Bootstrap | null>(null),
    [error, setError] = useState('');
  const setData = useCallback(
    (value: SetStateAction<Bootstrap | null>) =>
      storeData((previous) =>
        acceptSnapshot(previous, typeof value === 'function' ? value(previous) : value),
      ),
    [],
  );
  const [route, setRoute] = useState(location.hash.slice(1) || '/today');
  const [theme, setTheme] = useState(
    () =>
      localText('jianzhi-theme') || localText('learn-local-theme') || localText('shizhi-theme') || 'light',
  );
  const [notice, setNotice] = useState(''),
    [initialTitle, setInitialTitle] = useState(''),
    [imported, setImported] = useState(false);
  const [search, setSearch] = useState(''),
    [activeCourse, setActiveCourse] = useState('');
  const [noteModal, setNoteModal] = useState(false);
  const [courseFilter, setCourseFilter] = useState('all');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalError, setGoalError] = useState('');
  useEffect(() => {
    const change = () => {
      setRoute(location.hash.slice(1) || '/today');
      setNavigationOpen(false);
      window.scrollTo(0, 0);
      requestAnimationFrame(() => document.getElementById('main-content')?.focus({ preventScroll: true }));
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storeText('jianzhi-theme', theme);
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
    navigate('/new');
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
  const parts = route.split('?')[0].split('/').filter(Boolean);
  const course = state.courses.find((c) => c.id === parts[1]);
  const lesson = course?.lessons.find((l) => l.id === parts[2]);
  const learning = parts[0] === 'learn' && course && lesson;
  const selected = state.courses.find((c) => c.id === activeCourse) ?? state.courses[0];
  const filteredCourses = state.courses.filter((c) => {
    const count = courseProgress(c, state);
    const started =
      count > 0 ||
      !!recentLesson(data.storagePath, state.courses, c.id) ||
      state.guidedSessions?.some((s) => s.courseId === c.id);
    return (
      `${c.title} ${c.goal}`.toLowerCase().includes(search.trim().toLowerCase()) &&
      (courseFilter === 'all' ||
        (courseFilter === 'new' && !started) ||
        (courseFilter === 'learning' && started && count < c.lessons.length) ||
        (courseFilter === 'done' && count === c.lessons.length))
    );
  });
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
      <header className="mobile-app-bar">
        <a href="#/today">渐知</a>
        <button className="quiet" onClick={() => setNavigationOpen(true)}>
          <List size={20} />
          导航
        </button>
      </header>
      <Modal title="前往" description="选择学习页面" open={navigationOpen} onOpenChange={setNavigationOpen}>
        <nav className="mobile-navigation" aria-label="窄屏导航">
          {[
            ...nav,
            { path: '/new', label: '添加主题', icon: Plus },
            { path: '/settings', label: '设置', icon: GearSix },
          ].map(({ path, label, icon: Icon }) => (
            <a key={path} href={`#${path}`} onClick={() => setNavigationOpen(false)}>
              <Icon size={20} />
              {label}
            </a>
          ))}
        </nav>
      </Modal>
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
          <button onClick={() => create()} className="add-button" aria-label="添加主题">
            <Plus size={22} />
            <span>添加主题</span>
          </button>
          <a
            href="#/settings"
            className={`settings-link ${route === '/settings' ? 'active' : ''}`}
            aria-current={route === '/settings' ? 'page' : undefined}
            aria-label="学习设置"
          >
            <GearSix size={21} />
            <span>设置</span>
          </a>
        </div>
      </aside>
      {learning ? (
        <Learning
          key={`${data.storagePath}:${course.id}:${lesson.id}`}
          data={data}
          course={course}
          lesson={lesson}
          navigate={navigate}
          update={setData}
          toast={setNotice}
        />
      ) : (
        <main
          className="workspace"
          id={route === '/new' ? undefined : 'main-content'}
          tabIndex={-1}
          hidden={route === '/new'}
        >
          <header className="topbar">
            <div className="breadcrumb">
              渐知 · 本地学习工作台 <CaretRight size={13} />
              <span>
                {nav.find((n) => n.path === route.split('?')[0])?.label ||
                  (parts[0] === 'course' ? '课程详情' : parts[0] === 'new' ? '添加主题' : '学习设置')}
              </span>
            </div>
            <div className="storage-state">
              <span />
              所有记录保存在本机
            </div>
          </header>
          {route === '/today' ? (
            <Today data={data} create={create} navigate={navigate} />
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
                <Segmented
                  label="书架学习状态"
                  value={courseFilter}
                  onChange={setCourseFilter}
                  options={[
                    { value: 'all', label: '全部' },
                    { value: 'new', label: '尚未开始' },
                    { value: 'learning', label: '学习中' },
                    { value: 'done', label: '已学完' },
                  ]}
                />
                <Search value={search} change={setSearch} placeholder="搜索学习主题" />
              </div>
              {(search.trim() || courseFilter !== 'all') && !filteredCourses.length && (
                <Empty label="没有找到匹配的主题" description="试试更短的关键词，或清空搜索查看全部主题。" />
              )}
              <div className="courses-grid">
                {filteredCourses.map((c) => (
                  <CourseCard key={c.id} course={c} data={data} navigate={navigate} />
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
                title="知识路线"
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
                        已学完
                      </span>
                    </div>
                  </div>
                  <div className="map-workspace">
                    <div className="knowledge-map">
                      {Array.from(new Set(selected.lessons.map((l) => l.chapterIndex))).map((ch, i) => {
                        const lessons = selected.lessons.filter((l) => l.chapterIndex === ch);
                        const done = lessons.filter((l) => lessonCompletion(state, selected.id, l.id)).length;
                        const target =
                          lessons.find((l) => !lessonCompletion(state, selected.id, l.id)) ?? lessons[0];
                        return (
                          <button
                            className={`map-node ${target.id === selected.lessons.find((l) => !lessonCompletion(state, selected.id, l.id))?.id ? 'current' : ''} ${done === lessons.length ? 'done' : ''}`}
                            key={ch}
                            onClick={() => navigate(`/learn/${selected.id}/${target.id}`)}
                          >
                            <span className="node-number">{String(ch).padStart(2, '0')}</span>
                            <h3>{lessons[0].chapter}</h3>
                            <p>
                              {lessons.length} 个小节 · {done} 个已学完
                            </p>
                            <div className="node-dots">
                              {lessons.slice(0, 18).map((l) => (
                                <i
                                  key={l.id}
                                  className={lessonCompletion(state, selected.id, l.id) ? 'done' : ''}
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
                    <aside className="map-current resume-paper">
                      <h2>现在，从这里继续</h2>
                      <p>
                        {
                          selected.lessons.find((l) =>
                            toLesson(selected, state, data.storagePath).endsWith('/' + l.id),
                          )?.title
                        }
                      </p>
                      <button
                        className="primary"
                        onClick={() => navigate(toLesson(selected, state, data.storagePath))}
                      >
                        继续学习
                        <ArrowRight size={16} />
                      </button>
                      <p className="small muted">路线显示学习顺序。学完与掌握分别记录，复习用来检验理解。</p>
                    </aside>
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
              <PageHeading title="设置" subtitle="按自己的节奏学习。这里的模型选择只影响渐知的新请求。" />
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
                <h2>外观</h2>
                <Segmented
                  label="外观"
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: 'light', label: '纸白' },
                    { value: 'dark', label: '深色' },
                  ]}
                />
              </section>
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
          ) : route === '/new' ? null : (
            <div className="page">
              <Empty label="这里还没有内容" />
              <button className="primary" onClick={() => navigate('/today')}>
                回到今日
              </button>
            </div>
          )}
        </main>
      )}
      <main
        className="workspace"
        id={route === '/new' ? 'main-content' : undefined}
        tabIndex={-1}
        hidden={route !== '/new'}
      >
        <NewCourse
          storagePath={data.storagePath}
          open={route === '/new'}
          close={() => navigate('/courses')}
          initialTitle={initialTitle}
          imported={imported}
          saved={(result) => {
            setData(result);
            navigate(`/course/${result.courseId}`);
            setNotice('新的学习主题已准备好');
          }}
        />
      </main>
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
  navigate,
}: {
  course: Course;
  data: Bootstrap;
  navigate: (p: string) => void;
}) {
  const count = courseProgress(course, data.state);
  const recent = recentLesson(data.storagePath, [course], course.id);
  const started = count > 0 || !!recent || data.state.guidedSessions?.some((s) => s.courseId === course.id);
  return (
    <article className="course-card panel">
      <div className="course-card-body">
        <div className="section-heading">
          <span className="small muted">
            <BookOpen size={17} />{' '}
            {count === course.lessons.length ? '已学完' : started ? '学习中' : '尚未开始'}
          </span>
          <a className="quiet" href={`#/course/${course.id}`}>
            查看章节
          </a>
        </div>
        <h2>
          <a href={`#/course/${course.id}`}>{course.title}</a>
        </h2>
        <p>{recent?.lesson.title || course.goal}</p>
        <div className="course-card-actions">
          <span className="small muted">
            {count} / {course.lessons.length} 小节已学完
          </span>
          <button className="quiet" onClick={() => navigate(toLesson(course, data.state, data.storagePath))}>
            {started ? '继续上次学习' : '开始导师带学'}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </article>
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
  const recent = recentLesson(data.storagePath, [course], course.id);
  return (
    <div className="page">
      <PageHeading
        title={course.title}
        subtitle={course.goal}
        action={
          <button
            className="primary"
            onClick={() => navigate(toLesson(course, data.state, data.storagePath))}
          >
            <Play size={16} weight="fill" />
            {recent ? '继续上次学习' : '开始学习'}
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
        <span>
          {courseProgress(course, data.state)} / {course.lessons.length} 小节已学完
        </span>
        {course.sourceUrl && (
          <a href={course.sourceUrl} target="_blank" rel="noreferrer">
            查看来源
          </a>
        )}
      </div>
      {recent && (
        <section className="course-resume">
          <div>
            <h2>{recent.lesson.title}</h2>
            <p>回到上次的模式和阅读位置</p>
          </div>
          <button
            className="primary"
            onClick={() => navigate(toLesson(course, data.state, data.storagePath))}
          >
            回到这一小节
          </button>
        </section>
      )}
      <div className="chapter-list">
        {Array.from(new Set(course.lessons.map((l) => l.chapterIndex))).map((ch) => (
          <Disclosure
            key={ch}
            defaultOpen={ch === (recent?.lesson.chapterIndex ?? course.lessons[0]?.chapterIndex)}
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
                      className={`lesson-dot ${lessonCompletion(data.state, course.id, l.id) ? 'done' : ''}`}
                    />
                    <span>{l.title}</span>
                    <small>{lessonCompletion(data.state, course.id, l.id) ? '已学完' : '待探索'}</small>
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
  const [selectedId, setSelectedId] = useState('');
  const notes = data.state.notes.filter(
    (n) => (filter === 'all' || n.kind === filter) && n.content.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedNote = notes.find((n) => n.id === selectedId) ?? notes[0];
  return (
    <div className="page">
      <PageHeading
        title="笔记"
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
      <div className="notes-workspace">
        {!!notes.length && (
          <nav className="note-list" aria-label="选择笔记">
            {notes.map((n) => (
              <button
                key={n.id}
                className={selectedNote?.id === n.id ? 'active' : ''}
                aria-pressed={selectedNote?.id === n.id}
                onClick={() => setSelectedId(n.id)}
              >
                <strong>{n.content.replace(/[#*`>]/g, '').slice(0, 65)}</strong>
                <span>
                  {data.state.courses.find((c) => c.id === n.courseId)?.title} · {formatDay(n.updatedAt)}
                </span>
              </button>
            ))}
          </nav>
        )}
        <div className="note-detail">
          {data.state.notes.map((n) => (
            <div key={n.id} hidden={n.id !== selectedNote?.id}>
              <NoteCard
                key={n.id}
                note={n}
                course={data.state.courses.find((c) => c.id === n.courseId)}
                update={update}
                toast={toast}
              />
            </div>
          ))}
        </div>
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
        <span>
          {course?.title}
          {course && (
            <a
              className="quiet"
              href={note.lessonId ? `#/learn/${course.id}/${note.lessonId}` : `#/course/${course.id}`}
            >
              回到关联{note.lessonId ? '小节' : '主题'}
            </a>
          )}
        </span>
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
              <DeleteNote note={note} update={update} toast={toast} />
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
            saved(await saveRequest('/notes', { courseId, content, kind }, data.storagePath));
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
