export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${url} failed: ${res.status} ${body}`);
  }
  return (await res.json()) as T;
}

export async function getText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${url} failed: ${res.status} ${body}`);
  }
  return await res.text();
}

export async function postJson<T>(
  url: string,
  body: unknown,
  init?: RequestInit
): Promise<T> {
  const method = init?.method || "POST";
  const res = await fetch(url, {
    ...init,
    method,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {})
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${method} ${url} failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as T;
}
