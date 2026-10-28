export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch("/api" + path, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (r.status === 401 && !path.startsWith("/auth/login")) {
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "Session expired");
  }
  if (!r.ok) {
    const e = await r.json().catch(() => ({ detail: r.statusText }));
    const d = e.detail;
    const msg = typeof d === "string" ? d : Array.isArray(d) ? d.map((x: any) => `${(x.loc || []).slice(1).join(".")}: ${x.msg}`).join("; ") : "Request failed";
    throw new ApiError(r.status, msg);
  }
  return (r.status === 204 ? undefined : await r.json()) as T;
}
