/**
 * In-memory stand-in for PrismaService.
 *
 * WHY THIS EXISTS, AND WHAT IT DOES NOT DO
 *
 * Redis is real in this suite — mocking it would erase the TTL and atomicity
 * behaviour we are trying to record. Postgres is different: the only database
 * this repository is configured against is a hosted Neon instance, and writing
 * characterization fixtures into it is not acceptable. So Postgres is replaced
 * and Redis is not.
 *
 * The consequence is explicit: these tests characterize the HTTP contract, the
 * validation pipeline, the guard/RBAC behaviour and every Redis interaction.
 * They do NOT characterize Postgres-side behaviour — column types, defaults,
 * cascade deletes, unique-constraint errors or date serialisation coming back
 * out of the driver. Anything in that category needs a Postgres testcontainer
 * (blocked here: the Docker engine is not running on this machine).
 *
 * Every method implemented below mirrors exactly one call site in `src/`.
 * Unrecognised query shapes throw instead of returning a plausible-looking
 * value, so the double can never quietly invent behaviour the real client
 * would not have produced.
 */

import { randomUUID } from 'crypto';

type Row = Record<string, any>;

function unsupported(model: string, method: string, args: unknown): never {
  throw new Error(
    `FakePrisma: unsupported ${model}.${method}() query shape — ` +
      `${JSON.stringify(args)}. Add it deliberately rather than letting the ` +
      `double guess.`,
  );
}

function applySelect(row: Row | null, select?: Record<string, boolean>): Row | null {
  if (!row || !select) return row;
  const out: Row = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key] = row[key];
  }
  return out;
}

/**
 * Prisma treats an `undefined` field as "not supplied" and leaves the column
 * alone; a spread would let it clobber a default with `undefined`, which then
 * disappears during JSON serialisation. Strip them so the double matches the
 * real client's semantics.
 */
function defined(data: Row = {}): Row {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}

