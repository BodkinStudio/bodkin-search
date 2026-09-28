import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { correctAnalyticsAttribution } from "@/serverFunctions/analytics";
export function AnalyticsCorrectionForm({
  projectId,
  customerId,
  version,
  clickEventId,
}: {
  projectId: string;
  customerId: string;
  version: number;
  clickEventId: string | null;
}) {
  const [click, setClick] = useState(clickEventId ?? "");
  const [reason, setReason] = useState("");
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      correctAnalyticsAttribution({
        data: {
          projectId,
          customerId,
          expectedVersion: version,
          clickEventId: click.trim() || null,
          reason,
        },
      }),
    onSuccess: async () => {
      setReason("");
      await client.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith("analytics"),
      });
    },
  });
  return (
    <details className="rounded border border-base-300 p-3">
      <summary className="cursor-pointer font-medium">
        Correct acquisition attribution
      </summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <p className="text-base-content/70">
          This creates an audited manual decision. It does not join personal
          journeys. Leave the click ID empty to mark acquisition unattributed.
        </p>
        <label className="block">
          Acquisition click event ID
          <input
            className="input mt-1 w-full"
            value={click}
            onChange={(e) => setClick(e.target.value)}
          />
        </label>
        <label className="block">
          Reason for correction
          <textarea
            className="textarea mt-1 w-full"
            required
            minLength={10}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {mutation.isError && (
          <p role="alert" className="text-error">
            {mutation.error.message}
          </p>
        )}
        {mutation.isSuccess && (
          <p role="status">Correction saved and queued for delivery.</p>
        )}
        <button
          className="btn btn-sm btn-primary"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Saving…" : "Save correction"}
        </button>
      </form>
    </details>
  );
}
