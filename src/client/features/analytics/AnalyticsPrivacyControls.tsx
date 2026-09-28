import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  eraseAnalyticsContext,
  eraseAnalyticsCustomer,
} from "@/serverFunctions/analytics";
export function AnalyticsPrivacyControls({ projectId }: { projectId: string }) {
  const [kind, setKind] = useState("customer");
  const [id, setId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const client = useQueryClient();
  const erase = useMutation({
    mutationFn: () =>
      kind === "customer"
        ? eraseAnalyticsCustomer({ data: { projectId, customerId: id } })
        : eraseAnalyticsContext({ data: { projectId, contextId: id } }),
    onSuccess: () => {
      setId("");
      setConfirmed(false);
      void client.invalidateQueries();
    },
  });
  return (
    <section className="space-y-3 border-t border-base-300 pt-6">
      <h3 className="font-medium">Erase analytics data</h3>
      <p className="text-sm text-base-content/70">
        Workspace administrators can erase a customer and associated contexts,
        or one visitor context. Use the internal ID from an authorised export.
        This removes retained events, acquisition evidence and pending
        deliveries.
      </p>
      <label className="grid gap-1 text-sm">
        Record type
        <select
          className="select"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setConfirmed(false);
          }}
        >
          <option value="customer">Customer</option>
          <option value="context">Visitor context</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Internal record ID
        <input
          className="input w-full"
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setConfirmed(false);
          }}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          className="checkbox checkbox-sm"
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I understand this permanently removes the retained analytics record.
      </label>
      <button
        className="btn btn-error btn-sm"
        disabled={!confirmed || !id || erase.isPending}
        onClick={() => erase.mutate()}
      >
        {erase.isPending ? "Erasing…" : "Erase record"}
      </button>
      {erase.isError && (
        <p role="alert">
          Unable to erase. Check your administrator access and the record ID.
        </p>
      )}
      {erase.isSuccess && <p role="status">Erasure request completed.</p>}
    </section>
  );
}
