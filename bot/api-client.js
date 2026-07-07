export class BridgeApiClient {
  /**
   * @param {{ apiBaseUrl: string; apiToken: string }} config
   */
  constructor(config) {
    this.baseUrl = config.apiBaseUrl.replace(/\/$/, "");
    this.apiToken = config.apiToken;
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${this.apiToken}`
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      ...options,
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Non-JSON response (${res.status}): ${text}`);
    }

    if (!res.ok) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }

    return data;
  }

  health() {
    return fetch(`${this.baseUrl}/health`).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return data;
    });
  }

  listPlayers() {
    return this.request("/api/players");
  }

  listCrates() {
    return this.request("/api/crates");
  }

  dropCrates({ target, crateIds, actor, announce }) {
    return this.request("/api/crate/drop", {
      method: "POST",
      body: { target, crateIds, actor, announce }
    });
  }

  sendAlert({ message, scope, actor }) {
    return this.request("/api/alert", {
      method: "POST",
      body: { message, scope, actor }
    });
  }
}
