import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from '../../supabase/client';

const LOCAL_EVENTS_KEY = 'edges-signal-events-v1';
const LOCAL_MIRROR_KEY = 'edges-mirror-signals-v1';
const SEEN_MIRROR_KEY = 'edges-mirror-seen-v1';

export type SignalEvent = {
  id: string;
  title: string;
  direction: 'buy' | 'sell' | 'watch' | 'news';
  symbol?: string | null;
  startsAt: string;
  note?: string | null;
  publishedByEmail?: string | null;
  createdAt: string;
};

export type MirrorSignal = {
  id: string;
  eaId: string;
  eaName?: string | null;
  symbol: string;
  direction: 'buy' | 'sell';
  mentorEmail?: string | null;
  lotSize?: number | null;
  note?: string | null;
  createdAt: string;
};

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function eventFromRow(r: Record<string, unknown>): SignalEvent {
  const dir = String(r.direction || 'watch');
  return {
    id: String(r.id),
    title: String(r.title || ''),
    direction:
      dir === 'buy' || dir === 'sell' || dir === 'news' ? dir : 'watch',
    symbol: (r.symbol as string | null) ?? null,
    startsAt: String(r.starts_at ?? r.startsAt ?? new Date().toISOString()),
    note: (r.note as string | null) ?? null,
    publishedByEmail:
      (r.published_by_email as string | null) ??
      (r.publishedByEmail as string | null) ??
      null,
    createdAt: String(r.created_at ?? r.createdAt ?? new Date().toISOString()),
  };
}

function mirrorFromRow(r: Record<string, unknown>): MirrorSignal {
  return {
    id: String(r.id),
    eaId: String(r.ea_id ?? r.eaId ?? ''),
    eaName: (r.ea_name as string | null) ?? (r.eaName as string | null) ?? null,
    symbol: String(r.symbol || ''),
    direction: String(r.direction) === 'sell' ? 'sell' : 'buy',
    mentorEmail:
      (r.mentor_email as string | null) ??
      (r.mentorEmail as string | null) ??
      null,
    lotSize:
      r.lot_size != null
        ? Number(r.lot_size)
        : r.lotSize != null
          ? Number(r.lotSize)
          : null,
    note: (r.note as string | null) ?? null,
    createdAt: String(r.created_at ?? r.createdAt ?? new Date().toISOString()),
  };
}

async function loadLocalEvents(): Promise<SignalEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_EVENTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SignalEvent[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveLocalEvents(events: SignalEvent[]) {
  await AsyncStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(events));
}

export async function listUpcomingSignalEvents(): Promise<SignalEvent[]> {
  const now = Date.now();
  const local = (await loadLocalEvents()).filter(
    (e) => new Date(e.startsAt).getTime() >= now - 60 * 60 * 1000,
  );

  const sb = getSupabase();
  if (!sb) {
    return local.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  try {
    const since = new Date(now - 60 * 60 * 1000).toISOString();
    const { data, error } = await sb
      .from('signal_events')
      .select('*')
      .gte('starts_at', since)
      .order('starts_at', { ascending: true })
      .limit(50);
    if (error || !data) {
      return local.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    const remote = data.map((r) => eventFromRow(r as Record<string, unknown>));
    const byId = new Map<string, SignalEvent>();
    for (const e of local) byId.set(e.id, e);
    for (const e of remote) byId.set(e.id, e);
    return [...byId.values()].sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    );
  } catch {
    return local.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
}

export async function publishSignalEvent(input: {
  title: string;
  direction: SignalEvent['direction'];
  symbol?: string;
  startsAt: string;
  note?: string;
  publishedByEmail?: string;
}): Promise<{ ok: boolean; event?: SignalEvent; error?: string }> {
  const event: SignalEvent = {
    id: uid('evt'),
    title: input.title.trim(),
    direction: input.direction,
    symbol: input.symbol?.trim().toUpperCase() || null,
    startsAt: input.startsAt,
    note: input.note?.trim() || null,
    publishedByEmail: input.publishedByEmail || null,
    createdAt: new Date().toISOString(),
  };

  const local = await loadLocalEvents();
  await saveLocalEvents([event, ...local].slice(0, 100));

  const sb = getSupabase();
  if (!sb) return { ok: true, event };

  try {
    const { error } = await sb.from('signal_events').upsert({
      id: event.id,
      title: event.title,
      direction: event.direction,
      symbol: event.symbol,
      starts_at: event.startsAt,
      note: event.note,
      published_by_email: event.publishedByEmail,
      created_at: event.createdAt,
    });
    if (error) return { ok: false, event, error: error.message };
    return { ok: true, event };
  } catch (err) {
    return {
      ok: false,
      event,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function loadLocalMirrors(): Promise<MirrorSignal[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_MIRROR_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as MirrorSignal[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveLocalMirrors(rows: MirrorSignal[]) {
  await AsyncStorage.setItem(LOCAL_MIRROR_KEY, JSON.stringify(rows));
}

export async function publishMirrorSignal(input: {
  eaId: string;
  eaName?: string;
  symbol: string;
  direction: 'buy' | 'sell';
  mentorEmail?: string;
  lotSize?: number;
  note?: string;
}): Promise<{ ok: boolean; signal?: MirrorSignal; error?: string }> {
  const signal: MirrorSignal = {
    id: uid('mir'),
    eaId: input.eaId,
    eaName: input.eaName || null,
    symbol: input.symbol.trim().toUpperCase(),
    direction: input.direction,
    mentorEmail: input.mentorEmail || null,
    lotSize: input.lotSize ?? null,
    note: input.note?.trim() || null,
    createdAt: new Date().toISOString(),
  };

  const local = await loadLocalMirrors();
  await saveLocalMirrors([signal, ...local].slice(0, 50));

  const sb = getSupabase();
  if (!sb) return { ok: true, signal };

  try {
    const { error } = await sb.from('mirror_signals').upsert({
      id: signal.id,
      ea_id: signal.eaId,
      ea_name: signal.eaName,
      symbol: signal.symbol,
      direction: signal.direction,
      mentor_email: signal.mentorEmail,
      lot_size: signal.lotSize,
      note: signal.note,
      created_at: signal.createdAt,
    });
    if (error) return { ok: false, signal, error: error.message };
    return { ok: true, signal };
  } catch (err) {
    return {
      ok: false,
      signal,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchRecentMirrorForEa(
  eaId: string,
  sinceMs = 10 * 60 * 1000,
): Promise<MirrorSignal[]> {
  if (!eaId) return [];
  const sinceIso = new Date(Date.now() - sinceMs).toISOString();
  const local = (await loadLocalMirrors()).filter(
    (m) => m.eaId === eaId && m.createdAt >= sinceIso,
  );

  const sb = getSupabase();
  if (!sb) return local;

  try {
    const { data, error } = await sb
      .from('mirror_signals')
      .select('*')
      .eq('ea_id', eaId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error || !data) return local;
    const remote = data.map((r) => mirrorFromRow(r as Record<string, unknown>));
    const byId = new Map<string, MirrorSignal>();
    for (const m of local) byId.set(m.id, m);
    for (const m of remote) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  } catch {
    return local;
  }
}

export async function markMirrorSeen(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_MIRROR_KEY);
    const set = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    set.add(id);
    await AsyncStorage.setItem(
      SEEN_MIRROR_KEY,
      JSON.stringify([...set].slice(-200)),
    );
  } catch {
    /* ignore */
  }
}

export async function isMirrorSeen(id: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_MIRROR_KEY);
    if (!raw) return false;
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) && arr.includes(id);
  } catch {
    return false;
  }
}
