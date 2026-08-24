import { dateFromUnknown } from "@/lib/dateValue";

export type EntitlementEffectiveStatus = "ativo" | "pendente" | "inativo" | "vencido";

type EntitlementLike = {
  active?: unknown;
  pending?: unknown;
  expired?: unknown;
  validUntil?: unknown;
};

export function getEntitlementValidUntil(entitlement: EntitlementLike | null | undefined) {
  return dateFromUnknown(entitlement?.validUntil ?? null);
}

export function isEntitlementExpired(
  entitlement: EntitlementLike | null | undefined,
  now = new Date()
) {
  const validUntil = getEntitlementValidUntil(entitlement);
  return Boolean(validUntil && validUntil.getTime() < now.getTime());
}

export function getEffectiveEntitlementStatus(
  entitlement: EntitlementLike | null | undefined,
  now = new Date()
): EntitlementEffectiveStatus {
  if (entitlement?.pending === true) return "pendente";
  if (entitlement?.active === true) {
    return isEntitlementExpired(entitlement, now) ? "vencido" : "ativo";
  }
  if (entitlement?.expired === true) return "vencido";
  return "inativo";
}

export function hasActiveEntitlement(
  entitlement: EntitlementLike | null | undefined,
  now = new Date()
) {
  return getEffectiveEntitlementStatus(entitlement, now) === "ativo";
}
