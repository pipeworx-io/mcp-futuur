interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Futuur Prediction Market MCP.
 *
 * Global play-money + real-money prediction markets — politics, crypto, sports,
 * science. Per-outcome implied probabilities (price 0–1) in two currency modes:
 * OOM = play money, USDC = real money. Keyless for public market reads.
 * A complement to the polymarket / kalshi / manifold / predictit packs.
 */


const BASE = 'https://api.futuur.com/api/v1';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_markets',
    description:
      'Search Futuur prediction markets (politics, crypto, sports, science) by text. Returns open markets by default with per-outcome implied probabilities in both play-money (OOM) and real-money (USDC) modes. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Text query, e.g. "trump", "bitcoin", "world cup". Omit to browse top markets.',
        },
        currency_mode: {
          type: 'string',
          description:
            'Which currency the per-outcome probabilities reflect: "real_money" (USDC) or "play_money" (OOM). Both are always returned; this just hints which to emphasize. Default "real_money".',
        },
        status: {
          type: 'string',
          description: 'Market status: "open" (default) or "resolved".',
        },
        limit: {
          type: 'number',
          description: 'Max markets to return (default 10, max 25).',
        },
      },
    },
  },
  {
    name: 'get_market',
    description:
      'Get one Futuur market by id with its full outcome list and per-outcome implied probabilities (play-money OOM + real-money USDC, as percentages), volumes, tags, description, and resolution status. Example id: 231754 ("Which price will Bitcoin hit in 2026?"). Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Futuur market id, e.g. 231754. Get ids from search_markets or top_markets.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'top_markets',
    description:
      'Most-active open Futuur markets (attention signal), ranked by trading volume. Returns each market with per-outcome implied probabilities (OOM play-money + USDC real-money). Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max markets to return (default 15, max 25).',
        },
        currency_mode: {
          type: 'string',
          description:
            'Which currency to rank volume by and emphasize: "real_money" (USDC, default) or "play_money" (OOM).',
        },
      },
    },
  },
];

interface FutuurOutcome {
  id?: number;
  title?: string;
  disabled?: boolean;
  price?: Record<string, number> | null;
}

interface FutuurMarket {
  id?: number;
  title?: string;
  slug?: string;
  status?: string;
  status_display?: string;
  resolution?: unknown;
  resolve_date?: string | null;
  bet_end_date?: string | null;
  event_end_date?: string | null;
  description?: string | null;
  is_binary?: boolean;
  real_currency_available?: boolean;
  wagers_count?: number;
  volume_play_money?: number;
  volume_real_money?: number;
  tags?: Array<{ name?: string }>;
  outcomes?: FutuurOutcome[];
}

function clampLimit(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return dflt;
  return Math.min(Math.floor(n), 25);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rsquo;/g, "'")
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function futuurGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`Futuur: ${res.status} ${body}`);
  }
  return res.json();
}

function publicUrl(slug?: string): string | undefined {
  return slug ? `https://futuur.com/q/${slug}` : undefined;
}

function mapOutcomes(outcomes: FutuurOutcome[] | undefined): Array<Record<string, unknown>> {
  if (!Array.isArray(outcomes)) return [];
  return outcomes
    .filter((o) => !o.disabled)
    .map((o) => {
      const price = o.price ?? {};
      const real = typeof price.USDC === 'number' ? price.USDC : undefined;
      const play = typeof price.OOM === 'number' ? price.OOM : undefined;
      return {
        title: o.title,
        // Implied probability as a percentage (price is 0–1).
        probability_pct: real != null ? round1(real * 100) : play != null ? round1(play * 100) : null,
        real_money_pct: real != null ? round1(real * 100) : null,
        play_money_pct: play != null ? round1(play * 100) : null,
      };
    });
}

function mapMarket(raw: FutuurMarket, opts: { full: boolean }): Record<string, unknown> {
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t) => t.name).filter((n): n is string => typeof n === 'string')
    : [];
  const base: Record<string, unknown> = {
    id: raw.id,
    title: raw.title,
    slug: raw.slug,
    status: raw.status_display ?? raw.status,
    tags: tags.slice(0, 6),
    volume_real_money: raw.volume_real_money,
    volume_play_money: raw.volume_play_money,
    url: publicUrl(raw.slug),
    outcomes: mapOutcomes(raw.outcomes),
  };

  if (opts.full) {
    base.is_binary = raw.is_binary;
    base.real_currency_available = raw.real_currency_available;
    base.wagers_count = raw.wagers_count;
    base.close_date = raw.bet_end_date ?? raw.event_end_date ?? null;
    if (raw.status === 'resolved' || raw.resolve_date) {
      base.resolved = true;
      base.resolve_date = raw.resolve_date ?? null;
      base.resolution = raw.resolution ?? null;
    }
    if (typeof raw.description === 'string' && raw.description.trim()) {
      base.description = stripHtml(raw.description).slice(0, 500);
    }
  }
  return base;
}

function marketVolume(m: FutuurMarket, mode: string): number {
  if (mode === 'play_money') return m.volume_play_money ?? 0;
  return m.volume_real_money ?? 0;
}

async function searchMarkets(args: Record<string, unknown>): Promise<unknown> {
  const limit = clampLimit(args.limit, 10);
  const search = typeof args.search === 'string' ? args.search.trim() : '';
  const status = typeof args.status === 'string' ? args.status.trim().toLowerCase() : 'open';

  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (search) params.set('search', search);
  // Futuur ignores ?status=; resolved markets are gated by resolved_only=true.
  if (status === 'resolved') params.set('resolved_only', 'true');

  const data = (await futuurGet(`/markets/?${params.toString()}`)) as {
    pagination?: { total?: number };
    results?: FutuurMarket[];
  };
  const results = Array.isArray(data.results) ? data.results : [];
  return {
    total: data.pagination?.total ?? results.length,
    count: results.length,
    markets: results.map((m) => mapMarket(m, { full: false })),
  };
}

async function getMarket(args: Record<string, unknown>): Promise<unknown> {
  const id = typeof args.id === 'number' ? args.id : Number(args.id);
  if (!Number.isFinite(id) || id <= 0) return { error: 'provide a numeric market id', id: args.id ?? null };

  const raw = (await futuurGet(`/markets/${id}/`)) as FutuurMarket;
  if (!raw || typeof raw.id === 'undefined') return { error: 'market not found', id };
  return mapMarket(raw, { full: true });
}

async function topMarkets(args: Record<string, unknown>): Promise<unknown> {
  const limit = clampLimit(args.limit, 15);
  const mode = typeof args.currency_mode === 'string' ? args.currency_mode.trim() : 'real_money';

  // Default order is already volume-descending; fetch a wider window then sort
  // client-side by the requested currency's volume to be safe.
  const fetchN = Math.min(limit * 2, 50);
  const data = (await futuurGet(`/markets/?limit=${fetchN}`)) as { results?: FutuurMarket[] };
  const results = Array.isArray(data.results) ? data.results : [];
  const sorted = results
    .slice()
    .sort((a, b) => marketVolume(b, mode) - marketVolume(a, mode))
    .slice(0, limit);
  return {
    count: sorted.length,
    markets: sorted.map((m) => mapMarket(m, { full: false })),
  };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'search_markets':
        return searchMarkets(args);
      case 'get_market':
        return getMarket(args);
      case 'top_markets':
        return topMarkets(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
