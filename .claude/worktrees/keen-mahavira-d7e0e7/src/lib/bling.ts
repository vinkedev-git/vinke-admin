import { adminDb } from "@/lib/firebaseAdmin";

type RecordData = Record<string, unknown>;

export type BlingSettings = {
  enabled: boolean;
  apiBaseUrl: string;
  contactsEndpointPath: string;
  nfseEndpointPath: string;
  serviceCode: string;
  serviceDescription: string;
  serviceNature: string;
  serviceListItem: string;
  cnae: string;
  series: string;
  issRate: number | null;
  defaultComment: string;
  accessToken: string;
  refreshToken: string;
  autoCreateContact: boolean;
  updatedAt?: unknown;
  updatedBy?: string | null;
};

type BlingInvoiceInput = {
  uid: string;
  user: RecordData;
  profile: RecordData;
  entitlement: RecordData;
  invoiceCode: string;
  amountOverride?: number | null;
};

type BlingInvoiceResult = {
  provider: "bling";
  providerId: string | null;
  invoiceNumber: string | null;
  status: string;
  link: string | null;
  total: number | null;
  service: string;
  requestPayload: RecordData;
  rawResponse: unknown;
};

const SETTINGS_DOC = adminDb.collection("system_settings").doc("bling");
const DEFAULT_API_BASE = "https://api.bling.com.br";
const DEFAULT_CONTACTS_PATH = "/Api/v3/contatos";
const DEFAULT_CALLBACK_PATH = "/api/admin/configuracoes/bling/oauth/callback";

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function pickNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", ".").trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function onlyDigits(value: string) {
  return value.replace(/\D+/g, "");
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

const STATE_TO_UF: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toUf(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return STATE_TO_UF[normalizeText(trimmed)] || trimmed.toUpperCase().slice(0, 2);
}

