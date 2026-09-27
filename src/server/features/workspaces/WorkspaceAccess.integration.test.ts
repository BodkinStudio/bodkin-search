import { z } from "zod";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type * as Service from "./WorkspaceService";
import type * as Repository from "./WorkspaceRepository";
import type * as Access from "./WorkspaceAccess";

const runtime = vi.hoisted(() => ({
  CLIENT_WORKSPACES_ENABLED: "true",
  DATABASE_PROVIDER: "d1",
  WORKSPACE_INVITATIONS_ENABLED: "true",
  LOOPS_API_KEY: "test",
  LOOPS_TRANSACTIONAL_WORKSPACE_INVITE_ID: "test",
  WORKSPACE_APP_URL: "https://search.example.test",
}));
vi.mock("cloudflare:workers", () => ({ env: runtime }));
let client: Client;
let service: typeof Service;
let repository: typeof Repository;
let access: typeof Access;
const owner = {
  userId: "owner",
  userEmail: "owner@example.test",
  emailVerified: true,
};
const guest = {
  userId: "guest",
  userEmail: "guest@example.test",
  emailVerified: true,
};
const viewer = {
  userId: "viewer",
  userEmail: "viewer@example.test",
  emailVerified: true,
};
beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/schema", async () => ({
    ...(await import("@/db/better-auth-schema")),
    ...(await import("@/db/workspaces.schema")),
  }));
  vi.doMock("@/db/runBatch", () => ({
    runBatch: async (build: (tx: typeof testDb) => Promise<unknown>[]) => {
      const statements = build(testDb);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test adapts the shared D1 transaction contract to real SQLite
      await testDb.batch(
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- real SQLite adapts the D1 batch contract
        statements as unknown as Parameters<typeof testDb.batch>[0],
      );
    },
  }));
  const original = readFileSync("drizzle/0003_light_sage.sql", "utf8");
  const ddl = ["user", "organization", "member", "invitation"]
    .map(
      (name) =>
        original.match(
          new RegExp("CREATE TABLE `" + name + "` \\([\\s\\S]*?\\n\\);"),
        )?.[0],
    )
    .join("\n");
  const migration = readdirSync("drizzle").find((name) =>
    name.startsWith("0077_"),
  )!;
  await client.executeMultiple(
    ddl +
      "\nALTER TABLE user ADD COLUMN analytics_opted_out integer NOT NULL DEFAULT 0;\n" +
      readFileSync("drizzle/" + migration, "utf8") +
      readFileSync(
        "drizzle/" +
          readdirSync("drizzle").find((name) => name.startsWith("0078_"))!,
        "utf8",
      ),
  );
  await client.executeMultiple(`
    INSERT INTO organization(id,name,slug,created_at) VALUES ('a','Agency','agency',0),('b','Other client','other',0);
    INSERT INTO workspace_configuration VALUES ('a','a','active'),('b','a','active');
    INSERT INTO user(id,name,email,email_verified,updated_at) VALUES ('owner','Owner','owner@example.test',1,0),('viewer','Viewer','viewer@example.test',1,0),('guest','Guest','guest@example.test',1,0),('admin','Admin','admin@example.test',1,0);
    INSERT INTO member VALUES ('owner-a','a','owner','owner',0),('viewer-a','a','viewer','viewer',0),('admin-a','a','admin','admin',0),('owner-b','b','owner','owner',0);
  `);
  service = await import("./WorkspaceService");
  repository = await import("./WorkspaceRepository");
  access = await import("./WorkspaceAccess");
});
afterAll(() => {
  client.close();
  vi.unstubAllGlobals();
});
describe("client workspace isolation", () => {
  it("lists only explicit memberships and denies foreign workspaces", async () => {
    expect(
      (await repository.listMemberships("viewer")).map((item) => item.id),
    ).toEqual(["a"]);
    await expect(
      access.requireWorkspaceMembership("viewer", "b"),
    ).rejects.toThrow();
    await expect(service.workspacePeople(viewer, "a")).rejects.toThrow();
    await expect(
      service.createWorkspace(viewer, "a", "Unauthorized"),
    ).rejects.toThrow();
  });
  it("creates an empty workspace with an explicit inherited payer", async () => {
    const created = await service.createWorkspace(owner, "a", "New client");
    expect(await repository.getWorkspace(created.id)).toMatchObject({
      name: "New client",
      payerOrganizationId: "a",
    });
    expect(
      await access.requireWorkspaceMembership("owner", created.id),
    ).toMatchObject({ role: "owner" });
    await expect(
      access.requireWorkspaceMembership("viewer", created.id),
    ).rejects.toThrow();
  });
  it("protects the last owner and stops admin privilege escalation", async () => {
    expect(
      await service.changeMember(owner, "a", "owner-a", null),
    ).toMatchObject({ ok: false });
    await expect(
      service.changeMember(
        {
          userId: "admin",
          userEmail: "admin@example.test",
          emailVerified: true,
        },
        "a",
        "viewer-a",
        "owner",
      ),
    ).rejects.toThrow();
    expect(
      await access.requireWorkspaceMembership("owner", "a", "owner"),
    ).toBeTruthy();
  });
  it("delivers a recipient-bound single-use invite and never stores the token", async () => {
    let token = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
        token = new URL(
          z
            .object({ dataVariables: z.object({ invitationUrl: z.string() }) })
            .parse(
              JSON.parse(
                typeof options?.body === "string" ? options.body : "{}",
              ),
            ).dataVariables.invitationUrl,
        ).searchParams.get("token")!;
        return new Response("{}", { status: 200 });
      }),
    );
    expect(
      await service.sendInvitation(owner, "a", guest.userEmail, "viewer"),
    ).toEqual({ ok: true });
    expect(token).toHaveLength(64);
    expect(await repository.findInvitation(token)).toBeUndefined();
    expect(await service.inspectInvitation(viewer, token)).toEqual({
      state: "wrong_account",
    });
    expect(
      await service.inspectInvitation(
        { ...guest, emailVerified: false },
        token,
      ),
    ).toEqual({ state: "verify_email" });
    expect(await service.acceptInvitation(guest, token)).toMatchObject({
      state: "accepted",
      workspaceId: "a",
    });
    expect(await service.acceptInvitation(guest, token)).toEqual({
      state: "accepted",
    });
    expect(await access.requireWorkspaceMembership("guest", "a")).toMatchObject(
      { role: "viewer" },
    );
    await expect(
      access.requireWorkspaceMembership("guest", "b"),
    ).rejects.toThrow();
  });
  it("removal invalidates membership immediately", async () => {
    const membership = await access.requireWorkspaceMembership("guest", "a");
    expect(await service.changeMember(owner, "a", membership.id, null)).toEqual(
      { ok: true },
    );
    await expect(
      access.requireWorkspaceMembership("guest", "a"),
    ).rejects.toThrow();
  });
  it("failed delivery revokes the stored invitation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("failed", { status: 500 })),
    );
    expect(
      await service.sendInvitation(owner, "a", guest.userEmail, "viewer"),
    ).toMatchObject({ ok: false });
    expect(
      (await repository.listPeople("a")).invitations.filter(
        (item) => item.email === guest.userEmail && item.status === "pending",
      ),
    ).toHaveLength(0);
  });

  it("rate limits repeated recipient emails, including failed sends", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("failed", { status: 500 })),
    );
    for (let i = 0; i < 4; i++)
      await service.sendInvitation(owner, "a", "rate@example.test", "viewer");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("resend invalidates the old token and revoked inviter cannot grant access", async () => {
    const tokens: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
        const payload = z
          .object({ dataVariables: z.object({ invitationUrl: z.string() }) })
          .parse(
            JSON.parse(typeof options?.body === "string" ? options.body : "{}"),
          );
        tokens.push(
          new URL(payload.dataVariables.invitationUrl).searchParams.get(
            "token",
          )!,
        );
        return new Response("{}", { status: 200 });
      }),
    );
    const admin = {
      userId: "admin",
      userEmail: "admin@example.test",
      emailVerified: true,
    };
    await service.sendInvitation(admin, "a", "resend@example.test", "viewer");
    const invite = (await repository.listPeople("a")).invitations.find(
      (item) => item.email === "resend@example.test",
    )!;
    await service.resendInvitation(admin, "a", invite.id);
    const recipient = {
      userId: "not-created-yet",
      userEmail: "resend@example.test",
      emailVerified: true,
    };
    expect(await service.inspectInvitation(recipient, tokens[0])).toEqual({
      state: "unavailable",
    });
    expect(await service.inspectInvitation(recipient, tokens[1])).toMatchObject(
      { state: "pending" },
    );
    await service.changeMember(owner, "a", "admin-a", "viewer");
    expect(await service.inspectInvitation(recipient, tokens[1])).toEqual({
      state: "unavailable",
    });
  });
  it("transfers ownership atomically and concurrent removals retain an owner", async () => {
    const created = await service.createWorkspace(owner, "a", "Transfer test");
    await client.execute({
      sql: "INSERT INTO member VALUES ('successor',?,'viewer','viewer',0)",
      args: [created.id],
    });
    expect(
      await service.transferWorkspaceOwnership(owner, created.id, "successor"),
    ).toEqual({ ok: true });
    expect(
      await access.requireWorkspaceMembership("viewer", created.id),
    ).toMatchObject({ role: "owner" });
    expect(
      await access.requireWorkspaceMembership("owner", created.id),
    ).toMatchObject({ role: "admin" });
    await Promise.allSettled([
      service.changeMember(viewer, created.id, "successor", null),
      service.changeMember(viewer, created.id, "successor", "viewer"),
    ]);
    expect(
      await access.requireWorkspaceMembership("viewer", created.id),
    ).toMatchObject({ role: "owner" });
  });
  it("invalid database roles are rejected", async () => {
    await expect(
      client.execute(
        "UPDATE member SET role = 'superuser' WHERE id = 'viewer-a'",
      ),
    ).rejects.toThrow();
  });
  it("suspended workspaces do not authorize existing memberships", async () => {
    await client.execute(
      "UPDATE workspace_configuration SET status = 'suspended' WHERE organization_id = 'b'",
    );
    await expect(
      access.requireWorkspaceMembership("owner", "b"),
    ).rejects.toThrow();
  });
});
