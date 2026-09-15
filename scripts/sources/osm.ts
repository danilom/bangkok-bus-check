/**
 * Extracts directional bus routes from an Overpass JSON snapshot of
 * `relation[type=route][route=bus]` plus their member nodes.
 *
 * One OSM relation is one direction of one route. The `ref` tag usually names
 * both numbers ("73 (2-45)"); the `name`/`name:en` tags are "<ref> A - B".
 */

import { z } from 'zod';

import { canonicalRouteNumber } from '../../src/lib/route-number.ts';
import type { LocalizedText, Stop } from '../../src/lib/types.ts';

const tagsSchema = z.record(z.string(), z.string());

const memberSchema = z.object({
  type: z.enum(['node', 'way', 'relation']),
  ref: z.number(),
  role: z.string(),
});

const elementSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('relation'), id: z.number(), tags: tagsSchema.optional(), members: z.array(memberSchema) }),
  z.object({ type: z.literal('node'), id: z.number(), tags: tagsSchema.optional(), lat: z.number(), lon: z.number() }),
  z.object({ type: z.literal('way'), id: z.number(), tags: tagsSchema.optional() }),
]);

export const overpassSnapshotSchema = z.object({
  osm3s: z.object({ timestamp_osm_base: z.string() }).optional(),
  elements: z.array(elementSchema),
});

export type OverpassSnapshot = z.infer<typeof overpassSnapshotSchema>;
type OsmNode = Extract<z.infer<typeof elementSchema>, { type: 'node' }>;
type OsmRelation = Extract<z.infer<typeof elementSchema>, { type: 'relation' }>;

export interface OsmRoute {
  relationId: number;
  /** Every route number named in `ref`, in source order. */
  numbers: string[];
  name?: LocalizedText;
  from?: LocalizedText;
  to?: LocalizedText;
  operator?: string;
  stops: Stop[];
}

export function parseOsmRoutes(snapshot: OverpassSnapshot): OsmRoute[] {
  const nodes = new Map<number, OsmNode>();
  const relations: OsmRelation[] = [];
  for (const element of snapshot.elements) {
    if (element.type === 'node') nodes.set(element.id, element);
    if (element.type === 'relation') relations.push(element);
  }
  return relations
    .map((relation) => parseRelation(relation, nodes))
    .filter((route): route is OsmRoute => route !== undefined);
}

function parseRelation(relation: OsmRelation, nodes: Map<number, OsmNode>): OsmRoute | undefined {
  const tags = relation.tags ?? {};
  const ref = tags['ref'];
  if (!ref) return undefined;
  const numbers = parseRef(ref);
  if (numbers.length === 0) return undefined;

  const route: OsmRoute = { relationId: relation.id, numbers, stops: collectStops(relation, nodes) };
  const name = localized(tags['name:th'] ?? tags['name'], tags['name:en']);
  if (name) route.name = name;
  const termini = parseTermini(tags, ref);
  if (termini) {
    route.from = termini.from;
    route.to = termini.to;
  }
  const operator = tags['operator'] ?? tags['network'];
  if (operator) route.operator = operator;
  return route;
}

/**
 * "73 (2-45)" → [73, 2-45]; "13 AC (3-38)" → [13AC, 3-38];
 * "1009 Songthaew" → [1009]; "1096 (ถนอมมิตร)" → [1096].
 */
export function parseRef(ref: string): string[] {
  const numbers: string[] = [];
  for (const part of ref.split(/[()/,]/)) {
    const joined = canonicalRouteNumber(part);
    const first = joined ?? canonicalRouteNumber(part.trim().split(/\s+/)[0] ?? '');
    if (first && !numbers.includes(first)) numbers.push(first);
  }
  return numbers;
}

/** Prefers explicit from/to tags; otherwise splits "<ref> A - B" names. */
function parseTermini(tags: Record<string, string>, ref: string): { from: LocalizedText; to: LocalizedText } | undefined {
  const fromTag = tags['from'];
  const toTag = tags['to'];
  if (fromTag && toTag) {
    return {
      from: localized(fromTag, tags['from:en']) ?? { th: fromTag },
      to: localized(toTag, tags['to:en']) ?? { th: toTag },
    };
  }
  const th = splitTermini(tags['name:th'] ?? tags['name'], ref);
  if (!th) return undefined;
  const en = splitTermini(tags['name:en'], ref);
  return {
    from: en ? { th: th[0], en: en[0] } : { th: th[0] },
    to: en ? { th: th[1], en: en[1] } : { th: th[1] },
  };
}

// Leading "<ref>" as mappers actually write it: "73 (2-45)", "3-16E (139 ปอ.)",
// "13 AC (3-38)". A number-ish first token plus any parenthesised groups.
const NAME_REF_PREFIX = /^[A-Za-z0-9\-]+(?:\s+[A-Z]{1,3})?(?:\s*\([^)]*\))*\s*[:：]?\s*/;

export function splitTermini(name: string | undefined, ref: string): [string, string] | undefined {
  if (!name) return undefined;
  const withoutRef = name.startsWith(ref) ? name.slice(ref.length) : name.replace(NAME_REF_PREFIX, '');
  const parts = withoutRef
    .replace(/^[\s:：]+/, '')
    .split(/\s+[-–—→]+\s+|\s*→\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined ? [parts[0], parts[1]] : undefined;
}

function localized(th: string | undefined, en: string | undefined): LocalizedText | undefined {
  if (!th) return undefined;
  return en ? { th, en } : { th };
}

const STOP_ROLE = /stop|platform/i;

/**
 * Stop members in relation order. Bangkok mappers use a mix of PTv2 roles,
 * the legacy `bus_stop` role and no role at all, so a member counts as a stop
 * when either its role or the node's own tags say so.
 */
function collectStops(relation: OsmRelation, nodes: Map<number, OsmNode>): Stop[] {
  const stops: Stop[] = [];
  for (const member of relation.members) {
    if (member.type !== 'node') continue;
    const node = nodes.get(member.ref);
    if (!node) continue;
    const tags = node.tags ?? {};
    const isStopNode = tags['highway'] === 'bus_stop' || tags['public_transport'] !== undefined;
    if (!STOP_ROLE.test(member.role) && !isStopNode) continue;
    stops.push(toStop(node));
  }
  return stops;
}

function toStop(node: OsmNode): Stop {
  const tags = node.tags ?? {};
  const th = tags['name:th'] ?? tags['name'] ?? '';
  const name: LocalizedText = tags['name:en'] ? { th, en: tags['name:en'] } : { th };
  return { id: `n${node.id}`, name, lat: node.lat, lon: node.lon };
}
