/** Loads the compiled dataset. Shapes are checked at the boundary before use. */

import type { RouteDetail, RouteIndex } from './types.ts';

export type LoadResult<T> = { ok: true; value: T } | { ok: false; error: string };

const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

export async function loadIndex(): Promise<LoadResult<RouteIndex>> {
  return fetchJson(`${DATA_BASE}index.json`, isRouteIndex);
}

export async function loadDetail(id: string): Promise<LoadResult<RouteDetail>> {
  return fetchJson(`${DATA_BASE}routes/${encodeURIComponent(id)}.json`, isRouteDetail);
}

async function fetchJson<T>(url: string, guard: (value: unknown) => value is T): Promise<LoadResult<T>> {
  let body: unknown;
  try {
    const response = await fetch(url);
    if (!response.ok) return { ok: false, error: `${url}: HTTP ${response.status}` };
    body = await response.json();
  } catch (error) {
    return { ok: false, error: `${url}: ${error instanceof Error ? error.message : String(error)}` };
  }
  return guard(body) ? { ok: true, value: body } : { ok: false, error: `${url}: unexpected shape` };
}

// The data is our own build output, so these guards check structure rather
// than every field; a wrong build should fail loudly here, not deep in the UI.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRouteIndex(value: unknown): value is RouteIndex {
  return (
    isRecord(value) &&
    typeof value['generatedAt'] === 'string' &&
    Array.isArray(value['attribution']) &&
    Array.isArray(value['routes']) &&
    value['routes'].every(isRouteSummary)
  );
}

function isRouteSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['number'] === 'string' &&
    Array.isArray(value['aliases']) &&
    isRecord(value['service']) &&
    typeof value['agreement'] === 'string' &&
    typeof value['loop'] === 'boolean' &&
    isRecord(value['sources'])
  );
}

function isRouteDetail(value: unknown): value is RouteDetail {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    Array.isArray(value['directions']) &&
    Array.isArray(value['vehicles']) &&
    isRecord(value['stops'])
  );
}
