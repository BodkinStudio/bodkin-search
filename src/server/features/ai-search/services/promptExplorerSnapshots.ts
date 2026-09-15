import { AppError } from "@/server/lib/errors";
import {
  getPromptExplorerSnapshot,
  listPromptExplorerSnapshots,
} from "@/server/features/ai-search/repositories/PromptExplorerSnapshotRepository";

export async function listSavedPromptExplorerSnapshots(projectId: string) {
  return listPromptExplorerSnapshots(projectId);
}

export async function getSavedPromptExplorerSnapshot(
  projectId: string,
  snapshotId: string,
) {
  const snapshot = await getPromptExplorerSnapshot(projectId, snapshotId);
  if (!snapshot)
    throw new AppError("NOT_FOUND", "Saved prompt exploration not found");
  return snapshot;
}
