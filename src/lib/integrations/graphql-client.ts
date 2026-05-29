export class GraphQLClientError extends Error {
  constructor(
    message: string,
    public readonly errors: Array<{ message: string }>
  ) {
    super(message);
    this.name = "GraphQLClientError";
  }
}

interface GraphQLRequest {
  endpoint: string;
  token: string;
  query: string;
  variables?: Record<string, unknown>;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function executeGraphQL<T>({
  endpoint,
  token,
  query,
  variables,
}: GraphQLRequest): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL HTTP error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;

  if (json.errors && json.errors.length > 0) {
    const message = json.errors.map((e) => e.message).join("; ");
    throw new GraphQLClientError(`GraphQL errors: ${message}`, json.errors);
  }

  if (json.data === undefined) {
    throw new Error("GraphQL response missing data field");
  }

  return json.data;
}