function normalizeBool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePath(value: string, fallback = "") {
  const path = value.trim();
  if (!path) return fallback;
  return path.startsWith("/") ? path : `/${path}`;
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, "")}${normalizePath(path)}`;
}

function requiredEnv(name: string) {
  const value = pickString(process.env[name]);
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function getAddressSource(profile: RecordData, user: RecordData, entitlement: RecordData) {
  const profileAddress =
    typeof profile.address === "object" && profile.address !== null
      ? (profile.address as RecordData)
      : {};
  const userAddress =
    typeof user.address === "object" && user.address !== null
      ? (user.address as RecordData)
      : {};
  const entAddress =
    typeof entitlement.address === "object" && entitlement.address !== null
      ? (entitlement.address as RecordData)
      : {};

  const merged = {
    street:
      pickString(profileAddress.street) ||
      pickString((profile as RecordData).street) ||
      pickString(userAddress.street) ||
      pickString(entAddress.street),
    number:
      pickString(profileAddress.number) ||
      pickString((profile as RecordData).number) ||
      pickString(userAddress.number) ||
      pickString(entAddress.number),
    complement:
      pickString(profileAddress.complement) ||
      pickString((profile as RecordData).complement) ||
      pickString(userAddress.complement) ||
      pickString(entAddress.complement),
    neighborhood:
      pickString(profileAddress.neighborhood) ||
      pickString((profile as RecordData).neighborhood) ||
      pickString(userAddress.neighborhood) ||
      pickString(entAddress.neighborhood),
    city:
      pickString(profileAddress.city) ||
      pickString((profile as RecordData).city) ||
      pickString(userAddress.city) ||
      pickString(entAddress.city),
    state:
      pickString(profileAddress.state) ||
      pickString((profile as RecordData).state) ||
      pickString(userAddress.state) ||
      pickString(entAddress.state),
    zipCode:
      pickString(profileAddress.zipCode) ||
      pickString((profile as RecordData).zipCode) ||
      pickString(userAddress.zipCode) ||
      pickString(entAddress.zipCode),
    country:
      pickString(profileAddress.country) ||
      pickString((profile as RecordData).country) ||
      pickString(userAddress.country) ||
      pickString(entAddress.country) ||
      "Brasil",
  };

  return merged;
}

function ensureRequiredAddress(address: ReturnType<typeof getAddressSource>) {
  if (!address.street || !address.city || !address.state || !address.zipCode) {
    throw new Error(
      "Endereço incompleto para emitir a nota. Preencha rua, cidade, estado e CEP no cadastro do aluno."
    );
  }
}

function validateContactPayload(payload: RecordData) {
  const nome = pickString(payload.nome);
  const tipo = pickString(payload.tipo).toUpperCase();
  const numeroDocumento = onlyDigits(pickString(payload.numeroDocumento));
  const email = pickString(payload.email);
  const endereco = typeof payload.endereco === "object" && payload.endereco !== null
    ? (payload.endereco as RecordData)
    : {};
  const geral =
    typeof endereco.geral === "object" && endereco.geral !== null
      ? (endereco.geral as RecordData)
      : {};
  const cep = onlyDigits(pickString(geral.cep));
  const uf = pickString(geral.uf).toUpperCase();
  const cidade = pickString(geral.municipio);
  const rua = pickString(geral.endereco);

  if (!nome) {
    throw new Error("Contato do Bling sem nome. Preencha o nome do aluno.");
  }

  if (tipo !== "F" && tipo !== "J") {
    throw new Error("Tipo de contato inválido para o Bling. Use pessoa física ou jurídica.");
  }

  if (tipo === "F" && numeroDocumento.length !== 11) {
    throw new Error("CPF inválido para o Bling. O contato precisa de 11 dígitos.");
  }

  if (tipo === "J" && numeroDocumento.length !== 14) {
    throw new Error("CNPJ inválido para o Bling. O contato precisa de 14 dígitos.");
  }

  if (!email && !numeroDocumento) {
    throw new Error("Contato do Bling sem identificador. Informe CPF/CNPJ ou e-mail.");
  }

  if (!rua || !cidade || !uf || cep.length !== 8) {
    throw new Error(
      "Endereço inválido para o contato no Bling. Verifique rua, cidade, UF e CEP com 8 dígitos."
    );
  }
}

async function readSettingsDoc() {
  const snap = await SETTINGS_DOC.get();
  const data = snap.exists ? (snap.data() as RecordData) : {};

  return {
    enabled: normalizeBool(data.enabled, false),
    apiBaseUrl: pickString(data.apiBaseUrl) || DEFAULT_API_BASE,
    contactsEndpointPath:
      normalizePath(pickString(data.contactsEndpointPath), DEFAULT_CONTACTS_PATH) ||
      DEFAULT_CONTACTS_PATH,
    nfseEndpointPath: normalizePath(pickString(data.nfseEndpointPath), ""),
    serviceCode: pickString(data.serviceCode),
    serviceDescription: pickString(data.serviceDescription),
    serviceNature: pickString(data.serviceNature),
    serviceListItem: pickString(data.serviceListItem),
    cnae: pickString(data.cnae),
    series: pickString(data.series),
    issRate: pickNumber(data.issRate),
    defaultComment: pickString(data.defaultComment),
    accessToken: pickString(data.accessToken) || pickString(process.env.BLING_ACCESS_TOKEN),
    refreshToken: pickString(data.refreshToken) || pickString(process.env.BLING_REFRESH_TOKEN),
    autoCreateContact: normalizeBool(data.autoCreateContact, false),
    updatedAt: data.updatedAt ?? null,
    updatedBy: pickString(data.updatedBy) || null,
  } satisfies BlingSettings;
}

export async function getBlingSettingsSummary() {
  const settings = await readSettingsDoc();
  return {
    ...settings,
    accessToken: "",
    refreshToken: "",
    hasAccessToken: Boolean(settings.accessToken),
    hasRefreshToken: Boolean(settings.refreshToken),
    hasClientCredentials: Boolean(
      pickString(process.env.BLING_CLIENT_ID) && pickString(process.env.BLING_CLIENT_SECRET)
    ),
  };
}

export async function updateBlingSettings(
  input: Partial<Omit<BlingSettings, "issRate">> & {
    issRate?: unknown;
    accessToken?: string;
    refreshToken?: string;
  },
  adminUid: string
) {
  const current = await readSettingsDoc();
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);

  const payload: RecordData = {
    enabled: has("enabled") ? normalizeBool(input.enabled, false) : current.enabled,
    apiBaseUrl: has("apiBaseUrl")
      ? pickString(input.apiBaseUrl) || DEFAULT_API_BASE
      : current.apiBaseUrl,
    contactsEndpointPath: has("contactsEndpointPath")
      ? normalizePath(pickString(input.contactsEndpointPath), DEFAULT_CONTACTS_PATH) ||
        DEFAULT_CONTACTS_PATH
      : current.contactsEndpointPath,
    nfseEndpointPath: has("nfseEndpointPath")
      ? normalizePath(pickString(input.nfseEndpointPath), "")
      : current.nfseEndpointPath,
    serviceCode: has("serviceCode") ? pickString(input.serviceCode) : current.serviceCode,
    serviceDescription: has("serviceDescription")
      ? pickString(input.serviceDescription)
      : current.serviceDescription,
    serviceNature: has("serviceNature")
      ? pickString(input.serviceNature)
      : current.serviceNature,
    serviceListItem: has("serviceListItem")
      ? pickString(input.serviceListItem)
      : current.serviceListItem,
    cnae: has("cnae") ? pickString(input.cnae) : current.cnae,
    series: has("series") ? pickString(input.series) : current.series,
    issRate: has("issRate") ? pickNumber(input.issRate) : current.issRate,
    defaultComment: has("defaultComment")
      ? pickString(input.defaultComment)
      : current.defaultComment,
    autoCreateContact: has("autoCreateContact")
      ? normalizeBool(input.autoCreateContact, false)
      : current.autoCreateContact,
    updatedAt: new Date(),
    updatedBy: adminUid,
  };

  const nextAccessToken = pickString(input.accessToken);
  const nextRefreshToken = pickString(input.refreshToken);

  if (nextAccessToken) payload.accessToken = nextAccessToken;
  if (nextRefreshToken) payload.refreshToken = nextRefreshToken;

  await SETTINGS_DOC.set(payload, { merge: true });
}

async function refreshBlingAccessToken(settings: BlingSettings) {
  const clientId = pickString(process.env.BLING_CLIENT_ID);
  const clientSecret = pickString(process.env.BLING_CLIENT_SECRET);

  if (!settings.refreshToken || !clientId || !clientSecret) {
    throw new Error(
      "Acesso ao Bling expirado. Configure BLING_CLIENT_ID/BLING_CLIENT_SECRET e salve um refresh token."
    );
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: settings.refreshToken,
  });

  const res = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "enable-jwt": "1",
    },
    body,
  });

  const data = (await res.json().catch(() => ({}))) as RecordData;

  if (!res.ok) {
    const msg =
      pickString(data.error_description) ||
      pickString(data.error) ||
      extractBlingError(data) ||
      "Falha ao renovar o token do Bling.";
    throw new Error(msg);
  }

  const accessToken = pickString(data.access_token);
  const refreshToken = pickString(data.refresh_token) || settings.refreshToken;

  if (!accessToken) {
    throw new Error("O Bling não retornou um access token válido.");
  }

  await SETTINGS_DOC.set(
    {
      accessToken,
      refreshToken,
      updatedAt: new Date(),
    },
    { merge: true }
  );

  return {
    ...settings,
    accessToken,
    refreshToken,
  };
}

export function resolveBlingRedirectUri(origin: string) {
  const envRedirect = pickString(process.env.BLING_REDIRECT_URI);
  if (envRedirect) return envRedirect;
  return `${origin.replace(/\/+$/, "")}${DEFAULT_CALLBACK_PATH}`;
}

export function buildBlingAuthorizeUrl(origin: string, state: string) {
  const clientId = requiredEnv("BLING_CLIENT_ID");
  const redirectUri = resolveBlingRedirectUri(origin);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  return `https://www.bling.com.br/Api/v3/oauth/authorize?${params.toString()}`;
}

