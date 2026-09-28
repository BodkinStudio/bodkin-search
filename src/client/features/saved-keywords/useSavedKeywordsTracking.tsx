import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { addTrackingKeywords } from "@/serverFunctions/rank-tracking";
import { MAX_TRACKED_KEYWORD_LENGTH } from "@/shared/rank-tracking";
import type { SavedKeywordRow } from "@/types/keywords";
import { SavedKeywordsTrackingModal } from "./SavedKeywordsTrackingModal";
import { trackingKeywordsFromSavedRows } from "./savedKeywordsUtils";

type TrackingRequest = { configId: string; keywords: string[] };

export function useSavedKeywordsTracking({
  projectId,
  selectedRows,
  onSuccess,
}: {
  projectId: string;
  selectedRows: SavedKeywordRow[];
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<TrackingRequest | null>(null);
  const selectedKeywords = useMemo(
    () => trackingKeywordsFromSavedRows(selectedRows),
    [selectedRows],
  );
  const invalidKeywords = selectedKeywords.filter(
    (keyword) => keyword.length > MAX_TRACKED_KEYWORD_LENGTH,
  );
  const keywords = request?.keywords ?? selectedKeywords;

  const mutation = useMutation({
    mutationFn: (nextRequest: TrackingRequest) =>
      addTrackingKeywords({
        data: { projectId, ...nextRequest },
      }),
    onSuccess: (result, submittedRequest) => {
      onSuccess();
      setShowModal(false);
      setError(null);
      setRequest(null);
      void queryClient.invalidateQueries({
        queryKey: ["rankTrackingConfigs", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["rankTrackingConfigSummaries", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["rankTrackingResults", projectId, submittedRequest.configId],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          "rankTrackingCostEstimate",
          projectId,
          submittedRequest.configId,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          "rankTrackingLatestRun",
          projectId,
          submittedRequest.configId,
        ],
      });
      toast.success(
        `${result.added} keyword${result.added !== 1 ? "s" : ""} added to Rank Tracking${result.checkTriggered ? "; initial check started" : "; initial check was not started"}.`,
      );
    },
    onError: (mutationError) =>
      setError(
        getStandardErrorMessage(
          mutationError,
          "Could not add keywords to Rank Tracking.",
        ),
      ),
  });

  const close = () => {
    setShowModal(false);
    setError(null);
    setRequest(null);
  };

  return {
    open: () => {
      setError(null);
      setRequest(null);
      setShowModal(true);
    },
    modal: showModal ? (
      <SavedKeywordsTrackingModal
        projectId={projectId}
        keywords={keywords}
        lockedConfigId={request?.configId ?? null}
        isPending={mutation.isPending}
        error={
          keywords.length === 0
            ? "The selected rows contain no usable keywords."
            : invalidKeywords.length > 0
              ? `${invalidKeywords.length} selected keyword${invalidKeywords.length !== 1 ? "s are" : " is"} longer than ${MAX_TRACKED_KEYWORD_LENGTH} characters and cannot be tracked.`
              : error
        }
        confirmDisabled={keywords.length === 0 || invalidKeywords.length > 0}
        onClose={close}
        onConfirm={(configId) => {
          if (keywords.length === 0 || invalidKeywords.length > 0) return;
          const nextRequest = request ?? {
            configId,
            keywords: selectedKeywords,
          };
          setRequest(nextRequest);
          mutation.mutate(nextRequest);
        }}
      />
    ) : null,
  };
}
