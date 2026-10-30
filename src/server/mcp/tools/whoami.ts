import { autumn } from "@/server/billing/autumn";
import { usageMeteringDisabled } from "@/server/billing/subscription";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";
import { mcpResponse } from "@/server/mcp/formatters";
import { type ToolContext } from "@/server/mcp/context";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { z } from "zod";

async function checkBalance(featureId: string, customerId: string) {
  try {
    const result = await autumn.check({ customerId, featureId });
    return result.balance?.remaining ?? null;
  } catch {
    return null;
  }
}

export const whoamiTool = {
  name: "whoami",
  config: {
    title: "Who am I",
    description:
      "Confirms the connected Bodkin Search account, server mode, token scopes, and whether usage is metered — with the current credit balance when it is. Check this before treating credits as a limit. Uses no credits — does not call DataForSEO.",
    inputSchema: {} as Record<string, never>,
    outputSchema: {
      userEmail: z.string(),
      scopes: z.array(z.string()),
      mode: z.enum(["hosted", "self-hosted"]),
      usageMetered: z.boolean(),
      creditsRemaining: z.number().nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: async (_args: Record<string, never>, context: ToolContext) => {
    const auth = context.auth;
    const isHosted = await isHostedServerAuthMode();
    // Unmetered instances never check a balance, and Autumn has none to
    // return, so reporting 0 would tell agents every paid tool is blocked.
    const usageMetered = isHosted && !(await usageMeteringDisabled());
    let creditsRemaining: number | null = null;
    if (usageMetered) {
      const [base, topup] = await Promise.all([
        checkBalance(AUTUMN_SEO_DATA_BALANCE_FEATURE_ID, auth.organizationId),
        checkBalance(
          AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
          auth.organizationId,
        ),
      ]);
      creditsRemaining =
        base == null && topup == null ? null : (base ?? 0) + (topup ?? 0);
    }
    const lines = [
      `Account: ${auth.userEmail}`,
      `Mode: ${isHosted ? "hosted" : "self-hosted"}`,
      `Scopes: ${auth.scopes.length > 0 ? auth.scopes.join(", ") : "none"}`,
    ];
    lines.push(
      usageMetered
        ? `Credits remaining: ${creditsRemaining != null ? creditsRemaining.toLocaleString() : "unknown"}`
        : "Credits: usage is not metered on this server; tools are not limited by a credit balance",
    );
    return mcpResponse({
      text: lines.join("\n"),
      meta: {
        creditsRemaining: creditsRemaining ?? undefined,
      },
      structuredContent: {
        userEmail: auth.userEmail,
        scopes: auth.scopes,
        mode: isHosted ? "hosted" : "self-hosted",
        usageMetered,
        creditsRemaining,
      },
    });
  },
};