export async function exchangeBlingAuthorizationCode(code: string, origin: string) {
  const clientId = requiredEnv("BLING_CLIENT_ID");
  const clientSecret = requiredEnv("BLING_CLIENT_SECRET");
  const redirectUri = resolveBlingRedirectUri(origin);
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "enable-jwt": "1",
    },
    body,
  });

  const data = (await res.json().catch(() => ({}))) as RecordData;

  if (!res.ok) {
    const msg =
      pickString(data.error_description) || pickString(data.error) || "Falha ao autorizar o app do Bling.";
    throw new Error(msg);
  }

  const accessToken = pickString(data.access_token);
  const refreshToken = pickString(data.refresh_token);

  if (!accessToken || !refreshToken) {
    throw new Error("O Bling não retornou access token e refresh token válidos.");
  }

  return {
    accessToken,
    refreshToken,
    expiresIn: pickNumber(data.expires_in),
    scope: pickString(data.scope),
  };
}

function extractBlingError(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const obj = data as RecordData;
  const nestedError =
    typeof obj.error === "object" && obj.error !== null ? (obj.error as RecordData) : null;
  const nestedData =
    typeof obj.data === "object" && obj.data !== null ? (obj.data as RecordData) : null;
  const nestedErrors =
    typeof obj.errors === "object" && obj.errors !== null ? (obj.errors as RecordData) : null;
  const nestedErros =
    typeof obj.erros === "object" && obj.erros !== null ? (obj.erros as RecordData) : null;

  const flattenItems = (value: unknown): string[] => {
    if (!value) return [];
    if (typeof value === "string") {
      const text = pickString(value);
      return text ? [text] : [];
    }
    if (Array.isArray(value)) {
      return value.flatMap((item) => flattenItems(item));
    }
    if (typeof value === "object") {
      const record = value as RecordData;
      const direct =
        pickString(record.message) ||
        pickString(record.descricao) ||
        pickString(record.description) ||
        pickString(record.erro) ||
        pickString(record.detail) ||
        pickString(record.field);
      const nested = Object.values(record).flatMap((item) => flattenItems(item));
      return [direct, ...nested].filter(Boolean);
    }
    return [];
  };

  const objectSummary = (() => {
    try {
      const slim = JSON.stringify(data);
      return slim.length > 320 ? `${slim.slice(0, 317)}...` : slim;
    } catch {
      return "";
    }
  })();

  const arrayErrors = Array.isArray(obj.errors) ? flattenItems(obj.errors).join(" | ") : "";
  const objectErrors = flattenItems(nestedErrors).join(" | ");
  const objectErros = flattenItems(nestedErros).join(" | ");
  const nestedDataErrors = flattenItems(nestedData?.errors).join(" | ");
  const nestedDataErros = flattenItems(nestedData?.erros).join(" | ");

  const baseMessage =
    pickString(obj.message) ||
    pickString(nestedError?.message) ||
    pickString(nestedError?.description) ||
    (typeof obj.error === "string" ? pickString(obj.error) : "") ||
    pickString(nestedData?.message) ||
    pickString(nestedData?.descricao) ||
    pickString(obj.description) ||
    arrayErrors ||
    objectErrors ||
    objectErros ||
    nestedDataErrors ||
    nestedDataErros;

  const genericMessages = new Set([
    "não foi possível salvar a nota de serviço",
    "o bling recusou a requisição.",
    "bad request",
  ]);
  const normalizedBase = baseMessage.toLowerCase();
  const detailPool = [
    arrayErrors,
    objectErrors,
    objectErros,
    nestedDataErrors,
    nestedDataErros,
  ]
    .filter(Boolean)
    .join(" | ");

  if (baseMessage && !genericMessages.has(normalizedBase)) {
    return baseMessage;
  }

  if (baseMessage && detailPool) {
    return `${baseMessage} | ${detailPool}`;
  }

  return baseMessage || objectSummary;
}

