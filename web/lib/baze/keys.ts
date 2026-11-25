import { envList } from "../config";

export type NamedKey = { name: string; key: string };

/** Ordered BAZE keys. A key marked exhausted is skipped until the process restarts. */
export class KeyPool {
  private exhausted = new Set<string>();
  constructor(private keys: NamedKey[]) {}

  static fromEnv(): KeyPool {
    return new KeyPool(envList("BAZE_API_KEYS").map((key, i) => ({ name: `key${i + 1}`, key })));
  }

  all(): NamedKey[] {
    return [...this.keys];
  }

  current(): NamedKey | null {
    return this.keys.find((k) => !this.exhausted.has(k.name)) ?? null;
  }

  markExhausted(name: string): void {
    this.exhausted.add(name);
  }
}
