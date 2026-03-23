const BASE_URL = "https://api.themoviedb.org/3";

export class TmdbClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `TMDb API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<T>;
  }
}
