export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  status: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only present in the create response — not stored. */
  key?: string;
}

export interface CreateApiKeyInput {
  name: string;
  expiresAt?: string;
}
