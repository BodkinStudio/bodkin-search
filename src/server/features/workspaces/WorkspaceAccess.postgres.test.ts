import postgres from "postgres";
import { z } from "zod";
import { drizzle } from "drizzle-orm/postgres-js";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as Service from "./WorkspaceService";
import type * as Repository from "./WorkspaceRepository";
import type * as Access from "./WorkspaceAccess";

const testUrl = process.env.TEST_POSTGRES_DATABASE_URL;
vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "postgres",
    CLIENT_WORKSPACES_ENABLED: "true",
    WORKSPACE_INVITATIONS_ENABLED: "true",
    LOOPS_API_KEY: "synthetic",
    LOOPS_TRANSACTIONAL_WORKSPACE_INVITE_ID: "synthetic",
    WORKSPACE_APP_URL: "https://workspace.example.test",
  },
}));
let connection: ReturnType<typeof postgres>;
let administrator: ReturnType<typeof postgres>;
let service: typeof Service;
let repository: typeof Repository;
let access: typeof Access;
const schemaName = `workspace_test_${crypto.randomUUID().replaceAll("-", "")}`;
const suite = testUrl ? describe : describe.skip;
const actor = (id: string) => ({
  userId: id,
  userEmail: `${id}@example.test`,
  emailVerified: true,
});

