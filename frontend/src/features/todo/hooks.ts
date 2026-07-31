import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todoApi } from './api'
import type { ProjectInput, Todo, TodoInput } from './types'

// Query keys live in one place so mutations can invalidate the right caches.
const keys = {
  projects: ['todo', 'projects'] as const,
  tags: ['todo', 'tags'] as const,
  todos: ['todo', 'todos'] as const,
  todoList: (sort?: string, q?: string) => ['todo', 'todos', sort ?? 'default', q ?? ''] as const,
}

/** Lists the current user's projects. */
export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: todoApi.listProjects })
}

/** Lists the current user's tags. */
export function useTags() {
  return useQuery({ queryKey: keys.tags, queryFn: todoApi.listTags })
}

/**
 * Lists todos ordered by the given sort spec (e.g. "-priority,due") and, with
 * `q`, narrowed to the ones whose title or notes contain that text. Sort and
 * search are part of the cache key, so going back to a previous list is instant;
 * `placeholderData` keeps the last result on screen while a new search loads, so
 * typing doesn't flash the list empty between keystrokes.
 */
export function useTodos(sort?: string, q?: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.todoList(sort, q),
    queryFn: () => todoApi.listTodos(sort, q),
    placeholderData: (previous) => previous,
    enabled: options.enabled ?? true,
  })
}

/** Creates a todo and refreshes every cached todo list. */
export function useCreateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TodoInput) => todoApi.createTodo(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.todos }),
  })
}

/**
 * Updates a todo (status, priority, params, …). The change is applied optimistically
 * to every cached todo list so checking a box or setting a param feels instant; a
 * refetch then reconciles ordering. Rolls back on error.
 */
export function useUpdateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: TodoInput }) => todoApi.updateTodo(id, input),
    onMutate: async ({ id, input }: { id: number; input: TodoInput }) => {
      await qc.cancelQueries({ queryKey: keys.todos })
      const prev = qc.getQueriesData<Todo[]>({ queryKey: keys.todos })
      qc.setQueriesData<Todo[]>({ queryKey: keys.todos }, (old) =>
        old?.map((t) => (t.id === id ? ({ ...t, ...input, project_id: input.project_id ?? null } as Todo) : t)),
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.todos }),
  })
}

/**
 * Saves a manual order. Dragging works from any sort: the caller passes the full
 * list in its new order, we seed the "custom" (position) cache with it so switching
 * to custom shows the move instantly, then persist the ids. Rolls back on error and
 * refetches to confirm.
 */
export function useReorderTodos() {
  const qc = useQueryClient()
  const key = keys.todoList('position')
  return useMutation({
    mutationFn: (ordered: Todo[]) => todoApi.reorderTodos(ordered.map((t) => t.id)),
    onMutate: async (ordered: Todo[]) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Todo[]>(key)
      qc.setQueryData(key, ordered)
      return { prev }
    },
    onError: (_err, _ordered, ctx) => {
      qc.setQueryData(key, ctx?.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.todos }),
  })
}

/**
 * Deletes a todo. Optimistic: the row leaves every cached list immediately so the
 * click feels instant, and is restored if the request fails (the global mutation
 * error toast then explains why). A refetch reconciles afterwards.
 */
export function useDeleteTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todoApi.deleteTodo(id),
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: keys.todos })
      const prev = qc.getQueriesData<Todo[]>({ queryKey: keys.todos })
      qc.setQueriesData<Todo[]>({ queryKey: keys.todos }, (old) => old?.filter((t) => t.id !== id))
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.todos }),
  })
}

/** Creates a project and refreshes the project list. */
export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProjectInput) => todoApi.createProject(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects }),
  })
}

/** Creates a tag and refreshes the tag list. */
export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => todoApi.createTag(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.tags }),
  })
}

/**
 * Attaches or detaches a tag on a todo, then refreshes the todo lists — which embed
 * each todo's tags — so the row and any tag filter update.
 */
export function useAddTodoTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ todoId, tagId }: { todoId: number; tagId: number }) => todoApi.addTagToTodo(todoId, tagId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.todos }),
  })
}

export function useRemoveTodoTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ todoId, tagId }: { todoId: number; tagId: number }) => todoApi.removeTagFromTodo(todoId, tagId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.todos }),
  })
}