async function blingRequest(
  settings: BlingSettings,
  path: string,
  init: RequestInit
) {
  const attempt = async (token: string) => {
    const res = await fetch(joinUrl(settings.apiBaseUrl, path), {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });

    const rawText = await res.text().catch(() => "");
    let data: unknown = null;

    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = rawText;
      }
    }

    return { res, data, rawText };
  };

  let currentSettings = settings;
  let token = currentSettings.accessToken;

  if (!token) {
    currentSettings = await refreshBlingAccessToken(currentSettings);
    token = currentSettings.accessToken;
  }

  let { res, data, rawText } = await attempt(token);

  if (res.status === 401 && currentSettings.refreshToken) {
    currentSettings = await refreshBlingAccessToken(currentSettings);
    ({ res, data, rawText } = await attempt(currentSettings.accessToken));
  }

  if (!res.ok) {
    const baseMsg = extractBlingError(data) || "";
    const genericMessages = new Set([
      "",
      "Não foi possível salvar a nota de serviço",
      "O Bling recusou a requisição.",
    ]);
    const textFallback =
      typeof data === "string"
        ? pickString(data)
        : pickString(rawText)
            .replace(/\s+/g, " ")
            .trim();
    const detail =
      textFallback &&
      !genericMessages.has(textFallback) &&
      textFallback.toLowerCase() !== String(baseMsg).toLowerCase()
        ? textFallback
        : "";
    const msg =
      baseMsg && !genericMessages.has(baseMsg)
        ? baseMsg
        : detail
          ? `${baseMsg || "O Bling recusou a requisição."} | ${detail}`
          : `${baseMsg || "O Bling recusou a requisição."} (HTTP ${res.status})`;
    throw new Error(msg);
  }

  return data;
}

