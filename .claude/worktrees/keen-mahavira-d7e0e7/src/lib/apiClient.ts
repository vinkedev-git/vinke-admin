import { auth } from "@/lib/firebase";

async function getToken(): Promise<string> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sessão inválida. Faça login novamente.");
  return token;
}

type ApiResponse<T> = T & { ok: boolean; error?: string };

async function request<T>(
  path: string,
  options: RequestInit = {},
  jsonBody = true
): Promise<ApiResponse<T>> {
  const token = await getToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string>),
  };

  if (jsonBody) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, { ...options, headers });
  const data = (await res.json()) as ApiResponse<T>;

  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Erro ${res.status}`);
  }

  return data;
}

export const api = {
  get<T>(path: string) {
    return request<T>(path);
  },
  post<T>(path: string, body: unknown) {
    return request<T>(path, { method: "POST", body: JSON.stringify(body) });
  },
  patch<T>(path: string, body: unknown) {
    return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
  },
  delete<T>(path: string) {
    return request<T>(path, { method: "DELETE" });
  },
  upload<T>(path: string, formData: FormData) {
    return request<T>(path, { method: "POST", body: formData }, false);
  },
};
