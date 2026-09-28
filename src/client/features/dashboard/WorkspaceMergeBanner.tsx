import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientWorkspacesBuild } from "@/client/features/workspaces/useWorkspaceAccess";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  getWorkspaceMergeStatus,
  mergeLegacyWorkspaces,
} from "@/serverFunctions/workspace";

// Shown on self-hosted Cloudflare Access deployments that still have per-user
// workspaces from before the shared workspace existed. The server decides
// visibility (AUTH_MODE is a runtime var there); hosted builds skip the query
// entirely since the mode is known at build time.
export function WorkspaceMergeBanner() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["workspaceMergeStatus"],
    queryFn: () => getWorkspaceMergeStatus(),
    // Client workspaces have no legacy per-user workspaces to merge; the
    // server refuses the check there.
    enabled: !isHostedClientAuthMode() && !clientWorkspacesBuild(),
  });

  const mergeMutation = useMutation({
    mutationFn: () => mergeLegacyWorkspaces(),
    onSuccess: ({ mergedWorkspaces }) => {
      toast.success(
        `Migrated ${mergedWorkspaces} workspace${mergedWorkspaces === 1 ? "" : "s"} into the shared workspace.`,
      );
      // The merge changes projects, connections, and the banner's own status —
      // refetch everything rather than enumerating keys.
      void queryClient.invalidateQueries();
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(
          error,
          "Couldn't migrate the workspaces. Try again.",
        ),
      ),
  });

  if (!statusQuery.data || statusQuery.data.legacyWorkspaceCount === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 p-5">
      <p className="max-w-3xl text-sm">
        When self-hosting on Cloudflare, there was a bug where each user had
        their own workspace. It was intended for all users to be in one
        workspace. Clicking the button below will migrate everyone&apos;s
        previous work into this shared workspace.
      </p>
      <button
        type="button"
        className="btn btn-primary btn-sm mt-4"
        disabled={mergeMutation.isPending}
        onClick={() => mergeMutation.mutate()}
      >
        {mergeMutation.isPending ? "Migrating…" : "Migrate workspaces"}
      </button>
    </div>
  );
}