async function syncBlingContactBestEffort(
  settings: BlingSettings,
  path: string,
  payload: RecordData
) {
  try {
    await blingRequest(settings, path, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Não bloqueia a emissão da nota se o sync de contato falhar.
  }
}

function buildContactPayload(
  input: BlingInvoiceInput,
  address: ReturnType<typeof getAddressSource>
) {
  const customerName =
    pickString(input.profile.name) ||
    pickString(input.user.name) ||
    pickString(input.entitlement.name) ||
    "Aluno";
  const document =
    pickString(input.profile.document) ||
    pickString(input.user.document) ||
    pickString(input.entitlement.document);
  const numericDocument = onlyDigits(document);
  const email = pickString(input.user.email) || pickString(input.entitlement.email);
  const type = numericDocument.length > 11 ? "J" : "F";
  const uf = toUf(address.state);

  ensureRequiredAddress(address);

  const payload = {
    nome: customerName,
    codigo: input.uid,
    situacao: "A",
    tipo: type,
    email,
    emailNotaFiscal: email || undefined,
    numeroDocumento: numericDocument || undefined,
    telefone:
      pickString(input.profile.phone) ||
      pickString(input.profile.cellphone) ||
      pickString(input.user.phone),
    celular:
      pickString(input.profile.cellphone) ||
      pickString(input.profile.phone) ||
      pickString(input.user.phone),
    indicadorIe: 9,
    endereco: {
      geral: {
        endereco: address.street,
        numero: address.number || "S/N",
        complemento: address.complement,
        bairro: address.neighborhood,
        municipio: address.city,
        uf,
        cep: onlyDigits(address.zipCode),
      },
    },
    pais: address.country ? { nome: address.country } : undefined,
  };

  validateContactPayload(payload);
  return payload;
}

async function findOrCreateBlingContact(
  settings: BlingSettings,
  input: BlingInvoiceInput,
  address: ReturnType<typeof getAddressSource>
) {
  if (!settings.contactsEndpointPath) {
    throw new Error("Configure o endpoint de contatos do Bling em Configurações.");
  }

  const document =
    pickString(input.profile.document) ||
    pickString(input.user.document) ||
    pickString(input.entitlement.document);
  const email = pickString(input.user.email) || pickString(input.entitlement.email);
  const contactPayload = buildContactPayload(input, address);

  const numericDocument = onlyDigits(document);

  if (numericDocument && numericDocument.length !== 11 && numericDocument.length !== 14) {
    throw new Error(
      "CPF/CNPJ inválido para emissão no Bling. Use 11 dígitos (CPF) ou 14 dígitos (CNPJ)."
    );
  }

  if (!numericDocument && !email && !pickString(input.uid)) {
    throw new Error("Dados insuficientes para localizar o contato no Bling.");
  }

  const lookupFirst = async (params: URLSearchParams) => {
    const path = `${settings.contactsEndpointPath}?${params.toString()}`;
    const lookup = (await blingRequest(settings, path, { method: "GET" })) as RecordData;
    return Array.isArray(lookup.data) ? (lookup.data[0] as RecordData | undefined) : undefined;
  };

  const findExistingContact = async () => {
    if (numericDocument) {
      const byDocument = await lookupFirst(new URLSearchParams({ numeroDocumento: numericDocument }));
      if (byDocument) return byDocument;
    }
    if (email) {
      const byEmail = await lookupFirst(new URLSearchParams({ pesquisa: email }));
      if (byEmail) return byEmail;
    }
    const uid = pickString(input.uid);
    if (uid) {
      const byUid = await lookupFirst(new URLSearchParams({ pesquisa: uid }));
      if (byUid) return byUid;
    }
    return undefined;
  };

  const existing = await findExistingContact();
  const existingId = existing ? Number(existing.id) : NaN;

  if (Number.isFinite(existingId) && existingId > 0) {
    const existingContact = existing as RecordData;

    if (settings.autoCreateContact) {
      await syncBlingContactBestEffort(
        settings,
        `${settings.contactsEndpointPath}/${existingId}`,
        contactPayload
      );
    }

    return {
      id: existingId,
      nome: pickString(existingContact.nome) || pickString(contactPayload.nome),
      numeroDocumento: numericDocument || pickString(existingContact.numeroDocumento),
      email: email || pickString(existingContact.email),
      payload: contactPayload,
    };
  }

  const createContact = async (payload: RecordData) => {
    return (await blingRequest(settings, settings.contactsEndpointPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })) as RecordData;
  };

  let created: RecordData;
  try {
    created = await createContact(contactPayload);
  } catch {
    // Alguns ambientes do Bling retornam erro genérico quando o "codigo" já existe.
    // Retry sem "codigo" e fallback para lookup para reduzir falso-negativos.
    const retryPayload: RecordData = { ...contactPayload };
    delete retryPayload.codigo;

    try {
      created = await createContact(retryPayload);
    } catch (retryError) {
      const recovered = await findExistingContact();
      const recoveredId = recovered ? Number(recovered.id) : NaN;
      if (Number.isFinite(recoveredId) && recoveredId > 0) {
        return {
          id: recoveredId,
          nome: pickString(recovered?.nome) || pickString(contactPayload.nome),
          numeroDocumento: numericDocument || pickString(recovered?.numeroDocumento),
          email: email || pickString(recovered?.email),
          payload: contactPayload,
        };
      }

      const message = retryError instanceof Error ? retryError.message : "Não foi possível salvar o contato";
      throw new Error(`Não foi possível salvar o contato no Bling. ${message}`);
    }
  }

  const createdData =
    typeof created.data === "object" && created.data !== null ? (created.data as RecordData) : created;
  const createdId = Number(createdData.id);

  if (!Number.isFinite(createdId) || createdId <= 0) {
    throw new Error("O Bling não retornou um ID válido para o contato.");
  }

  return {
    id: createdId,
    nome: pickString(contactPayload.nome),
    numeroDocumento: numericDocument,
    email,
    payload: contactPayload,
  };
}

