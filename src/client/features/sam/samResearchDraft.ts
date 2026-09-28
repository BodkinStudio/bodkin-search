import { z } from "zod";

const draftSchema = z.object({
  projectId: z.string(),
  text: z.string().max(30000),
});
// A fallback keeps the unsent handoff usable during SPA navigation when a
// browser blocks session storage. It lasts only for this page's lifetime.
const memoryDrafts = new Map<string, z.infer<typeof draftSchema>>();
const key = (sessionId: string) => `sam-research-draft:${sessionId}`;

export function saveSamResearchDraft(
  projectId: string,
  sessionId: string,
  text: string,
) {
  const draft = draftSchema.parse({ projectId, text });
  memoryDrafts.set(sessionId, draft);
  try {
    sessionStorage.setItem(key(sessionId), JSON.stringify(draft));
  } catch {
    // The in-memory draft remains available to the destination conversation.
  }
}

export function readSamResearchDraft(
  projectId: string,
  sessionId: string,
): string {
  if (typeof window === "undefined") return "";
  const fallback = memoryDrafts.get(sessionId);
  try {
    const draft = draftSchema.safeParse(
      JSON.parse(sessionStorage.getItem(key(sessionId)) ?? "null"),
    );
    if (draft.success && draft.data.projectId === projectId)
      return draft.data.text;
  } catch {
    // Read the same project-scoped draft from memory when storage is blocked.
  }
  return fallback?.projectId === projectId ? fallback.text : "";
}

export function clearSamResearchDraft(sessionId: string) {
  memoryDrafts.delete(sessionId);
  try {
    sessionStorage.removeItem(key(sessionId));
  } catch {
    /* Storage may be unavailable. Sending still works. */
  }
}
