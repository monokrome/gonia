/**
 * TypeScript Language Service Plugin for Gonia.
 *
 * Provides type inference and validation for directive templates.
 * Analyzes g-model, g-text, etc. in templates and infers $scope types.
 *
 * @packageDocumentation
 */

import type tslib from 'typescript/lib/tsserverlibrary';

type InferredType = 'boolean' | 'string' | 'number' | 'array' | 'object' | 'null' | 'unknown';

interface TemplateTypeInfo {
  property: string;
  type: InferredType;
  source: string; // e.g., "checkbox g-model", "g-scope literal"
}

/**
 * Infer types from HTML template based on element context.
 */
function inferTypesFromTemplate(template: string): TemplateTypeInfo[] {
  const types: TemplateTypeInfo[] = [];

  // Match g-model on various input types
  const inputModelRegex = /<input[^>]*type=["'](\w+)["'][^>]*g-model=["']([^"']+)["'][^>]*>/gi;
  const inputModelRegex2 = /<input[^>]*g-model=["']([^"']+)["'][^>]*type=["'](\w+)["'][^>]*>/gi;
  const genericModelRegex = /<input[^>]*g-model=["']([^"']+)["'][^>]*>/gi;
  const textareaModelRegex = /<textarea[^>]*g-model=["']([^"']+)["'][^>]*>/gi;
  const selectModelRegex = /<select[^>]*g-model=["']([^"']+)["'][^>]*>/gi;

  let match;

  // input with type before g-model
  while ((match = inputModelRegex.exec(template)) !== null) {
    const inputType = match[1].toLowerCase();
    const property = match[2];
    types.push({
      property,
      type: inferTypeFromInputType(inputType),
      source: `<input type="${inputType}"> g-model`
    });
  }

  // input with g-model before type
  while ((match = inputModelRegex2.exec(template)) !== null) {
    const property = match[1];
    const inputType = match[2].toLowerCase();
    types.push({
      property,
      type: inferTypeFromInputType(inputType),
      source: `<input type="${inputType}"> g-model`
    });
  }

  // input without explicit type (defaults to text)
  while ((match = genericModelRegex.exec(template)) !== null) {
    const property = match[1];
    // Skip if already captured by type-specific regex
    if (!types.some(t => t.property === property)) {
      types.push({
        property,
        type: 'string',
        source: '<input> g-model (default text)'
      });
    }
  }

  // textarea
  while ((match = textareaModelRegex.exec(template)) !== null) {
    types.push({
      property: match[1],
      type: 'string',
      source: '<textarea> g-model'
    });
  }

  // select
  while ((match = selectModelRegex.exec(template)) !== null) {
    types.push({
      property: match[1],
      type: 'string',
      source: '<select> g-model'
    });
  }

  // g-scope attributes - extract using balanced brace matching
  const gScopeValues = extractGScopeValues(template);
  for (const scopeValue of gScopeValues) {
    const scopeTypes = parseGScopeTypes(scopeValue);
    for (const scopeType of scopeTypes) {
      // Don't override g-model inferences (they're more specific)
      if (!types.some(t => t.property === scopeType.property)) {
        types.push(scopeType);
      }
    }
  }

  return types;
}

function inferTypeFromInputType(inputType: string): 'boolean' | 'string' | 'number' {
  switch (inputType) {
    case 'checkbox':
    case 'radio':
      return 'boolean';
    case 'number':
    case 'range':
      return 'number';
    default:
      return 'string';
  }
}

/**
 * Extract g-scope attribute values from template, handling nested quotes and braces.
 */
function extractGScopeValues(template: string): string[] {
  const results: string[] = [];

  // Find g-scope=" or g-scope='
  let i = 0;
  while (i < template.length) {
    const gScopeMatch = template.slice(i).match(/g-scope=(["'])/);
    if (!gScopeMatch) break;

    const quoteChar = gScopeMatch[1];
    const startPos = i + gScopeMatch.index! + gScopeMatch[0].length;

    // Now extract until the matching closing quote, respecting nested braces and quotes
    let depth = 0;
    let inString: string | null = null;
    let j = startPos;
    let content = '';

    while (j < template.length) {
      const char = template[j];

      if (inString) {
        content += char;
        if (char === inString && template[j - 1] !== '\\') {
          inString = null;
        }
      } else if (char === quoteChar && depth === 0) {
        // End of attribute value
        break;
      } else if (char === '"' || char === "'" || char === '`') {
        inString = char;
        content += char;
      } else if (char === '{') {
        depth++;
        content += char;
      } else if (char === '}') {
        depth--;
        content += char;
      } else {
        content += char;
      }

      j++;
    }

    if (content.trim()) {
      results.push(content.trim());
    }

    i = j + 1;
  }

  return results;
}

/**
 * Infer type from a JavaScript literal value.
 */
function inferTypeFromLiteral(value: string): InferredType {
  const trimmed = value.trim();

  // Boolean literals
  if (trimmed === 'true' || trimmed === 'false') {
    return 'boolean';
  }

  // Null literal
  if (trimmed === 'null') {
    return 'null';
  }

  // Number literals (including negative, decimal, scientific notation)
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
    return 'number';
  }

  // String literals (single or double quoted)
  if (/^['"].*['"]$/.test(trimmed)) {
    return 'string';
  }

  // Template literals
  if (/^`.*`$/.test(trimmed)) {
    return 'string';
  }

  // Array literals
  if (trimmed.startsWith('[')) {
    return 'array';
  }

  // Object literals
  if (trimmed.startsWith('{')) {
    return 'object';
  }

  return 'unknown';
}

/**
 * Parse g-scope attribute to extract property types.
 * Handles: g-scope="{ count: 0, name: 'Alice', enabled: true }"
 */
function parseGScopeTypes(scopeExpr: string): TemplateTypeInfo[] {
  const types: TemplateTypeInfo[] = [];

  // Remove outer braces if present
  let expr = scopeExpr.trim();
  if (expr.startsWith('{') && expr.endsWith('}')) {
    expr = expr.slice(1, -1).trim();
  }

  if (!expr) return types;

  // Parse property: value pairs, respecting nesting
  let depth = 0;
  let current = '';
  const pairs: string[] = [];

  for (const char of expr) {
    if (char === '{' || char === '[' || char === '(') {
      depth++;
      current += char;
    } else if (char === '}' || char === ']' || char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      pairs.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    pairs.push(current.trim());
  }

  // Extract property name and value from each pair
  for (const pair of pairs) {
    // Match: property: value or 'property': value or "property": value
    const match = pair.match(/^(['"]?)(\w+)\1\s*:\s*(.+)$/);
    if (match) {
      const property = match[2];
      const value = match[3];
      const type = inferTypeFromLiteral(value);

      types.push({
        property,
        type,
        source: 'g-scope literal'
      });
    }
  }

  return types;
}

/**
 * Extract the string value from a template literal or string literal node.
 */
function getStringValue(node: tslib.Node, ts: typeof tslib): string | null {
  if (ts.isStringLiteral(node)) {
    return node.text;
  }
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    // For template expressions with substitutions, just get the head for now
    // This is a simplification - full support would need to evaluate the template
    return node.head.text;
  }
  return null;
}

/**
 * Find directive() calls and extract template + function info.
 */
function findDirectiveCalls(
  sourceFile: tslib.SourceFile,
  ts: typeof tslib
): Array<{
  functionName: string;
  functionNode: tslib.Node | null;
  template: string;
  callNode: tslib.CallExpression;
}> {
  const results: Array<{
    functionName: string;
    functionNode: tslib.Node | null;
    template: string;
    callNode: tslib.CallExpression;
  }> = [];

  function visit(node: tslib.Node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;

      // Check if it's a call to 'directive'
      if (ts.isIdentifier(expr) && expr.text === 'directive') {
        const args = node.arguments;

        // directive(name, fn, options?) or directive(name, options)
        if (args.length >= 2) {
          let fnArg: tslib.Expression | null = null;
          let optionsArg: tslib.Expression | null = null;

          if (args.length === 2) {
            // Could be directive(name, fn) or directive(name, options)
            const second = args[1];
            if (ts.isObjectLiteralExpression(second)) {
              optionsArg = second;
            } else {
              fnArg = second;
            }
          } else if (args.length >= 3) {
            fnArg = args[1];
            optionsArg = args[2];
          }

          // Extract template from options
          let template: string | null = null;
          if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
            for (const prop of optionsArg.properties) {
              if (
                ts.isPropertyAssignment(prop) &&
                ts.isIdentifier(prop.name) &&
                prop.name.text === 'template'
              ) {
                template = getStringValue(prop.initializer, ts);
                break;
              }
            }
          }

          if (template && fnArg) {
            let functionName = '';
            let functionNode: tslib.Node | null = null;

            if (ts.isIdentifier(fnArg)) {
              functionName = fnArg.text;
              // Try to find the function declaration
              // This is simplified - a full implementation would use the type checker
            } else if (ts.isFunctionExpression(fnArg) || ts.isArrowFunction(fnArg)) {
              functionName = '<inline>';
              functionNode = fnArg;
            }

            results.push({
              functionName,
              functionNode,
              template,
              callNode: node
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

/**
 * Get the type of $scope parameter from a function.
 */
function getScopeParamType(
  checker: tslib.TypeChecker,
  fn: tslib.Node,
  ts: typeof tslib
): tslib.Type | null {
  if (!ts.isFunctionExpression(fn) && !ts.isArrowFunction(fn) && !ts.isFunctionDeclaration(fn)) {
    return null;
  }

  const funcType = checker.getTypeAtLocation(fn);
  const signatures = funcType.getCallSignatures();

  if (signatures.length === 0) return null;

  const params = signatures[0].getParameters();

  // Look for $scope parameter
  for (const param of params) {
    if (param.name === '$scope') {
      const paramDecl = param.valueDeclaration;
      if (paramDecl) {
        return checker.getTypeAtLocation(paramDecl);
      }
    }
  }

  return null;
}

/**
 * Check if a type is compatible with the expected type.
 */
function isTypeCompatible(
  checker: tslib.TypeChecker,
  actualType: tslib.Type,
  propertyName: string,
  expectedType: InferredType,
  ts: typeof tslib
): { compatible: boolean; actualTypeName: string } {
  const prop = actualType.getProperty(propertyName);
  if (!prop) {
    // Property not found - might be using index signature or any
    return { compatible: true, actualTypeName: 'unknown' };
  }

  const propDecl = prop.valueDeclaration;
  if (!propDecl) {
    return { compatible: true, actualTypeName: 'unknown' };
  }

  const propType = checker.getTypeAtLocation(propDecl);
  const propTypeName = checker.typeToString(propType);

  if (expectedType === 'unknown') {
    return { compatible: true, actualTypeName: propTypeName };
  }

  // Check type compatibility
  const typeFlags = propType.flags;

  let isExpectedType = false;
  switch (expectedType) {
    case 'boolean':
      isExpectedType = !!(typeFlags & ts.TypeFlags.BooleanLike);
      break;
    case 'string':
      isExpectedType = !!(typeFlags & ts.TypeFlags.StringLike);
      break;
    case 'number':
      isExpectedType = !!(typeFlags & ts.TypeFlags.NumberLike);
      break;
    case 'null':
      isExpectedType = !!(typeFlags & ts.TypeFlags.Null);
      break;
    case 'array':
      // Check if it's an array type
      isExpectedType = checker.isArrayType(propType) ||
        checker.isTupleType(propType) ||
        propTypeName.endsWith('[]') ||
        propTypeName.startsWith('Array<');
      break;
    case 'object':
      // Object is compatible with most non-primitive types
      isExpectedType = !!(typeFlags & ts.TypeFlags.Object) &&
        !checker.isArrayType(propType);
      break;
  }

  // Also check if it's a union that includes the expected type
  if (!isExpectedType && propType.isUnion()) {
    for (const unionType of propType.types) {
      const unionTypeName = checker.typeToString(unionType);
      switch (expectedType) {
        case 'boolean':
          if (unionType.flags & ts.TypeFlags.BooleanLike) isExpectedType = true;
          break;
        case 'string':
          if (unionType.flags & ts.TypeFlags.StringLike) isExpectedType = true;
          break;
        case 'number':
          if (unionType.flags & ts.TypeFlags.NumberLike) isExpectedType = true;
          break;
        case 'null':
          if (unionType.flags & ts.TypeFlags.Null) isExpectedType = true;
          break;
        case 'array':
          if (checker.isArrayType(unionType) ||
              checker.isTupleType(unionType) ||
              unionTypeName.endsWith('[]') ||
              unionTypeName.startsWith('Array<')) {
            isExpectedType = true;
          }
          break;
        case 'object':
          if ((unionType.flags & ts.TypeFlags.Object) && !checker.isArrayType(unionType)) {
            isExpectedType = true;
          }
          break;
      }
    }
  }

  return { compatible: isExpectedType, actualTypeName: propTypeName };
}

function init(modules: { typescript: typeof tslib }) {
  const ts = modules.typescript;

  function create(info: tslib.server.PluginCreateInfo) {
    const log = (msg: string) => {
      info.project.projectService.logger.info(`[gonia] ${msg}`);
    };

    log('Gonia TypeScript plugin initialized');

    // Create proxy for language service
    const proxy = Object.create(null) as tslib.LanguageService;
    const oldLS = info.languageService;

    // Copy all methods
    for (const k in oldLS) {
      const key = k as keyof tslib.LanguageService;
      (proxy as unknown as Record<string, unknown>)[k] = function (...args: unknown[]) {
        return (oldLS[key] as Function).apply(oldLS, args);
      };
    }

    // Override getSemanticDiagnostics
    proxy.getSemanticDiagnostics = (fileName: string) => {
      const prior = oldLS.getSemanticDiagnostics(fileName);
      const program = oldLS.getProgram();

      if (!program) return prior;

      const sourceFile = program.getSourceFile(fileName);
      if (!sourceFile) return prior;

      // Only check .ts/.tsx files
      if (!fileName.endsWith('.ts') && !fileName.endsWith('.tsx')) {
        return prior;
      }

      const checker = program.getTypeChecker();
      const customDiagnostics: tslib.Diagnostic[] = [];

      // Find directive() calls
      const directiveCalls = findDirectiveCalls(sourceFile, ts);

      for (const call of directiveCalls) {
        // Infer types from template
        const templateTypes = inferTypesFromTemplate(call.template);

        if (templateTypes.length === 0) continue;

        // Get the function node
        let fnNode: tslib.Node | null = call.functionNode;

        if (!fnNode && call.functionName && call.functionName !== '<inline>') {
          // Find the function by name in the file
          ts.forEachChild(sourceFile, (node) => {
            if (ts.isVariableStatement(node)) {
              for (const decl of node.declarationList.declarations) {
                if (ts.isIdentifier(decl.name) && decl.name.text === call.functionName) {
                  if (decl.initializer) {
                    fnNode = decl.initializer;
                  }
                }
              }
            } else if (ts.isFunctionDeclaration(node) && node.name?.text === call.functionName) {
              fnNode = node;
            }
          });
        }

        if (!fnNode) continue;

        // Get $scope type
        const scopeType = getScopeParamType(checker, fnNode, ts);
        if (!scopeType) continue;

        // Check each template-inferred type
        for (const templateType of templateTypes) {
          const { compatible, actualTypeName } = isTypeCompatible(
            checker,
            scopeType,
            templateType.property,
            templateType.type,
            ts
          );

          if (!compatible) {
            customDiagnostics.push({
              file: sourceFile,
              start: call.callNode.getStart(),
              length: call.callNode.getWidth(),
              messageText: `Template expects '$scope.${templateType.property}' to be ${templateType.type} (from ${templateType.source}), but directive declares it as ${actualTypeName}`,
              category: ts.DiagnosticCategory.Error,
              code: 90001,
              source: 'gonia'
            });
          }
        }
      }

      return [...prior, ...customDiagnostics];
    };

    return proxy;
  }

  return { create };
}

export = init;
