import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todoApi } from './api'
import type { ProjectInput, Todo, TodoInput } from './types'

// Query keys live in one place so mutations can invalidate the right caches.
const keys = {
  projects: ['todo', 'projects'] as const,
  tags: ['todo', 'tags'] as const,
  todos: ['todo', 'todos'] as const,
  todoList: (sort?: string) => ['todo', 'todos', sort ?? 'default'] as const,
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
 * Lists todos ordered by the given sort spec (e.g. "-priority,due"). Each sort
 * is cached separately so switching the order is instant once seen.
 */
export function useTodos(sort?: string) {
  return useQuery({ queryKey: keys.todoList(sort), queryFn: () => todoApi.listTodos(sort) })
}

/** Creates a todo and refreshes every cached todo list. */
export function useCreateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TodoInput) => todoApi.createTodo(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.todos }),
  })
}

/** Updates a todo (status, priority, fields) and refreshes the lists. */
export function useUpdateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: TodoInput }) => todoApi.updateTodo(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.todos }),
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

/** Deletes a todo and refreshes the lists. */
export function useDeleteTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => todoApi.deleteTodo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.todos }),
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
