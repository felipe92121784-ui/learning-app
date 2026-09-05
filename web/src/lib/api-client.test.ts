import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiClient } from "./api-client";

describe("apiClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends cookies with every request to the configured API URL", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ready: true }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiClient<{ ready: boolean }>("/health", {
      headers: { Authorization: "Bearer caller-provided-token" },
    });

    expect(response).toEqual({ ready: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/v1/health",
    );
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.credentials).toBe("include");
    expect(new Headers(request?.headers).get("Accept")).toBe(
      "application/json",
    );
    expect(new Headers(request?.headers).get("Authorization")).toBe(
      "Bearer caller-provided-token",
    );
    expect(new Headers(request?.headers).has("x-xsrf-token")).toBe(false);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "sends the XSRF cookie for %s requests",
    async (method) => {
      vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");
      vi.stubGlobal("document", {
        cookie: "theme=dark; XSRF-TOKEN=s%3Aencrypted-xsrf-token; locale=pt-BR",
      });
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 204 }));
      vi.stubGlobal("fetch", fetchMock);

      await apiClient<void>("/courses/7", { method });

      const request = fetchMock.mock.calls[0]?.[1];
      expect(new Headers(request?.headers).get("x-xsrf-token")).toBe(
        "s%3Aencrypted-xsrf-token",
      );
    },
  );

  it("throws ApiError with the HTTP status for a non-success response", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );

    const request = apiClient("/protected");

    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
  });

  it("returns undefined for a successful response with no content", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/api/v1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(
      apiClient<void>("/session", { method: "DELETE" }),
    ).resolves.toBeUndefined();
  });
});
