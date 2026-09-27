import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { z } from "zod";
import type { getAuth as GetAuth } from "@/lib/auth";

const runtime = vi.hoisted(() => ({
  AUTH_MODE: "hosted",
  CLIENT_WORKSPACES_ENABLED: "true",
  DATABASE_PROVIDER: "d1",
  BETTER_AUTH_URL: "http://localhost:3115",
  BETTER_AUTH_SECRET: "synthetic-workspace-auth-test-secret-at-least-32",
  LOOPS_API_KEY: "test",
  LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID: "test",
  LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID: "test",
}));
vi.mock("cloudflare:workers", () => ({ env: runtime }));
vi.mock("better-auth/tanstack-start", () => ({
  tanstackStartCookies: () => ({ id: "test-cookie-context" }),
}));
let client: Client;
let auth: ReturnType<typeof GetAuth>;
let verificationUrl = "";
let passwordResetUrl = "";
beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const schema = {
    ...(await import("@/db/better-auth-schema")),
    ...(await import("@/db/workspaces.schema")),
  };
  const testDb = drizzle(client, { schema });
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: testDb }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: testDb }));
  vi.doMock("@/db/schema", () => schema);
  vi.doMock("@/server/email/loops", () => ({
    sendHostedVerificationEmail: async (input: { confirmationUrl: string }) => {
      verificationUrl = input.confirmationUrl;
    },
    sendHostedPasswordResetEmail: async (input: { resetUrl: string }) => {
      passwordResetUrl = input.resetUrl;
    },
    upsertHostedSignupContact: vi.fn(),
  }));
  const original = readFileSync("drizzle/0003_light_sage.sql", "utf8");
  const tables = [
    "user",
    "organization",
    "member",
    "invitation",
    "session",
    "account",
    "verification",
  ];
  await client.executeMultiple(
    tables
      .map(
        (name) =>
          original.match(
            new RegExp("CREATE TABLE `" + name + "` \\([\\s\\S]*?\\n\\);"),
          )?.[0],
      )
      .join("\n") +
      "\nALTER TABLE user ADD COLUMN analytics_opted_out integer NOT NULL DEFAULT 0;",
  );
  await client.executeMultiple(
    `INSERT INTO organization(id,name,slug,created_at) VALUES ('client','Client','client',0); INSERT INTO user(id,name,email,email_verified,updated_at) VALUES ('owner','Owner','owner@example.test',1,0); INSERT INTO invitation(id,organization_id,email,role,status,expires_at,inviter_id) VALUES ('invite','client','invited@example.test','viewer','pending',9999999999999,'owner');`,
  );
  await client.executeMultiple(
    readFileSync(
      "drizzle/" +
        readdirSync("drizzle").find((name) => name.startsWith("0077_"))!,
      "utf8",
    ),
  );
  auth = (await import("@/lib/auth")).getAuth();
});
afterAll(() => client.close());
const password = "Synthetic-local-test-password-123";
function post(path: string, body: unknown) {
  return auth.handler(
    new Request("http://localhost:3115/api/auth/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3115",
      },
      body: JSON.stringify(body),
    }),
  );
}
it("rejects public signup without an invitation", async () => {
  const response = await post("sign-up/email", {
    email: "uninvited@example.test",
    password,
    name: "Uninvited",
  });
  expect(response.status).toBe(403);
  expect(
    (
      await client.execute(
        "SELECT id FROM user WHERE email = 'uninvited@example.test'",
      )
    ).rows,
  ).toHaveLength(0);
});
it("requires verification and creates no membership, workspace or billing on signup/sign-in", async () => {
  const response = await post("sign-up/email", {
    email: "invited@example.test",
    password,
    name: "Invited",
    callbackURL: "/workspace-invitation",
  });
  expect(response.status).toBe(200);
  const body = z
    .object({ user: z.object({ id: z.string(), emailVerified: z.boolean() }) })
    .parse(await response.json());
  expect(body.user.emailVerified).toBe(false);
  expect(
    (await post("sign-in/email", { email: "invited@example.test", password }))
      .status,
  ).toBe(403);
  expect(verificationUrl).toContain("verify-email");
  expect(
    (await auth.handler(new Request(verificationUrl))).status,
  ).toBeLessThan(400);
  const signedIn = await post("sign-in/email", {
    email: "invited@example.test",
    password,
  });
  expect(signedIn.status).toBe(200);
  expect(signedIn.headers.get("set-cookie")).toContain("session_token");
  expect(
    (await client.execute("SELECT id FROM organization")).rows,
  ).toHaveLength(1);
  expect((await client.execute("SELECT id FROM member")).rows).toHaveLength(0);
});

it("establishes owner email credentials through a verified reset without changing identity", async () => {
  const requested = await post("request-password-reset", {
    email: "owner@example.test",
    redirectTo: "http://localhost:3115/reset-password",
  });
  expect(requested.status).toBe(200);
  const token = new URL(passwordResetUrl).pathname.split("/").at(-1);
  expect(
    (await post("reset-password", { token, newPassword: password })).status,
  ).toBe(200);
  const signedIn = await post("sign-in/email", {
    email: "owner@example.test",
    password,
  });
  expect(signedIn.status).toBe(200);
  expect(
    z
      .object({ user: z.object({ id: z.string() }) })
      .parse(await signedIn.json()).user.id,
  ).toBe("owner");
});

it("two signed-in users cannot select each other's workspace and cached cookies lose revoked access", async () => {
  const guestResponse = await post("sign-in/email", {
    email: "invited@example.test",
    password,
  });
  const guestUser = z
    .object({ user: z.object({ id: z.string() }) })
    .parse(await guestResponse.clone().json()).user;
  const ownerResponse = await post("sign-in/email", {
    email: "owner@example.test",
    password,
  });
  await client.executeMultiple(
    "INSERT INTO organization(id,name,slug,created_at) VALUES ('private','Private','private',0); INSERT INTO workspace_configuration VALUES ('client','private','active'),('private','private','active'); INSERT INTO member VALUES ('owner-member','private','owner','owner',0);",
  );
  await client.execute({
    sql: "INSERT INTO member VALUES ('viewer-member','client',?,'viewer',0)",
    args: [guestUser.id],
  });
  const { resolveHostedContext } =
    await import("@/middleware/ensure-user/hosted");
  const guestHeaders = headersFor(guestResponse, "private");
  expect(await resolveHostedContext(guestHeaders)).toMatchObject({
    userId: guestUser.id,
    organizationId: "client",
  });
  expect(
    await resolveHostedContext(headersFor(ownerResponse, "client")),
  ).toMatchObject({ userId: "owner", organizationId: "private" });
  await client.execute("DELETE FROM member WHERE id = 'viewer-member'");
  expect(await resolveHostedContext(guestHeaders)).toMatchObject({
    userId: guestUser.id,
    organizationId: "",
  });
});

const headersFor = (response: Response, workspace: string) =>
  new Headers({
    cookie:
      response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; ") +
      "; bodkin-workspace=" +
      workspace,
  });
