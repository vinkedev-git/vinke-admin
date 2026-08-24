export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { secondsFromUnknown } from "@/lib/dateValue";
import { requireAdmin } from "@/lib/adminRoute";

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeBody(body: unknown) {
  const payload = (body ?? {}) as Record<string, unknown>;
  const profile = (payload.profile ?? {}) as Record<string, unknown>;
  const address = (profile.address ?? {}) as Record<string, unknown>;

  return {
    email: pickString(payload.email).toLowerCase(),
    password: pickString(payload.password),
    active: payload.active === true,
    profile: {
      name: pickString(profile.name),
      document: pickString(profile.document),
      phone: pickString(profile.phone),
      cellphone: pickString(profile.cellphone),
      address: {
        street: pickString(address.street),
        number: pickString(address.number),
        neighborhood: pickString(address.neighborhood),
        complement: pickString(address.complement),
        zipCode: pickString(address.zipCode),
        city: pickString(address.city),
        state: pickString(address.state),
      },
    },
  };
}

function formatDate(value: unknown) {
  const seconds = secondsFromUnknown(value);
  if (!seconds) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(seconds * 1000));
}

export async function GET(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const snap = await adminDb.collection("users").where("role", "==", "student").get();

    const rawRows = await Promise.all(
      snap.docs.map(async (userDoc) => {
        const [profileSnap, entitlementSnap] = await Promise.all([
          userDoc.ref.collection("profile").doc("main").get(),
          adminDb.collection("entitlements").doc(userDoc.id).get(),
        ]);

        const userData = userDoc.data();
        const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
        const entitlement = entitlementSnap.exists ? entitlementSnap.data() ?? {} : {};

        return {
          uid: userDoc.id,
          createdAt: formatDate(userData.createdAt ?? userData.updatedAt),
          name:
            String(profile.name ?? "").trim() ||
            String(userData.name ?? "").trim() ||
            "Aluno sem nome",
          cpf: String(profile.document ?? "").trim() || "—",
          cellphone:
            String(profile.phone ?? profile.cellphone ?? "").trim() || "—",
          email:
            String(userData.email ?? entitlement.email ?? "").trim() || "—",
          active: entitlement.active === true,
          sortSeconds:
            secondsFromUnknown(userData.createdAt) || secondsFromUnknown(userData.updatedAt),
        };
      })
    );

    const items = rawRows
      .sort((a, b) => b.sortSeconds - a.sortSeconds)
      .map((item, index) => ({
        uid: item.uid,
        code: String(rawRows.length - index),
        createdAt: item.createdAt,
        name: item.name,
        cpf: item.cpf,
        cellphone: item.cellphone,
        email: item.email,
        active: item.active,
      }));

    return NextResponse.json({ ok: true, items }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar alunos.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authCheck = await requireAdmin(req);
  if ("error" in authCheck) return authCheck.error;

  try {
    const raw = await req.json();
    const payload = sanitizeBody(raw);

    if (!payload.email) {
      return NextResponse.json({ ok: false, error: "E-mail é obrigatório." }, { status: 400 });
    }

    if (!payload.password || payload.password.length < 6) {
      return NextResponse.json(
        { ok: false, error: "Senha é obrigatória e precisa ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    if (!payload.profile.name) {
      return NextResponse.json({ ok: false, error: "Nome é obrigatório." }, { status: 400 });
    }

    const existingMethods = await adminAuth
      .getUserByEmail(payload.email)
      .then((user) => user)
      .catch(() => null);

    if (existingMethods) {
      return NextResponse.json(
        { ok: false, error: "Já existe um usuário com esse e-mail." },
        { status: 409 }
      );
    }

    const created = await adminAuth.createUser({
      email: payload.email,
      password: payload.password,
      emailVerified: true,
      displayName: payload.profile.name,
    });

    const now = new Date();

    await adminDb.collection("users").doc(created.uid).set(
      {
        uid: created.uid,
        email: payload.email,
        role: "student",
        name: payload.profile.name,
        source: "admin",
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    await adminDb
      .collection("users")
      .doc(created.uid)
      .collection("profile")
      .doc("main")
      .set(
        {
          name: payload.profile.name,
          document: payload.profile.document || null,
          phone: payload.profile.phone || null,
          cellphone: payload.profile.cellphone || null,
          address: {
            street: payload.profile.address.street || null,
            number: payload.profile.address.number || null,
            neighborhood: payload.profile.address.neighborhood || null,
            complement: payload.profile.address.complement || null,
            zipCode: payload.profile.address.zipCode || null,
            city: payload.profile.address.city || null,
            state: payload.profile.address.state || null,
          },
          source: "admin",
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

    await adminDb.collection("entitlements").doc(created.uid).set(
      {
        uid: created.uid,
        email: payload.email,
        active: payload.active,
        pending: !payload.active,
        source: "admin",
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, uid: created.uid }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar aluno.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
