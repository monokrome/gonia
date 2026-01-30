/**
 * Shared resolver configuration factory for client and server.
 *
 * @packageDocumentation
 */

import { resolveFromProviders, resolveFromDIProviders } from './providers.js';
import { resolveContext, ContextKey } from './context-registry.js';
import { Mode } from './types.js';

/**
 * Service registry for dependency injection.
 */
export type ServiceRegistry = Map<string, unknown>;

/**
 * Resolver configuration for dependency injection.
 */
export interface ResolverConfig {
  resolveContext: (key: ContextKey<unknown>) => unknown;
  resolveState: () => Record<string, unknown>;
  resolveRootState?: () => Record<string, unknown>;
  resolveCustom: (name: string) => unknown;
  mode: 'client' | 'server';
  resolveFallback?: () => (() => void) | undefined;
}

/**
 * Create the resolveCustom function shared by client and server.
 *
 * @param el - The element for provider lookup
 * @param services - The global service registry
 * @returns A function that resolves custom dependencies
 */
export function createCustomResolver(
  el: Element,
  services: ServiceRegistry
): (name: string) => unknown {
  return (name: string) => {
    // Look up in ancestor DI providers first (provide option)
    const diProvided = resolveFromDIProviders(el, name);
    if (diProvided !== undefined) return diProvided;

    // Look up in global services registry
    const service = services.get(name);
    if (service !== undefined) return service;

    // Look up in ancestor context providers ($context)
    return resolveFromProviders(el, name);
  };
}

/**
 * Create resolver config for client-side dependency resolution.
 *
 * @param el - The element being processed
 * @param resolveState - Function to resolve the current state
 * @param services - The global service registry
 * @returns Resolver configuration for client mode
 */
export function createClientResolverConfig(
  el: Element,
  resolveState: () => Record<string, unknown>,
  services: ServiceRegistry
): ResolverConfig {
  return {
    resolveContext: (key: ContextKey<unknown>) => resolveContext(el, key),
    resolveState,
    resolveCustom: createCustomResolver(el, services),
    mode: 'client' as const
  };
}

/**
 * Create resolver config for server-side dependency resolution.
 *
 * @param el - The element being processed
 * @param scopeState - The current scope state
 * @param rootState - The root state object
 * @param services - The global service registry
 * @returns Resolver configuration for server mode
 */
export function createServerResolverConfig(
  el: Element,
  scopeState: Record<string, unknown>,
  rootState: Record<string, unknown>,
  services: ServiceRegistry
): ResolverConfig {
  return {
    resolveContext: (key: ContextKey<unknown>) => resolveContext(el, key),
    resolveState: () => scopeState,
    resolveRootState: () => rootState,
    resolveCustom: createCustomResolver(el, services),
    mode: 'server' as const
  };
}
