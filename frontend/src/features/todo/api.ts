import { http } from '../../core/http'
import type { Project, ProjectInput, Tag, Todo, TodoInput } from './types'

/**
 * Thin typed wrapper over the `/api/todo` endpoints. Each method maps to one
 * backend route; the components and hooks call these, never `fetch` directly.
 */
export const todoApi = {
  // Projects
  listProjects: () => http.get<Project[]>('/api/todo/projects'),
  createProject: (input: ProjectInput) => http.post<Project>('/api/todo/projects', input),
  updateProject: (id: number, input: ProjectInput) =>
    http.put<Project>(`/api/todo/projects/${id}`, input),
  deleteProject: (id: number) => http.del(`/api/todo/projects/${id}`),

  // Todos. `sort` is the combinable spec, e.g. "-priority,due,estimate".
  listTodos: (sort?: string) =>
    http.get<Todo[]>(`/api/todo/todos${sort ? `?sort=${encodeURIComponent(sort)}` : ''}`),
  createTodo: (input: TodoInput) => http.post<Todo>('/api/todo/todos', input),
  updateTodo: (id: number, input: TodoInput) => http.put<Todo>(`/api/todo/todos/${id}`, input),
  deleteTodo: (id: number) => http.del(`/api/todo/todos/${id}`),
  // Persist the manual "custom" order: the ids in the exact order they should take.
  reorderTodos: (ids: number[]) => http.put<void>('/api/todo/todos/reorder', { ids }),

  // Tags + per-todo assignment
  listTags: () => http.get<Tag[]>('/api/todo/tags'),
  createTag: (name: string) => http.post<Tag>('/api/todo/tags', { name }),
  deleteTag: (id: number) => http.del(`/api/todo/tags/${id}`),
  tagsForTodo: (todoId: number) => http.get<Tag[]>(`/api/todo/todos/${todoId}/tags`),
  addTagToTodo: (todoId: number, tagId: number) =>
    http.post<void>(`/api/todo/todos/${todoId}/tags/${tagId}`, {}),
  removeTagFromTodo: (todoId: number, tagId: number) =>
    http.del(`/api/todo/todos/${todoId}/tags/${tagId}`),
}
