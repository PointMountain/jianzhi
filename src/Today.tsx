import { useState } from 'react';
import { ArrowRight, BookOpen, Plus, UploadSimple } from '@phosphor-icons/react';
import type { Bootstrap } from '../shared/types';
import { courseProgress, toLesson } from './lib';
import { currentQuestion } from '../shared/guided';
import { recentLesson, lessonStateKey, readLocal } from './learning-state';

export function Today({
  data,
  create,
  navigate,
}: {
  data: Bootstrap;
  create: (title?: string, imported?: boolean) => void;
  navigate: (path: string) => void;
}) {
  const [topic, setTopic] = useState('');
  const { state, today, storagePath } = data;
  const recent = recentLesson(storagePath, state.courses);
  const course = recent?.course ?? state.courses[0];
  const lesson = course?.lessons.find((l) => toLesson(course, state, storagePath).endsWith('/' + l.id));
  const session = state.guidedSessions
    ?.filter((s) => s.courseId === course?.id && s.lessonId === lesson?.id)
    .at(-1);
  const question = session && currentQuestion(session)?.response?.question;
  const mode =
    course && lesson
      ? readLocal<string>(lessonStateKey(storagePath, course.id, lesson.id) + ':mode', 'guided')
      : 'guided';
  const due = Object.values(state.progress).filter((p) => p.due <= today);
  const note = state.notes[0];
  return (
    <div className="page today-page">
      <div className="page-heading">
        <h1>今日</h1>
        <div className="button-row">
          <span className="small muted">
            {new Date(`${today}T12:00:00+08:00`).toLocaleDateString('zh-CN', {
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </span>
          <button className="outline-button" onClick={() => create()}>
            <Plus size={17} />
            添加主题
          </button>
        </div>
      </div>
      <div className="today-intro">
        <h2>{course ? '接着上次，再弄懂一点。' : '从一个想弄懂的问题开始。'}</h2>
        <p className="muted">
          {course
            ? '你的问题、想法和阅读位置，都还在这里。'
            : '带来自己的材料，或让导师帮你规划第一条学习路线。'}
        </p>
      </div>
      <div className="today-grid">
        <section className="main-column">
          {course && lesson ? (
            <section className="resume-paper">
              <p className="small muted">
                {recent ? '上次停在' : '准备开始'}：
                {mode === 'read' ? '自主阅读' : mode === 'recall' ? '主动回忆' : '导师带学'}
              </p>
              <p className="muted">{course.title}</p>
              <h2>{lesson.title}</h2>
              <p className="resume-question">{question || lesson.question}</p>
              <div className="course-progress">
                <span>
                  {courseProgress(course, state)} / {course.lessons.length} 小节已学完
                </span>
                <span>{Math.round((courseProgress(course, state) / course.lessons.length) * 100)}%</span>
              </div>
              <div className="progress-track">
                <i style={{ width: `${(courseProgress(course, state) / course.lessons.length) * 100}%` }} />
              </div>
              <div className="button-row">
                <button className="primary" onClick={() => navigate(toLesson(course, state, storagePath))}>
                  {recent ? '继续学习' : '开始这一节'}
                  <ArrowRight size={17} />
                </button>
                <span className="small muted">按上次的模式继续</span>
              </div>
            </section>
          ) : (
            <section className="resume-paper">
              <h2>你想弄懂什么？</h2>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  create(topic);
                }}
              >
                <label>
                  学习主题
                  <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    maxLength={120}
                    placeholder="一本书、一个概念，或一个还没想明白的问题…"
                  />
                </label>
                <div className="button-row">
                  <button className="primary">
                    准备学习路线
                    <ArrowRight size={17} />
                  </button>
                  <button type="button" className="outline-button" onClick={() => create('', true)}>
                    <UploadSimple size={17} />
                    导入自己的材料
                  </button>
                </div>
              </form>
            </section>
          )}
          {state.courses.length > 1 && (
            <section className="other-topics">
              <div className="section-heading">
                <h2>也可以换个主题</h2>
                <a href="#/courses">查看书架</a>
              </div>
              {state.courses
                .filter((c) => c.id !== course?.id)
                .slice(0, 3)
                .map((c) => (
                  <a className="topic-row" key={c.id} href={`#${toLesson(c, state, storagePath)}`}>
                    <BookOpen size={22} />
                    <div>
                      <strong>{c.title}</strong>
                      <p className="small muted">
                        {courseProgress(c, state)} / {c.lessons.length} 小节已学完
                      </p>
                    </div>
                    <ArrowRight size={18} />
                  </a>
                ))}
            </section>
          )}
        </section>
        <aside className="today-aside">
          <section>
            <h2>留一点时间，回想一下</h2>
            <p>
              <strong>{due.length ? `${due.length} 个知识点到期` : '今天没有到期复习'}</strong>
            </p>
            <p className="muted">
              {due.length
                ? '试着用自己的话解释，看看哪些已经真正留下。'
                : '完成回忆自评后，会按你的实际回答安排下一次复习。'}
            </p>
            {due.slice(0, 2).map((p) => (
              <a
                className="topic-row"
                key={`${p.courseId}:${p.lessonId}`}
                href={`#/learn/${p.courseId}/${p.lessonId}?recall`}
              >
                {state.courses.find((c) => c.id === p.courseId)?.lessons.find((l) => l.id === p.lessonId)
                  ?.title || '回到复习'}
                <ArrowRight size={17} />
              </a>
            ))}
            <button className="outline-button" onClick={() => navigate('/reviews')}>
              查看{due.length ? '到期复习' : '复习安排'}
            </button>
          </section>
          <section>
            <h3>最近的一点想法</h3>
            <p className="recent-note">
              {note ? note.content : '阅读时记下疑问，也可以保存刚刚想通的一点理解。'}
            </p>
            <a className="quiet" href="#/notes">
              查看笔记
              <ArrowRight size={16} />
            </a>
          </section>
        </aside>
      </div>
    </div>
  );
}
