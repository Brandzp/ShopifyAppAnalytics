export interface ShopifyMoneyV2 {
  amount?: string | null;
  currencyCode?: string | null;
}

export interface ShopifyNodeEdge<T> {
  cursor: string;
  node: T;
}

export interface ShopifyPageInfo {
  hasNextPage: boolean;
  endCursor?: string | null;
}

export interface ShopifyConnection<T> {
  edges: ShopifyNodeEdge<T>[];
  pageInfo: ShopifyPageInfo;
}

export interface ShopifyGraphQLError {
  message: string;
  extensions?: Record<string, unknown>;
}

export interface ShopifyGraphQLResponse<T> {
  data?: T;
  errors?: ShopifyGraphQLError[];
}

export interface ShopifyCredentialInput {
  shopDomain: string;
  adminAccessToken?: string | null;
}
