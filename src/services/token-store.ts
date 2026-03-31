/**
 * In-memory token store. Replace with a database (DynamoDB, Redis, etc.)
 * in production.
 */

export interface TokenRecord {
  locationId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  davoxiApiKey?: string;
}

const tokens = new Map<string, TokenRecord>();

export function saveTokens(record: TokenRecord): void {
  tokens.set(record.locationId, record);
}

export function getTokens(locationId: string): TokenRecord | undefined {
  return tokens.get(locationId);
}

export function deleteTokens(locationId: string): void {
  tokens.delete(locationId);
}

export function setDavoxiApiKey(locationId: string, apiKey: string): void {
  const record = tokens.get(locationId);
  if (record) {
    record.davoxiApiKey = apiKey;
    tokens.set(locationId, record);
  }
}
