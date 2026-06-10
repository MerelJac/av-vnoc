import { Agent } from "undici";

export interface LogiSyncClientOptions {
  apiServer: string;
  orgId: string;
  certPem: string;
  keyPem: string;
}

export interface LogiSyncClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

export function createLogiSyncClient(opts: LogiSyncClientOptions): LogiSyncClient {
  const base = `${opts.apiServer.replace(/\/$/, "")}/${opts.orgId}`;
  // mTLS: present the client cert/key on the TLS connection.
  const dispatcher = new Agent({
    connect: { cert: opts.certPem, key: opts.keyPem },
  });

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${base}${path}`;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      // @ts-expect-error undici dispatcher is accepted by Node's fetch
      dispatcher,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Logitech Sync ${method} ${path} failed: ${res.status} ${text.slice(0, 200)}`
      );
    }
    return (await res.json()) as T;
  }

  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  };
}
