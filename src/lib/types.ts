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

/** What the search screen and the card need; long text and per-direction data live in `RouteDetail`. */
export interface RouteSummary extends Omit<Route, 'directions' | 'notes' | 'hours' | 'operatorDetail'> {
  directionCount: number;
}

export interface RouteDetail extends Pick<Route, 'id' | 'directions' | 'notes' | 'hours' | 'operatorDetail'> {
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
  /**
   * Canonical terminus pair. For a loop route (`loop`), the place the loop
   * starts from and the place it goes round via.
   */
  terminals?: [LocalizedText, LocalizedText];
  /** Circular route: sides are counter-clockwise (0, วนซ้าย) and clockwise (1, วนขวา) instead of termini. */
  loop: boolean;
  /** Loop routes: what each side's main run is signed as (null when that side has no run). */
  sideLabels?: [LoopSide | null, LoopSide | null];
  /** Short operator name for the card. */
  operator?: LocalizedText;
  /** Wikipedia's full wording, e.g. the subsidiary a route is run under; details page only. */
  operatorDetail?: LocalizedText;
  /** Vehicle types as listed by Wikipedia ("รถโดยสารประจำทางสีครีม-แดง"), English from translations. */
  vehicles: Vehicle[];
  service: ServiceFlags;
  /** Per-direction detail from OSM; may be empty, one, or two entries. */
  directions: Direction[];
  /** Free-text Thai notes from Wikipedia (history, quirks). */
  notes?: string;
  /** Service window from the feed, e.g. "05:00–22:00" or "24 h". */
  hours?: string;
  agreement: SourceAgreement;
  sources: RouteSources;
}

export interface ServiceFlags {
  expressway: boolean;
  /** Runs through the night (a service window covering 01:00–04:00). */
  night: boolean;
  /** Short-turn / supplementary service ("เสริม", "ช่วง"). */
  extra: boolean;
  airport: boolean;
  /** Category-4 suburban routes (four-digit numbers). */
  suburban: boolean;
  /** Passenger van line ("ต.99"), not a bus. */
  van: boolean;
}

/**
 * How the two sources compare on this route's termini. `conflict` means the
 * official feed and Wikipedia describe different end points — show the
 * feed's, but flag it.
 */
export type SourceAgreement = 'agree' | 'conflict' | 'gtfs-only' | 'wikipedia-only';

export interface Direction {
  from: LocalizedText;
  to: LocalizedText;
  /** Index into `Route.terminals` of the terminus this direction departs from, when it could be matched. */
  origin?: 0 | 1;
  /** Ordered stop ids from the GTFS trip. */
  stops: string[];
  tripId: string;
  headsign?: LocalizedText;
  /** A short-turn, expressway or other variant trip rather than the main run. */
  variant: boolean;
}

/**
 * A loop run as its front sign shows it: the place, and whether the sign
 * carries a rotation marker (วนซ้าย / วนขวา). Unmarked runs are signed as
 * plain destinations and are shown like one.
 */
export interface LoopSide {
  name: LocalizedText;
  marked: boolean;
}

export interface RouteSources {
  wikipedia: boolean;
  /** GTFS route ids folded into this route. */
  gtfsRouteIds: string[];
}

export interface Stop {
  id: string;
  name: LocalizedText;
  lat?: number;
  lon?: number;
  /** From data/overrides/landmarks.json: major landmarks are always shown, minor ones only to break a long stretch. */
  landmark?: Landmark;
  /** A boarding point on a hail-and-ride stretch: a place on the road, not a named stop. The name is empty. */
  hailAndRide?: true;
}

export interface Vehicle extends LocalizedText {
  /** Swatch bands, from the colour words of the name via data/overrides/vehicle-colours.json. */
  colours?: string[];
}

export interface Landmark {
  tier: string;
  rank: 'major' | 'minor';
  /** The keyword that matched, so consecutive stops of one landmark can be folded. */
  keyword: string;
}
