/**
 * Per-mentor catalog isolation helpers for the Mentors Portal.
 *
 * EAs: always owner-scoped (including super admin — no other mentors' catalogs).
 * Keys: mentors see own/issued; super admin may see all keys for oversight.
 */
import { DEMO_MENTOR_EMAIL } from '../auth/mentorAuth';

export const SUPER_ADMIN_EMAIL = DEMO_MENTOR_EMAIL;

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return (email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function normalizeMentorEmail(
  email: string | null | undefined,
): string {
  return (email || '').trim().toLowerCase();
}

export type OwnedEa = {
  id: string;
  ownerEmail?: string | null;
};

export type IssuedKey = {
  id: string;
  eaId: string;
  issuedByEmail?: string | null;
};

/**
 * Scope EAs + keys for a portal actor.
 * - EAs: only rows owned by the actor (super admin included — privacy).
 * - Keys: mentors → issued by them or under their EAs; SA → all keys.
 */
export function scopeCatalogForMentor<
  E extends OwnedEa,
  K extends IssuedKey,
>(
  eas: E[],
  keys: K[],
  actorEmail: string | null | undefined,
): { eas: E[]; keys: K[] } {
  const actor = normalizeMentorEmail(actorEmail);
  if (!actor) {
    return { eas: [], keys: [] };
  }

  const myEas = eas.filter(
    (e) => normalizeMentorEmail(e.ownerEmail) === actor,
  );
  const myEaIds = new Set(myEas.map((e) => e.id));

  if (isSuperAdminEmail(actor)) {
    // SA may oversee all license keys; never other mentors' EA rows.
    return { eas: myEas, keys };
  }

  const myKeys = keys.filter((k) => {
    const issuer = normalizeMentorEmail(k.issuedByEmail);
    if (issuer === actor) return true;
    return myEaIds.has(k.eaId);
  });
  return { eas: myEas, keys: myKeys };
}

/** True when this actor may create/edit the EA. */
export function canManageEa(
  ea: OwnedEa | null | undefined,
  actorEmail: string | null | undefined,
): boolean {
  const actor = normalizeMentorEmail(actorEmail);
  if (!actor) return false;
  if (!ea) return true; // new create — stamp ownership on write
  const owner = normalizeMentorEmail(ea.ownerEmail);
  // Legacy unowned rows: mentors must not claim/edit; admin only.
  if (!owner) return isSuperAdminEmail(actor);
  return owner === actor;
}

/** True when this actor may generate/list a key for the EA. */
export function canUseEaForKeys(
  ea: OwnedEa | null | undefined,
  actorEmail: string | null | undefined,
): boolean {
  return canManageEa(ea, actorEmail);
}

/** Group keys by issuer email for Super Admin oversight UI. */
export function groupKeysByIssuer<K extends IssuedKey>(
  keys: K[],
): { issuer: string; keys: K[] }[] {
  const map = new Map<string, K[]>();
  for (const k of keys) {
    const issuer = normalizeMentorEmail(k.issuedByEmail) || '(unknown issuer)';
    const list = map.get(issuer) || [];
    list.push(k);
    map.set(issuer, list);
  }
  return [...map.entries()]
    .map(([issuer, group]) => ({ issuer, keys: group }))
    .sort((a, b) => a.issuer.localeCompare(b.issuer));
}
