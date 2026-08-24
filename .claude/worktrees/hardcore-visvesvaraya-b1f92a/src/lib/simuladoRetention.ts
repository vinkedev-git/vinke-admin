import { adminDb } from "@/lib/firebaseAdmin";
import { dateFromUnknown } from "@/lib/dateValue";

export type SimuladoCleanupOptions = {
  graceDays: number;
  dryRun?: boolean;
  maxUsers?: number;
};

export type SimuladoCleanupSummary = {
  graceDays: number;
  dryRun: boolean;
  cutoffIso: string;
  usersScanned: number;
  usersEligible: number;
  usersAffected: number;
  sessionsDeleted: number;
  attemptsDeleted: number;
  answersDeleted: number;
};

function normalizeGraceDays(value: number) {
  if (!Number.isFinite(value)) return 30;
  return Math.min(365, Math.max(1, Math.floor(value)));
}

function isEligibleForCleanup(
  entitlement: Record<string, unknown> | null,
  cutoffDate: Date
) {
  if (!entitlement) return false;

  const isActive = entitlement.active === true;
  if (isActive) return false;

  const validUntil = dateFromUnknown(entitlement.validUntil);
  if (!validUntil) return false;

  return validUntil.getTime() <= cutoffDate.getTime();
}

async function deleteAnswersCollection(
  ref: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>,
  dryRun: boolean
) {
  const snap = await ref.get();
  const count = snap.size;
  if (!count || dryRun) return count;

  let batch = adminDb.batch();
  let pending = 0;

  for (const docSnap of snap.docs) {
    batch.delete(docSnap.ref);
    pending += 1;
    if (pending >= 400) {
      await batch.commit();
      batch = adminDb.batch();
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }

  return count;
}

export async function runSimuladoRetentionCleanup(
  options: SimuladoCleanupOptions
): Promise<SimuladoCleanupSummary> {
  const graceDays = normalizeGraceDays(options.graceDays);
  const dryRun = options.dryRun !== false;
  const maxUsers =
    options.maxUsers && Number.isFinite(options.maxUsers) && options.maxUsers > 0
      ? Math.floor(options.maxUsers)
      : null;

  const cutoffDate = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

  const usersSnap = await adminDb.collection("users").where("role", "==", "student").get();
  const userDocs = maxUsers ? usersSnap.docs.slice(0, maxUsers) : usersSnap.docs;

  const summary: SimuladoCleanupSummary = {
    graceDays,
    dryRun,
    cutoffIso: cutoffDate.toISOString(),
    usersScanned: userDocs.length,
    usersEligible: 0,
    usersAffected: 0,
    sessionsDeleted: 0,
    attemptsDeleted: 0,
    answersDeleted: 0,
  };

  for (const userDoc of userDocs) {
    const uid = userDoc.id;
    const entitlementSnap = await adminDb.collection("entitlements").doc(uid).get();
    const entitlementData = entitlementSnap.exists
      ? (entitlementSnap.data() as Record<string, unknown>)
      : null;

    const eligible = isEligibleForCleanup(entitlementData, cutoffDate);
    if (!eligible) continue;
    summary.usersEligible += 1;

    const userRef = adminDb.collection("users").doc(uid);
    const [sessionsSnap, attemptsSnap] = await Promise.all([
      userRef.collection("sessions").get(),
      userRef.collection("attempts").get(),
    ]);

    const hasAnyDocs = sessionsSnap.size > 0 || attemptsSnap.size > 0;
    if (!hasAnyDocs) continue;
    summary.usersAffected += 1;

    for (const sessionDoc of sessionsSnap.docs) {
      const answersDeleted = await deleteAnswersCollection(
        sessionDoc.ref.collection("answers"),
        dryRun
      );
      summary.answersDeleted += answersDeleted;
      summary.sessionsDeleted += 1;
      if (!dryRun) await sessionDoc.ref.delete();
    }

    for (const attemptDoc of attemptsSnap.docs) {
      const answersDeleted = await deleteAnswersCollection(
        attemptDoc.ref.collection("answers"),
        dryRun
      );
      summary.answersDeleted += answersDeleted;
      summary.attemptsDeleted += 1;
      if (!dryRun) await attemptDoc.ref.delete();
    }
  }

  return summary;
}