function buildInvoicePayload(
  settings: BlingSettings,
  input: BlingInvoiceInput,
  address: ReturnType<typeof getAddressSource>,
  contact: {
    id: number;
    nome: string;
    numeroDocumento: string;
    email: string;
  }
) {
  const total = input.amountOverride ?? pickNumber(input.entitlement.amountPaid);
  const serviceTitle =
    settings.serviceDescription ||
    pickString(input.entitlement.productTitle) ||
    "Assinatura da plataforma";
  const customerName =
    contact.nome ||
    pickString(input.profile.name) ||
    pickString(input.user.name) ||
    pickString(input.entitlement.name) ||
    "Aluno";
  const document = contact.numeroDocumento;

  if (!customerName || !document || total == null) {
    throw new Error(
      "Dados insuficientes para emitir a nota. Verifique nome, documento e valor da fatura."
    );
  }

  if (total <= 0) {
    throw new Error("Informe um valor maior que zero para emitir a nota no Bling.");
  }

  if (!settings.series) {
    throw new Error("Preencha a série da NFS-e em Configurações antes de emitir.");
  }

  ensureRequiredAddress(address);

  const numeroRPS = onlyDigits(input.invoiceCode).slice(0, 20) || String(Date.now()).slice(-12);
  const uf = toUf(address.state);

  return {
    numeroRPS,
    serie: settings.series,
    contato: {
      id: contact.id,
      nome: customerName,
      email: contact.email,
      numeroDocumento: document,
      telefone:
        pickString(input.profile.phone) ||
        pickString(input.profile.cellphone) ||
        pickString(input.user.phone),
      ie: undefined,
      im: undefined,
      endereco: {
        endereco: address.street,
        numero: address.number || undefined,
        complemento: address.complement,
        bairro: address.neighborhood,
        municipio: address.city,
        uf,
        cep: address.zipCode,
      },
    },
    data: formatDateOnly(new Date()),
    dataEmissao: formatDateOnly(new Date()),
    baseCalculo: total,
    reterISS: false,
    servicos: [
      {
        codigo: settings.serviceCode || settings.serviceListItem || "1",
        descricao: serviceTitle,
        valor: total,
      },
    ],
  };
}

