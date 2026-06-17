/**
 * Minimal in-memory Redis shim for validate / DRY_RUN when no server is available.
 * Supports only commands used by this bot's queue layer.
 */
type Entry = { value: string; expiresAt?: number };

export class MemoryRedis {
  status: "wait" | "ready" = "wait";
  private store = new Map<string, Entry>();
  private lists = new Map<string, string[]>();

  async connect(): Promise<void> {
    this.status = "ready";
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  async quit(): Promise<string> {
    this.status = "wait";
    return "OK";
  }

  on(_event: string, _handler: (err: Error) => void): this {
    return this;
  }

  private purgeExpired(key: string): void {
    const entry = this.store.get(key);
    if (entry?.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
    }
  }

  async set(
    key: string,
    value: string,
    mode?: string,
    ttl?: number,
    nx?: string
  ): Promise<string | null> {
    this.purgeExpired(key);
    if (mode === "EX" && nx === "NX") {
      if (this.store.has(key)) return null;
      this.store.set(key, {
        value,
        expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
      });
      return "OK";
    }
    this.store.set(key, { value });
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    this.purgeExpired(key);
    return this.store.get(key)?.value ?? null;
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      if (this.store.delete(k) || this.lists.delete(k)) n++;
    }
    return n;
  }

  async lpush(key: string, value: string): Promise<number> {
    const list = this.lists.get(key) ?? [];
    list.unshift(value);
    this.lists.set(key, list);
    return list.length;
  }

  async llen(key: string): Promise<number> {
    return (this.lists.get(key) ?? []).length;
  }

  async brpop(key: string, timeoutSec: number): Promise<[string, string] | null> {
    const deadline = Date.now() + timeoutSec * 1000;
    while (Date.now() < deadline) {
      const list = this.lists.get(key) ?? [];
      if (list.length > 0) {
        const value = list.pop()!;
        this.lists.set(key, list);
        return [key, value];
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }

  async incr(key: string): Promise<number> {
    const current = Number((await this.get(key)) ?? "0");
    const next = current + 1;
    await this.set(key, String(next));
    return next;
  }
}
