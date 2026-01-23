/**
 * Two-way binding directive.
 *
 * @packageDocumentation
 */

import { directive, Directive, Expression, EvalFn } from '../types.js';
import { effect } from '../reactivity.js';

/**
 * Parse a property path and return getter/setter functions.
 *
 * @param path - Dot-separated property path (e.g., 'user.name')
 * @param state - The state object to operate on
 * @returns Object with get and set functions
 */
function createAccessor(path: string, $eval: EvalFn, state: Record<string, unknown>): {
  get: () => unknown;
  set: (value: unknown) => void;
} {
  const parts = path.trim().split('.');

  return {
    get: () => $eval(path as Expression),
    set: (value: unknown) => {
      let target: Record<string, unknown> = state;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (target[part] === undefined || target[part] === null) {
          target[part] = {};
        }
        target = target[part] as Record<string, unknown>;
      }

      target[parts[parts.length - 1]] = value;
    }
  };
}

/**
 * Get the element type for determining binding behavior.
 */
function getInputType(el: Element): string {
  const tagName = el.tagName.toLowerCase();

  if (tagName === 'select') {
    return 'select';
  }

  if (tagName === 'textarea') {
    return 'textarea';
  }

  if (tagName === 'input') {
    const type = (el as HTMLInputElement).type?.toLowerCase() || 'text';
    if (type === 'checkbox') {
      return 'checkbox';
    }
    if (type === 'radio') {
      return 'radio';
    }
    if (type === 'number' || type === 'range') {
      return 'number';
    }
  }

  return 'text';
}

/**
 * Bind form element value to state with two-way data binding.
 *
 * @remarks
 * Updates the element value when state changes, and updates state
 * when the user modifies the element. Handles different input types:
 * - text/textarea: binds to value, uses input event
 * - checkbox: binds to checked, uses change event
 * - radio: binds to checked, uses change event
 * - select: binds to value, uses change event
 * - number: binds to value (as number), uses input event
 *
 * @example
 * ```html
 * <input g-model="name">
 * <input type="checkbox" g-model="isActive">
 * <select g-model="selectedOption">
 * <textarea g-model="description"></textarea>
 * ```
 */
export const model: Directive<['$expr', '$element', '$eval', '$rootState']> = function model(
  $expr: Expression,
  $element: Element,
  $eval: EvalFn,
  $rootState: Record<string, unknown>
) {
  const inputType = getInputType($element);
  const accessor = createAccessor($expr as string, $eval, $rootState);
  const el = $element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

  if (inputType === 'checkbox') {
    effect(() => {
      (el as HTMLInputElement).checked = Boolean(accessor.get());
    });

    el.addEventListener('change', () => {
      accessor.set((el as HTMLInputElement).checked);
    });
  } else if (inputType === 'radio') {
    effect(() => {
      const value = accessor.get();
      (el as HTMLInputElement).checked = (el as HTMLInputElement).value === String(value);
    });

    el.addEventListener('change', () => {
      if ((el as HTMLInputElement).checked) {
        accessor.set((el as HTMLInputElement).value);
      }
    });
  } else if (inputType === 'select') {
    effect(() => {
      (el as HTMLSelectElement).value = String(accessor.get() ?? '');
    });

    el.addEventListener('change', () => {
      accessor.set((el as HTMLSelectElement).value);
    });
  } else if (inputType === 'number') {
    effect(() => {
      const value = accessor.get();
      (el as HTMLInputElement).value = value === null || value === undefined ? '' : String(value);
    });

    el.addEventListener('input', () => {
      const value = (el as HTMLInputElement).value;
      if (value === '') {
        accessor.set(null);
      } else {
        const num = Number(value);
        accessor.set(isNaN(num) ? value : num);
      }
    });
  } else {
    effect(() => {
      el.value = String(accessor.get() ?? '');
    });

    el.addEventListener('input', () => {
      accessor.set(el.value);
    });
  }
};

model.$inject = ['$expr', '$element', '$eval', '$rootState'];

directive('g-model', model);