function compare(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function sortRows(rows: Row[], orderBy?: Row | Row[]): Row[] {
  if (!orderBy) return rows;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((left, right) => {
    for (const clause of clauses) {
      const [field, direction] = Object.entries(clause)[0] as [string, string];
      const result = compare(left[field], right[field]);
      if (result !== 0) return direction === 'desc' ? -result : result;
    }
    return 0;
  });
}

export class FakePrisma {
  readonly users: Row[] = [];
  readonly apiKeys: Row[] = [];
  readonly rules: Row[] = [];
  readonly members: Row[] = [];
  readonly projects: Row[] = [];
  readonly requestLogs: Row[] = [];
  readonly auditLogs: Row[] = [];
  readonly webhookEndpoints: Row[] = [];

  reset(): void {
    this.users.length = 0;
    this.apiKeys.length = 0;
    this.rules.length = 0;
    this.members.length = 0;
    this.projects.length = 0;
    this.requestLogs.length = 0;
    this.auditLogs.length = 0;
    this.webhookEndpoints.length = 0;
  }

  /* ---- PrismaClient lifecycle surface used by Nest ---- */
  async onModuleInit(): Promise<void> {}
  async onModuleDestroy(): Promise<void> {}
  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}
  $on(): void {}

  /* ---- users ----
   *
   * Added so the auth surface can be characterized at all. Without it, every
   * flow that touches a user (login, register, the password reset) was
   * untestable, which is how a reset-code brute force and an unaudited login
   * failure path both stayed invisible behind a green suite.
   *
   * Mirrors the four call sites in UsersService: create, findUnique by email,
   * findUnique by id, and update by email.
   */
  user = {
    create: async (args: Row): Promise<Row> => {
      const now = new Date();
      const row: Row = {
        id: randomUUID(),
        tier: 'FREE',
        isActive: true,
        ...defined(args.data),
        // The service lowercases on read, so store it lowercased on write or
        // findUnique never matches what create just inserted.
        email: String(args?.data?.email ?? '').toLowerCase(),
        createdAt: now,
        updatedAt: now,
      };
      this.users.push(row);
      return row;
    },

    findUnique: async (args: Row): Promise<Row | null> => {
      const where = args?.where ?? {};

      if (typeof where.email === 'string') {
        const email = where.email.toLowerCase();
        return this.users.find((row) => row.email === email) ?? null;
      }

      if (typeof where.id === 'string') {
        return this.users.find((row) => row.id === where.id) ?? null;
      }

      return unsupported('user', 'findUnique', args);
    },

    update: async (args: Row): Promise<Row> => {
      const email = String(args?.where?.email ?? '').toLowerCase();
      const row = this.users.find((candidate) => candidate.email === email);
      if (!row) unsupported('user', 'update', args);
      Object.assign(row, defined(args.data), { updatedAt: new Date() });
      return row;
    },
  };

  /* ---- api_keys ---- */
  apiKey = {
    findUnique: async (args: Row): Promise<Row | null> => {
      const hashedKey = args?.where?.hashedKey;
      if (typeof hashedKey !== 'string') unsupported('apiKey', 'findUnique', args);
      const found = this.apiKeys.find((row) => row.hashedKey === hashedKey) ?? null;
      return applySelect(found, args.select);
    },

    findFirst: async (args: Row): Promise<Row | null> => {
      const { id, projectId } = args?.where ?? {};
      if (typeof id !== 'string') unsupported('apiKey', 'findFirst', args);
      const found =
        this.apiKeys.find(
          (row) =>
            row.id === id && (projectId === undefined || row.projectId === projectId),
        ) ?? null;
      return applySelect(found, args.select);
    },

    findMany: async (args: Row = {}): Promise<Row[]> => {
      const where = args.where ?? {};
      const matched = this.apiKeys.filter(
        (row) => where.projectId === undefined || row.projectId === where.projectId,
      );
      // Sort on whole rows (orderBy may name a column `select` drops), then
      // project. The real client honours `select` here and the double did not,
      // which would have let a column leak through the list unnoticed.
      return sortRows(matched, args.orderBy).map(
        (row) => applySelect(row, args.select) as Row,
      );
    },

    create: async (args: Row): Promise<Row> => {
      const now = new Date();
      const row: Row = {
        id: randomUUID(),
        status: 'ACTIVE',
        lastUsedAt: null,
        expiresAt: null,
        hashVersion: 'hmac-sha256-v1',
        ...defined(args.data),
        createdAt: now,
        updatedAt: now,
      };
      this.apiKeys.push(row);
      return row;
    },

    update: async (args: Row): Promise<Row> => {
      const id = args?.where?.id;
      const row = this.apiKeys.find((candidate) => candidate.id === id);
      if (!row) unsupported('apiKey', 'update', args);
      Object.assign(row, defined(args.data), { updatedAt: new Date() });
      return row;
    },
  };

  /* ---- rate_limit_rules ---- */
  rateLimitRule = {
    findMany: async (args: Row = {}): Promise<Row[]> => {
      const where = args.where ?? {};
      const matched = this.rules.filter(
        (row) =>
          (where.projectId === undefined || row.projectId === where.projectId) &&
          (where.isActive === undefined || row.isActive === where.isActive),
      );
      return sortRows(matched, args.orderBy);
    },

    findFirst: async (args: Row): Promise<Row | null> => {
      const { id, projectId } = args?.where ?? {};
      return (
        this.rules.find(
          (row) =>
            row.id === id && (projectId === undefined || row.projectId === projectId),
        ) ?? null
      );
    },

    create: async (args: Row): Promise<Row> => {
      const now = new Date();
      const row: Row = {
        id: randomUUID(),
        description: null,
        targetValue: null,
        endpointPattern: null,
        method: null,
        userTier: null,
        burstCapacity: null,
        isActive: true,
        ...defined(args.data),
        createdAt: now,
        updatedAt: now,
      };
      this.rules.push(row);
      return row;
    },

    update: async (args: Row): Promise<Row> => {
      const row = this.rules.find((candidate) => candidate.id === args?.where?.id);
      if (!row) unsupported('rateLimitRule', 'update', args);
      Object.assign(row, defined(args.data), { updatedAt: new Date() });
      return row;
    },

    delete: async (args: Row): Promise<Row> => {
      const index = this.rules.findIndex(
        (candidate) => candidate.id === args?.where?.id,
      );
      if (index === -1) unsupported('rateLimitRule', 'delete', args);
      return this.rules.splice(index, 1)[0];
    },
  };

  /* ---- project_members ---- */
  projectMember = {
    findUnique: async (args: Row): Promise<Row | null> => {
      const composite = args?.where?.projectId_userId;
      if (!composite) unsupported('projectMember', 'findUnique', args);
      const found =
        this.members.find(
          (row) =>
            row.projectId === composite.projectId && row.userId === composite.userId,
        ) ?? null;
      return applySelect(found, args.select);
    },
  };

  /* ---- projects ---- */
  project = {
    findUnique: async (args: Row): Promise<Row | null> => {
      const found = this.projects.find((row) => row.id === args?.where?.id) ?? null;
      return applySelect(found, args.select);
    },
  };

  /* ---- request_logs ---- */
  requestLog = {
    create: async (args: Row): Promise<Row> => {
      const row: Row = {
        id: randomUUID(),
        createdAt: new Date(),
        ...defined(args.data),
      };
      this.requestLogs.push(row);
      return row;
    },

    count: async (args: Row = {}): Promise<number> => {
      const where = args.where ?? {};
      return this.requestLogs.filter((row) => {
        if (where.projectId !== undefined && row.projectId !== where.projectId) {
          return false;
        }
        if (where.decision !== undefined && row.decision !== where.decision) {
          return false;
        }
        if (where.createdAt?.gte && row.createdAt < where.createdAt.gte) {
          return false;
        }
        return true;
      }).length;
    },
  };

  /* ---- audit_logs ---- */
  auditLog = {
    create: async (args: Row): Promise<Row> => {
      const row: Row = {
        id: randomUUID(),
        createdAt: new Date(),
        ...defined(args.data),
      };
      this.auditLogs.push(row);
      return row;
    },
  };

  /* ---- webhook_endpoints ---- */
  webhookEndpoint = {
    // Mirrors WebhooksService#create. Added when the SSRF fix made a valid
    // URL reach the service for the first time — before that, validation
    // rejected every URL the tests tried, so this path was never exercised.
    create: async (args: Row): Promise<Row> => {
      const row: Row = {
        id: randomUUID(),
        signingSecret: null,
        lastTriggeredAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...defined(args?.data),
      };
      this.webhookEndpoints.push(row);
      return row;
    },

    findFirst: async (args: Row): Promise<Row | null> => {
      const where = args?.where ?? {};
      return (
        this.webhookEndpoints.find(
          (row) =>
            (where.id === undefined || row.id === where.id) &&
            (where.projectId === undefined || row.projectId === where.projectId),
        ) ?? null
      );
    },

    delete: async (args: Row): Promise<Row> => {
      const index = this.webhookEndpoints.findIndex(
        (row) => row.id === args?.where?.id,
      );
      if (index === -1) unsupported('webhookEndpoint', 'delete', args);
      return this.webhookEndpoints.splice(index, 1)[0];
    },

    findMany: async (args: Row = {}): Promise<Row[]> => {
      const where = args.where ?? {};
      return this.webhookEndpoints.filter(
        (row) =>
          (where.projectId === undefined || row.projectId === where.projectId) &&
          (where.eventType === undefined || row.eventType === where.eventType) &&
          (where.isActive === undefined || row.isActive === where.isActive),
      );
    },

    update: async (args: Row): Promise<Row> => {
      const row = this.webhookEndpoints.find(
        (candidate) => candidate.id === args?.where?.id,
      );
      if (!row) unsupported('webhookEndpoint', 'update', args);
      Object.assign(row, defined(args.data));
      return row;
    },
  };
}
