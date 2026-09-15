/** Shape of `public/data/routes.json`, produced by `bbc build-data`. */

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