suite("workspace authorization with real PostgreSQL transactions", () => {
  beforeAll(async () => {
    // Explicit opt-in disposable database. Each run owns a unique schema; public data is untouched.
    administrator = postgres(testUrl!, { max: 1 });
    await administrator.unsafe(`CREATE SCHEMA "${schemaName}"`);
    connection = postgres(testUrl!, {
      max: 8,
      connection: { search_path: schemaName },
    });
    const baseline = readFileSync(
      "drizzle-pg/" +
        readdirSync("drizzle-pg").find((f) => f.startsWith("0000_")),
      "utf8",
    );
    for (const name of ["user", "organization", "member", "invitation"]) {
      const ddl = baseline.match(
        new RegExp('CREATE TABLE "' + name + '" \\([\\s\\S]*?\\n\\);'),
      )?.[0];
      if (!ddl) throw new Error(`Missing migration DDL: ${name}`);
      await connection.unsafe(ddl);
    }
    for (const prefix of ["0055_", "0056_"]) {
      const file = readdirSync("drizzle-pg").find((f) => f.startsWith(prefix))!;
      // Only schema qualification changes: actual migration constraints/indexes run unchanged.
      const migration = readFileSync(`drizzle-pg/${file}`, "utf8").replaceAll(
        '"public".',
        `"${schemaName}".`,
      );
      for (const statement of migration.split("--> statement-breakpoint"))
        await connection.unsafe(statement);
    }
    const testDb = drizzle(connection);
    vi.doMock("@/db", () => ({ db: testDb }));
    vi.doMock("@/db/pg/client", () => ({ pgDb: testDb }));
    vi.doMock("@/db/d1/client", () => ({ d1Db: {} }));
    vi.doMock("@/db/schema", async () => ({
      // oxlint-disable-next-line eslint/no-restricted-imports -- explicitly test real PostgreSQL table mappings
      ...(await import("@/db/pg/better-auth-schema")),
      // oxlint-disable-next-line eslint/no-restricted-imports -- explicitly test real PostgreSQL table mappings
      ...(await import("@/db/pg/workspaces.schema")),
    }));
    service = await import("./WorkspaceService");
    repository = await import("./WorkspaceRepository");
    access = await import("./WorkspaceAccess");
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    if (connection) await connection.end({ timeout: 5 });
    if (administrator) {
      await administrator.unsafe(
        `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`,
      );
      await administrator.end({ timeout: 5 });
    }
  });
  async function fixture() {
    const id = crypto.randomUUID();
    const owner = actor(`owner-${id}`),
      guest = actor(`guest-${id}`),
      viewer = actor(`viewer-${id}`);
    await connection`INSERT INTO organization(id,name,slug,created_at) VALUES (${id},'Client',${id},now())`;
    await connection`INSERT INTO workspace_configuration VALUES (${id},${id},'active')`;
    for (const person of [owner, guest, viewer])
      await connection`INSERT INTO "user"(id,name,email,email_verified,updated_at) VALUES (${person.userId},'Synthetic',${person.userEmail},true,now())`;
    await connection`INSERT INTO member VALUES (${owner.userId},${id},${owner.userId},'owner',now()),(${viewer.userId},${id},${viewer.userId},'viewer',now())`;
    return { id, owner, guest, viewer };
  }
  async function invite(
    f: Awaited<ReturnType<typeof fixture>>,
    target = f.guest,
  ) {
    let token = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: RequestInit) => {
        const body = z
          .object({ dataVariables: z.object({ invitationUrl: z.string() }) })
          .parse(JSON.parse(z.string().parse(init.body)));
        token = new URL(body.dataVariables.invitationUrl).searchParams.get(
          "token",
        )!;
        return new Response("{}", { status: 200 });
      }),
    );
    expect(
      await service.sendInvitation(f.owner, f.id, target.userEmail, "viewer"),
    ).toEqual({ ok: true });
    return token;
  }
  it("enforces membership, role and active status and inherits payer on creation", async () => {
    const f = await fixture(),
      other = await fixture();
    await expect(
      access.requireWorkspaceMembership(f.viewer.userId, other.id),
    ).rejects.toThrow();
    await expect(
      access.requireWorkspaceMembership(f.viewer.userId, f.id, "edit"),
    ).rejects.toThrow();
    const created = await service.createWorkspace(f.owner, f.id, "New client");
    expect(
      (await repository.getWorkspace(created.id))?.payerOrganizationId,
    ).toBe(f.id);
    expect(
      (await access.requireWorkspaceMembership(f.owner.userId, created.id))
        .role,
    ).toBe("owner");
    await connection`UPDATE workspace_configuration SET status='suspended' WHERE organization_id=${f.id}`;
    await expect(
      access.requireWorkspaceMembership(f.owner.userId, f.id),
    ).rejects.toThrow();
    expect(await repository.listMemberships(f.viewer.userId)).toEqual([]);
  });
  it("accepts a recipient-bound invite once under concurrent requests", async () => {
    const f = await fixture(),
      token = await invite(f);
    expect((await service.inspectInvitation(f.viewer, token)).state).toBe(
      "wrong_account",
    );
    const results = await Promise.all([
      service.acceptInvitation(f.guest, token),
      service.acceptInvitation(f.guest, token),
    ]);
    expect(results.every((r) => r.state === "accepted")).toBe(true);
    const rows =
      await connection`SELECT * FROM member WHERE organization_id=${f.id} AND user_id=${f.guest.userId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("viewer");
  });
  it("revoked invitations and revoked inviter authority cannot grant membership", async () => {
    const f = await fixture(),
      token = await invite(f);
    const details = await service.inspectInvitation(f.guest, token);
    if (details.state !== "pending") throw new Error("Expected pending invite");
    await service.revokeInvitation(f.owner, f.id, details.invitationId);
    expect((await service.acceptInvitation(f.guest, token)).state).toBe(
      "unavailable",
    );
    const replacement = await invite(f);
    await connection`UPDATE member SET role='viewer' WHERE id=${f.owner.userId}`;
    expect((await service.acceptInvitation(f.guest, replacement)).state).toBe(
      "unavailable",
    );
    expect(
      await connection`SELECT id FROM member WHERE user_id=${f.guest.userId}`,
    ).toHaveLength(0);
  });
  it.each(["admin", null] as const)(
    "preserves one owner under simultaneous %s changes",
    async (role) => {
      const f = await fixture();
      await connection`UPDATE member SET role='owner' WHERE id=${f.viewer.userId}`;
      await Promise.all([
        repository.updateMemberRole(f.id, f.owner.userId, f.owner.userId, role),
        repository.updateMemberRole(
          f.id,
          f.viewer.userId,
          f.viewer.userId,
          role,
        ),
      ]);
      expect(
        await connection`SELECT id FROM member WHERE organization_id=${f.id} AND role='owner'`,
      ).toHaveLength(1);
    },
  );
  it("atomically transfers ownership and rejects a foreign successor", async () => {
    const f = await fixture(),
      other = await fixture();
    expect(
      (
        await service.transferWorkspaceOwnership(
          f.owner,
          f.id,
          other.viewer.userId,
        )
      ).ok,
    ).toBe(false);
    expect(
      (await access.requireWorkspaceMembership(f.owner.userId, f.id)).role,
    ).toBe("owner");
    expect(
      (await service.transferWorkspaceOwnership(f.owner, f.id, f.viewer.userId))
        .ok,
    ).toBe(true);
    expect(
      (await access.requireWorkspaceMembership(f.owner.userId, f.id)).role,
    ).toBe("admin");
    expect(
      (await access.requireWorkspaceMembership(f.viewer.userId, f.id)).role,
    ).toBe("owner");
  });
  it("serializes recipient rate limits and leaves one usable latest invite", async () => {
    const f = await fixture();
    await Promise.all(
      Array.from({ length: 8 }, () =>
        repository.insertInvitation(
          crypto.randomUUID(),
          f.id,
          f.owner.userId,
          f.guest.userEmail,
          "viewer",
        ),
      ),
    );
    const rows =
      await connection`SELECT status FROM invitation WHERE organization_id=${f.id}`;
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.status === "pending")).toHaveLength(1);
  });
  it("keeps the actor invitation limit across concurrent workspaces", async () => {
    const f = await fixture();
    const second = await service.createWorkspace(
      f.owner,
      f.id,
      "Second client",
    );
    for (let n = 0; n < 19; n++) {
      await repository.insertInvitation(
        crypto.randomUUID(),
        f.id,
        f.owner.userId,
        `seed-${n}@example.test`,
        "viewer",
      );
    }
    await Promise.all([
      repository.insertInvitation(
        crypto.randomUUID(),
        f.id,
        f.owner.userId,
        "race-one@example.test",
        "viewer",
      ),
      repository.insertInvitation(
        crypto.randomUUID(),
        second.id,
        f.owner.userId,
        "race-two@example.test",
        "viewer",
      ),
    ]);
    expect(
      await connection`SELECT id FROM invitation WHERE inviter_id=${f.owner.userId}`,
    ).toHaveLength(20);
  });
  it("denies expired and unverified recipients using live database state", async () => {
    const f = await fixture();
    const token = await invite(f);
    await connection`UPDATE invitation SET expires_at=now()-interval '1 minute' WHERE organization_id=${f.id}`;
    expect((await service.acceptInvitation(f.guest, token)).state).toBe(
      "expired",
    );
    const replacement = await invite(f);
    await connection`UPDATE "user" SET email_verified=false WHERE id=${f.guest.userId}`;
    await expect(
      service.acceptInvitation(f.guest, replacement),
    ).rejects.toThrow();
    expect(
      await connection`SELECT id FROM member WHERE user_id=${f.guest.userId}`,
    ).toHaveLength(0);
  });
  it("applies real migration role and status constraints", async () => {
    const f = await fixture();
    await expect(
      connection`UPDATE member SET role='superuser' WHERE id=${f.viewer.userId}`,
    ).rejects.toThrow();
    await expect(
      connection`UPDATE workspace_configuration SET status='unknown' WHERE organization_id=${f.id}`,
    ).rejects.toThrow();
  });
});
