/**
 * Data model shared by the pipeline and the app.
 *
 * `bbc build-data` assembles a full `RouteDataset` in memory, then ships it as
 * `public/data/index.json` (a `RouteIndex`, loaded eagerly) plus one
 * `public/data/routes/<id>.json` (`RouteDetail`) per route with directions.
 */

export interface LocalizedText {
  th: string;
  en?: string;
}

export interface RouteDataset {
  /** ISO timestamp of the build. */
  generatedAt: string;
  attribution: string[];
  routes: Route[];
  /** Stops referenced from `Direction.stops`, keyed by id. */
  stops: Record<string, Stop>;
}

export interface RouteIndex {
  generatedAt: string;
  attribution: string[];
  routes: RouteSummary[];
}

/** What the search screen needs; long text and per-direction data live in `RouteDetail`. */
export interface RouteSummary extends Omit<Route, 'directions' | 'notes' | 'vehicles'> {
  directionCount: number;
}

export interface RouteDetail extends Pick<Route, 'id' | 'directions' | 'notes' | 'vehicles'> {
  /** Only the stops this route's directions reference. */
  stops: Record<string, Stop>;
}

export interface Route {
  /** Stable identity: the zone-style number when known, else the old number. */
  id: string;
  /** The number as displayed on the bus. */
  number: string;
  /** Pre-reform numbers (or "comparable" old routes) shown as secondary. */
  formerNumbers: string[];
  /** Every number that should match a search, primary included. */
  aliases: string[];
  /** Canonical terminus pair; Thai from Wikipedia, English from OSM when matched. */
  terminals?: [LocalizedText, LocalizedText];
  operator?: LocalizedText;
  /** Thai vehicle descriptions as listed by Wikipedia ("รถโดยสารประจำทางสีครีม-แดง"). */
  vehicles: string[];
  service: ServiceFlags;
  /** Per-direction detail from OSM; may be empty, one, or two entries. */
  directions: Direction[];
  /** Free-text Thai notes from Wikipedia (history, quirks). */
  notes?: string;
  sources: RouteSources;
}

export interface ServiceFlags {
  expressway: boolean;
  night: boolean;
  /** Short-turn / supplementary service ("เสริม"). */
  extra: boolean;
  airport: boolean;
  /** Category-4 suburban routes (four-digit numbers). */
  suburban: boolean;
}

export interface Direction {
  from: LocalizedText;
  to: LocalizedText;
  /** Index into `Route.terminals` of the terminus this direction departs from, when it could be matched. */
  origin?: 0 | 1;
  /** Ordered stop ids; often empty because OSM stop membership is sparse. */
  stops: string[];
  osmRelationId: number;
}

export interface RouteSources {
  wikipedia: boolean;
  osmRelationIds: number[];
}

export interface Stop {
  id: string;
  name: LocalizedText;
  lat?: number;
  lon?: number;
  landmark?: boolean;
}
