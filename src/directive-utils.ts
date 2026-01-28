/**
 * Shared utilities for directive processing (client and server).
 *
 * @packageDocumentation
 */

import { getDirective, DirectivePriority } from './types.js';

/**
 * Information about an assign conflict.
 */
export interface AssignConflict {
  key: string;
  directives: string[];
  priorities: number[];
}

/**
 * Result of resolving assigns from multiple directives.
 */
export interface ResolvedAssigns {
  /** The merged assign values (higher priority wins) */
  values: Record<string, unknown>;
  /** Warnings for different-priority conflicts */
  warnings: string[];
}

/**
 * Resolve assign values from multiple directives on the same element.
 *
 * @param directiveNames - Names of directives on the element
 * @throws Error if same-priority directives conflict on an assign key
 * @returns Resolved assigns and any warnings
 */
export function resolveAssigns(directiveNames: string[]): ResolvedAssigns {
  const assignsByKey = new Map<string, Array<{
    directive: string;
    priority: number;
    value: unknown;
  }>>();

  // Collect all assigns grouped by key
  for (const name of directiveNames) {
    const registration = getDirective(name);
    if (!registration?.options.assign) continue;

    const priority = registration.fn?.priority ?? DirectivePriority.NORMAL;

    for (const [key, value] of Object.entries(registration.options.assign)) {
      if (!assignsByKey.has(key)) {
        assignsByKey.set(key, []);
      }
      assignsByKey.get(key)!.push({ directive: name, priority, value });
    }
  }

  const values: Record<string, unknown> = {};
  const warnings: string[] = [];

  // Check for conflicts and resolve
  for (const [key, sources] of assignsByKey) {
    if (sources.length === 1) {
      values[key] = sources[0].value;
      continue;
    }

    // Group by priority
    const byPriority = new Map<number, typeof sources>();
    for (const source of sources) {
      if (!byPriority.has(source.priority)) {
        byPriority.set(source.priority, []);
      }
      byPriority.get(source.priority)!.push(source);
    }

    // Check for same-priority conflicts
    for (const [priority, group] of byPriority) {
      if (group.length > 1) {
        const names = group.map(s => s.directive).join(', ');
        throw new Error(
          `Conflicting assign key "${key}" at same priority (${priority}) between directives: ${names}`
        );
      }
    }

    // Different priorities - highest wins, emit warning
    const sorted = sources.sort((a, b) => b.priority - a.priority);
    const winner = sorted[0];
    const losers = sorted.slice(1);

    values[key] = winner.value;

    for (const loser of losers) {
      warnings.push(
        `Directive "${winner.directive}" (priority ${winner.priority}) overrides assign key "${key}" from "${loser.directive}" (priority ${loser.priority})`
      );
    }
  }

  return { values, warnings };
}

/**
 * Apply resolved assigns to a scope, logging any warnings.
 *
 * @param scope - The scope to apply assigns to
 * @param directiveNames - Names of directives on the element
 * @returns The scope with assigns applied
 */
export function applyAssigns(
  scope: Record<string, unknown>,
  directiveNames: string[]
): Record<string, unknown> {
  const { values, warnings } = resolveAssigns(directiveNames);

  for (const warning of warnings) {
    console.warn(`[gonia] ${warning}`);
  }

  Object.assign(scope, values);
  return scope;
}

/**
 * Check if a directive should create/use a scope based on its options.
 */
export function directiveNeedsScope(name: string): boolean {
  const registration = getDirective(name);
  if (!registration) return false;

  const { options, fn } = registration;
  return !!(options.scope || options.assign || fn?.$context?.length);
}

/**
 * Get directive options with defaults.
 */
export function getDirectiveOptions(name: string) {
  const registration = getDirective(name);
  return registration?.options ?? {};
}

/**
 * Get directive priority.
 */
export function getDirectivePriority(name: string): number {
  const registration = getDirective(name);
  return registration?.fn?.priority ?? DirectivePriority.NORMAL;
}
