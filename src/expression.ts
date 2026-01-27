/**
 * Expression parsing utilities.
 *
 * @remarks
 * Parses expression strings (from HTML attributes) to find root identifiers.
 * Used for reactive dependency tracking - only access state keys that
 * the expression actually references.
 *
 * @packageDocumentation
 */

const JS_KEYWORDS = new Set([
  'true', 'false', 'null', 'undefined', 'this',
  'typeof', 'instanceof', 'new', 'in', 'of',
  'if', 'else', 'for', 'while', 'do', 'switch',
  'case', 'break', 'continue', 'return', 'throw',
  'try', 'catch', 'finally', 'delete', 'void',
  'var', 'let', 'const', 'function', 'class',
  'async', 'await', 'yield', 'import', 'export',
  'default', 'extends', 'super', 'static',
  'Math', 'Number', 'String', 'Boolean', 'Array', 'Object',
  'Date', 'JSON', 'console', 'window', 'document'
]);

/**
 * Find root identifiers in an expression.
 *
 * @remarks
 * These are the top-level variable references that need to come from state.
 * Used to enable precise reactive dependency tracking.
 *
 * @param expr - The expression string to parse
 * @returns Array of root identifier names
 *
 * @example
 * ```ts
 * findRoots('user.name')                    // ['user']
 * findRoots('user.name + item.count')       // ['user', 'item']
 * findRoots('"hello.world"')                // []
 * findRoots('items.filter(x => x.active)')  // ['items', 'x']
 * ```
 */
export function findRoots(expr: string): string[] {
  const cleaned = expr
    .replace(/'(?:[^'\\]|\\.)*'/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\$]|\\.|\$(?!\{))*`/g, '""');

  // Match identifiers that are not preceded by a dot
  // Use simpler approach: match all identifiers, then filter out property accesses
  const allIdentifiers = cleaned.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];

  // Filter to keep only root identifiers (not after a dot)
  const roots: string[] = [];
  let lastEnd = 0;
  for (const id of allIdentifiers) {
    const pos = cleaned.indexOf(id, lastEnd);
    // Check if preceded by a dot (with optional whitespace)
    const before = cleaned.slice(0, pos).trimEnd();
    if (!before.endsWith('.')) {
      if (!JS_KEYWORDS.has(id) && !roots.includes(id)) {
        roots.push(id);
      }
    }
    lastEnd = pos + id.length;
  }

  return roots;
}

/**
 * A segment of parsed interpolation template.
 */
export interface Segment {
  /** Segment type: static text or expression */
  type: 'static' | 'expr';
  /** The segment value */
  value: string;
}

/**
 * Parse interpolation syntax in a string.
 *
 * @remarks
 * Splits a template string with `{{ expr }}` markers into segments
 * of static text and expressions. Useful for directives
 * that support inline interpolation.
 *
 * @param template - The template string with interpolation markers
 * @returns Array of segments
 *
 * @example
 * ```ts
 * parseInterpolation('/users/{{ user.id }}/profile')
 * // [
 * //   { type: 'static', value: '/users/' },
 * //   { type: 'expr', value: 'user.id' },
 * //   { type: 'static', value: '/profile' }
 * // ]
 * ```
 */
export function parseInterpolation(template: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\{\{\s*(.*?)\s*\}\}/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(template)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'static',
        value: template.slice(lastIndex, match.index)
      });
    }

    segments.push({
      type: 'expr',
      value: match[1]
    });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < template.length) {
    segments.push({
      type: 'static',
      value: template.slice(lastIndex)
    });
  }

  return segments;
}
