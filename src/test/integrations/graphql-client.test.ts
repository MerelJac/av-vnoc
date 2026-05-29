import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeGraphQL, GraphQLClientError } from "@/lib/integrations/graphql-client";

const ENDPOINT = "https://api.silica-prod01.io.lens.poly.com/graphql";
const TOKEN = "test-token";

describe("executeGraphQL", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends POST with correct headers and body", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { result: 42 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    const query = "query { result }";
    await executeGraphQL<{ result: number }>({ endpoint: ENDPOINT, token: TOKEN, query });

    expect(mockFetch).toHaveBeenCalledWith(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ query, variables: undefined }),
    });
  });

  it("returns parsed data on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { foo: "bar" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );

    const result = await executeGraphQL<{ foo: string }>({
      endpoint: ENDPOINT,
      token: TOKEN,
      query: "query { foo }",
    });

    expect(result).toEqual({ foo: "bar" });
  });

  it("throws GraphQLClientError when response contains errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({ errors: [{ message: "Field not found" }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    await expect(
      executeGraphQL({ endpoint: ENDPOINT, token: TOKEN, query: "query { bad }" })
    ).rejects.toThrow(GraphQLClientError);
  });

  it("throws when HTTP status is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 })
      )
    );

    await expect(
      executeGraphQL({ endpoint: ENDPOINT, token: TOKEN, query: "query { x }" })
    ).rejects.toThrow("GraphQL HTTP error: 401");
  });
});
