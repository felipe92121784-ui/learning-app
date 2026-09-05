export class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`API request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

function getApiUrl(path: string): string {
  const baseUrl = import.meta.env.VITE_API_URL;

  if (!baseUrl) {
    throw new Error("VITE_API_URL must be configured");
  }

  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

const csrfProtectedMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getXsrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;

  return document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith("XSRF-TOKEN="))
    ?.slice("XSRF-TOKEN=".length);
}

export async function apiClient<T>(
  path: string,
  options: RequestInit = {},
): Promise<T | undefined> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (csrfProtectedMethods.has(options.method?.toUpperCase() ?? "GET")) {
    const xsrfToken = getXsrfToken();
    if (xsrfToken) headers.set("x-xsrf-token", xsrfToken);
  }

  const response = await fetch(getApiUrl(path), {
    ...options,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    throw new ApiError(response.status);
  }

  if (response.status === 204) {
    return undefined;
  }

  return response.json();
}
