import { queryClient } from "@/lib/queryClient";

export const ME_KEY = ["/api/auth/me"] as const;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Calls a staff API and returns the parsed JSON (undefined for 204).
 * Throws ApiError carrying the server's error message. A 401 means the
 * session ended, so the portal falls back to the login screen.
 */
export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    // The server only accepts JSON for anything but GET, so always send a body.
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && url !== "/api/auth/login") {
      queryClient.setQueryData(ME_KEY, null);
    }
    throw new ApiError(res.status, data?.error ?? "Something went wrong. Please try again.");
  }
  return data as T;
}