function extractInvoiceMeta(data: unknown, total: number | null, fallbackService: string) {
  if (!data || typeof data !== "object") {
    return {
      providerId: null,
      invoiceNumber: null,
      status: "emitida",
      link: null,
      total,
      service: fallbackService,
      rawResponse: data,
    };
  }

  const obj = data as RecordData;
  const nested =
    (typeof obj.data === "object" && obj.data !== null ? (obj.data as RecordData) : null) ||
    (typeof obj.retorno === "object" && obj.retorno !== null ? (obj.retorno as RecordData) : null) ||
    obj;

  const providerId =
    pickString(nested.id) ||
    pickString(nested.codigo) ||
    pickString(nested.numeroRecibo) ||
    null;
  const invoiceNumber =
    pickString(nested.numero) ||
    pickString(nested.numeroNota) ||
    pickString(nested.numeroDocumento) ||
    providerId;
  const status =
    pickString(nested.status) || pickString(nested.situacao) || "emitida";
  const link =
    pickString(nested.link) || pickString(nested.url) || pickString(nested.linkPDF) || null;

  return {
    providerId,
    invoiceNumber,
    status,
    link,
    total,
    service: fallbackService,
    rawResponse: data,
  };
}

export async function generateBlingServiceInvoice(
  input: BlingInvoiceInput
): Promise<BlingInvoiceResult> {
  const settings = await readSettingsDoc();

  if (!settings.enabled) {
    throw new Error("A integração com o Bling está desativada em Configurações.");
  }

  if (!settings.nfseEndpointPath) {
    throw new Error(
      "Configure o endpoint de NFS-e do Bling em Configurações antes de gerar a nota."
    );
  }

  const address = getAddressSource(input.profile, input.user, input.entitlement);
  const contact = await findOrCreateBlingContact(settings, input, address);
  const requestPayload = buildInvoicePayload(settings, input, address, contact);
  const rawResponse = await blingRequest(settings, settings.nfseEndpointPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestPayload),
  });

  const total = input.amountOverride ?? pickNumber(input.entitlement.amountPaid);
  const service = settings.serviceDescription || pickString(input.entitlement.productTitle) || "Assinatura";
  const meta = extractInvoiceMeta(rawResponse, total, service);

  return {
    provider: "bling",
    ...meta,
    requestPayload,
  };
}
