/**
 * Central configuration. Everything is overridable via environment variables;
 * defaults target the local academic demo (Postgres.app / docker compose).
 */
export const config = {
  port: Number(process.env.PORT ?? 3000),

  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://foodbridge:foodbridge@localhost:5432/foodbridge',

  jwtSecret: process.env.JWT_SECRET ?? 'foodbridge-dev-secret-not-for-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '4h',
  bcryptRounds: 10,

  /** Python matching service (FastAPI) base URL. */
  matcherUrl: process.env.MATCHER_URL ?? 'http://localhost:8000',
  matcherTimeoutMs: Number(process.env.MATCHER_TIMEOUT_MS ?? 20_000),

  matching: {
    /** 'greedy' (default, mid-semester demo) or 'hungarian'. */
    strategy: (process.env.MATCHING_STRATEGY ?? 'greedy') as 'greedy' | 'hungarian',
    initialRadiusKm: Number(process.env.MATCH_INITIAL_RADIUS_KM ?? 5),
    maxRadiusKm: Number(process.env.MATCH_MAX_RADIUS_KM ?? 25),
    radiusStepKm: Number(process.env.MATCH_RADIUS_STEP_KM ?? 5),
    /** A PENDING match offer expires after this many minutes. */
    offerExpiryMinutes: Number(process.env.MATCH_OFFER_EXPIRY_MINUTES ?? 30),
  },

  geocoding: {
    /** 'nominatim' uses OpenStreetMap (needs network); 'off' = coordinates only. */
    provider: (process.env.GEOCODING_PROVIDER ?? 'nominatim') as 'nominatim' | 'off',
    userAgent: 'FoodBridge academic project (local development demo)',
    /** Nominatim usage policy: max 1 request/second. */
    minIntervalMs: 1100,
  },
} as const;
