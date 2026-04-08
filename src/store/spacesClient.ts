/**
 * Client for reading/writing JSON via DigitalOcean Functions.
 *
 * The functions handle Spaces credentials server-side, so the browser
 * never needs access keys.
 */

const READ_URL =
  import.meta.env.VITE_FUNCTIONS_READ_URL ??
  "https://faas-sfo3-7872a1dd.doserverless.co/api/v1/web/fn-a2c9ce36-7181-4e9b-b1ac-09b78f7b904f/default/riboflavin_read";

const WRITE_URL =
  import.meta.env.VITE_FUNCTIONS_WRITE_URL ??
  "https://faas-sfo3-7872a1dd.doserverless.co/api/v1/web/fn-a2c9ce36-7181-4e9b-b1ac-09b78f7b904f/default/riboflavin_write";

// ── Read / write helpers ────────────────────────────────────────────────────

export async function putJSON(key: string, body: unknown): Promise<void> {
  const res = await fetch(WRITE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Write failed");
  }
}

export async function getJSON<T = unknown>(key: string): Promise<T | null> {
  const res = await fetch(`${READ_URL}?key=${encodeURIComponent(key)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Read failed");
  }
  return (await res.json()) as T;
}
