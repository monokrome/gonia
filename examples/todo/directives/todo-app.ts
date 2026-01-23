/**
 * Todo App component.
 */

import { directive, Directive } from '../../../src/types.js';
import { Todo, FilterType, TodoState } from '../types.js';

function todoApp($element: Element, $state: TodoState) {
  // Initialize state
  $state.todos = [];
  $state.newTodo = '';
  $state.filter = 'all';
  $state.nextId = 1;

  // Computed: filtered todos
  Object.defineProperty($state, 'filteredTodos', {
    get() {
      const todos = $state.todos;
      const filter = $state.filter;
      if (filter === 'active') {
        return todos.filter((todo: Todo) => !todo.done);
      }
      if (filter === 'done') {
        return todos.filter((todo: Todo) => todo.done);
      }
      return todos;
    },
    enumerable: true
  });

  // Computed: remaining count
  Object.defineProperty($state, 'remainingCount', {
    get() {
      return $state.todos.filter((t: Todo) => !t.done).length;
    },
    enumerable: true
  });

  // Methods
  $state.addTodo = (event: Event) => {
    event.preventDefault();
    const text = $state.newTodo.trim();
    if (!text) {
      return;
    }
    $state.todos = [...$state.todos, { id: $state.nextId++, text, done: false }];
    $state.newTodo = '';
  };

  $state.removeTodo = (id: number) => {
    $state.todos = $state.todos.filter((t: Todo) => t.id !== id);
  };

  $state.setFilter = (filter: FilterType) => {
    $state.filter = filter;
  };
}

directive('todo-app', todoApp as Directive, { scope: true });
