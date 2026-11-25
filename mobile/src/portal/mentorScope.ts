/**
 * Per-mentor catalog isolation helpers for the Mentors Portal.
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
 * Super admin sees everything (including legacy unowned rows).
 * Mentors only see EAs they own and keys they issued (or keys under their EAs).
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
  if (!actor || isSuperAdminEmail(actor)) {
    return { eas, keys };
  }

  const myEas = eas.filter(
    (e) => normalizeMentorEmail(e.ownerEmail) === actor,
  );
  const myEaIds = new Set(myEas.map((e) => e.id));
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
  if (isSuperAdminEmail(actor)) return true;
  if (!ea) return true; // new create — stamp ownership on write
  const owner = normalizeMentorEmail(ea.ownerEmail);
  // Legacy unowned rows: mentors must not claim/edit; admin only.
  if (!owner) return false;
  return owner === actor;
}

/** True when this actor may generate/list a key for the EA. */
export function canUseEaForKeys(
  ea: OwnedEa | null | undefined,
  actorEmail: string | null | undefined,
): boolean {
  return canManageEa(ea, actorEmail);
}
