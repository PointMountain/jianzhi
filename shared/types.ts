export interface Lesson {
  id: string;
  title: string;
  chapter: string;
  chapterIndex: number;
  content: string;
  question: string;
  source?: string;
}
export interface Course {
  id: string;
  title: string;
  description: string;
  goal: string;
  source: string;
  sourceUrl?: string;
  createdAt: string;
  lessons: Lesson[];
  repository?: { path: string; files: string[]; importedAt: string; commit?: string };
}
export type Rating = 'again' | 'hint' | 'good';
export interface Progress {
  lessonId: string;
  courseId: string;
  stage: number;
  due: string;
  lastReviewed: string;
  rating: Rating;
  attempts: number;
  independentDates: string[];
}
export interface Review {
  id: string;
  courseId: string;
  lessonId: string;
  answer: string;
  rating: Rating;
  createdAt: string;
  due: string;
  seconds: number;
  revealed: boolean;
}
export interface Note {
  id: string;
  courseId: string;
  lessonId?: string;
  kind: 'note' | 'question';
  content: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface SummaryCard {
  id: string;
  courseId: string;
  lessonId: string;
  title: string;
  takeaway: string;
  points: { title: string; body: string }[];
  nextQuestion: string;
  createdAt: string;
}
export interface StudyState {
  version: 1;
  courses: Course[];
  progress: Record<string, Progress>;
  reviews: Review[];
  notes: Note[];
  chats: Record<string, ChatMessage[]>;
  summaries?: SummaryCard[];
  preferences: { dailyMinutes: number; codexModel?: string };
}
export interface CodexStatus {
  available: boolean;
  authenticated: boolean;
  version: string;
  source?: string;
  globalModel?: string;
  defaultModel?: string;
}
export interface CodexModel {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
}
export interface RepositoryFile {
  path: string;
  size: number;
  kind: 'document' | 'code';
}
export interface RepositoryScan {
  id: string;
  path: string;
  name: string;
  files: RepositoryFile[];
  skipped: number;
  truncated: boolean;
  commit?: string;
}
export interface DirectoryListing {
  path: string;
  parent: string | null;
  directories: { name: string; path: string }[];
  truncated: boolean;
}
export interface Bootstrap {
  state: StudyState;
  codex: CodexStatus;
  today: string;
  storage: string;
  storagePath: string;
}
