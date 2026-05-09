export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  environment: string;
  isActive: boolean;
  currentRole?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    apiKeys: number;
    rules: number;
  };
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  environment?: string;
}
