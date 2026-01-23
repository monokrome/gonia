/**
 * Todo app types.
 */

export interface Todo {
  id: number;
  text: string;
  done: boolean;
}

export type FilterType = 'all' | 'active' | 'done';

export interface TodoState {
  todos: Todo[];
  newTodo: string;
  filter: FilterType;
  nextId: number;
  filteredTodos: Todo[];
  remainingCount: number;
  addTodo: (event: Event) => void;
  removeTodo: (id: number) => void;
  setFilter: (filter: FilterType) => void;
}
