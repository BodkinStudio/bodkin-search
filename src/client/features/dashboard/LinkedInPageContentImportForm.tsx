import { useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LINKEDIN_IMPORT_MAX_BYTES,
  LINKEDIN_IMPORT_MAX_ROWS,
  parseLinkedInPageContent,
} from "@/client/features/linkedin/parsePageContent";
import { importLinkedInPageContent } from "@/serverFunctions/linkedin";

type FieldErrors = {
  file?: string;
  pageName?: string;
  startDate?: string;
  endDate?: string;
};

export function LinkedInPageContentImportForm({
  projectId,
}: {
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const fileId = useId();
  const pageNameId = useId();
  const startDateId = useId();
  const endDateId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pageName, setPageName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: importLinkedInPageContent,
    onSuccess: (result) => {
      if (result.status === "error") {
        setFormError(result.error.message);
        return;
      }
      setNotice(
        result.replaced
          ? `Replaced the existing ${result.rowCount}-post import for this period.`
          : `Imported ${result.rowCount} posts.`,
      );
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      void queryClient.invalidateQueries({
        queryKey: ["linkedinPage", projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["linkedinPagePosts", projectId],
      });
    },
    onError: () =>
      setFormError("Couldn’t save this LinkedIn import. Try again."),
  });

  const clearFieldError = (field: keyof FieldErrors) => {
    setFormError(null);
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setNotice(null);
    const errors: FieldErrors = {};
    if (!file) errors.file = "Choose a LinkedIn Page Content export first.";
    if (!pageName.trim()) errors.pageName = "Enter the LinkedIn Page name.";
    if (!startDate) errors.startDate = "Enter the export start date.";
    if (!endDate) errors.endDate = "Enter the export end date.";
    if (startDate > endDate) {
      errors.endDate = "The end date must be on or after the start date.";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError("Check the highlighted import fields.");
      return;
    }
    if (!file) return;

    try {
      setIsParsing(true);
      const parsed = await parseLinkedInPageContent(file, {
        pageName: pageName.trim(),
        startDate,
        endDate,
      });
      mutation.mutate({ data: { projectId, ...parsed } });
    } catch (error) {
      setFieldErrors({
        file:
          error instanceof Error
            ? error.message
            : "Couldn’t read this LinkedIn export.",
      });
      setFormError("The selected export could not be read.");
    } finally {
      setIsParsing(false);
    }
  };

  const isBusy = isParsing || mutation.isPending;
  const isReady =
    file !== null &&
    pageName.trim() !== "" &&
    startDate !== "" &&
    endDate !== "" &&
    startDate <= endDate &&
    !isBusy;

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div>
        <label htmlFor={fileId} className="mb-1 block text-sm font-medium">
          Page Content export
        </label>
        <input
          id={fileId}
          ref={fileInputRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          className="file-input file-input-bordered w-full"
          aria-describedby={`${fileId}-help${fieldErrors.file ? ` ${fileId}-error` : ""}`}
          aria-invalid={fieldErrors.file ? true : undefined}
          onChange={(event) => {
            setFile(event.currentTarget.files?.[0] ?? null);
            clearFieldError("file");
          }}
          disabled={isBusy}
        />
        <p id={`${fileId}-help`} className="mt-1 text-xs text-base-content/55">
          CSV, XLS, or XLSX, up to{" "}
          {Math.round(LINKEDIN_IMPORT_MAX_BYTES / 1024 / 1024)} MiB and{" "}
          {LINKEDIN_IMPORT_MAX_ROWS.toLocaleString()} rows. The raw file stays
          in your browser.
        </p>
        {fieldErrors.file ? (
          <p id={`${fileId}-error`} className="mt-1 text-xs text-error">
            {fieldErrors.file}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label
            htmlFor={pageNameId}
            className="mb-1 block text-sm font-medium"
          >
            Page name
          </label>
          <input
            id={pageNameId}
            type="text"
            className="input input-bordered w-full"
            value={pageName}
            onChange={(event) => {
              setPageName(event.target.value);
              clearFieldError("pageName");
            }}
            aria-describedby={
              fieldErrors.pageName ? `${pageNameId}-error` : undefined
            }
            aria-invalid={fieldErrors.pageName ? true : undefined}
            disabled={isBusy}
            required
          />
          {fieldErrors.pageName ? (
            <p id={`${pageNameId}-error`} className="mt-1 text-xs text-error">
              {fieldErrors.pageName}
            </p>
          ) : null}
        </div>
        <div>
          <label
            htmlFor={startDateId}
            className="mb-1 block text-sm font-medium"
          >
            Start date
          </label>
          <input
            id={startDateId}
            type="date"
            className="input input-bordered w-full"
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              clearFieldError("startDate");
            }}
            aria-describedby={
              fieldErrors.startDate ? `${startDateId}-error` : undefined
            }
            aria-invalid={fieldErrors.startDate ? true : undefined}
            disabled={isBusy}
            required
          />
          {fieldErrors.startDate ? (
            <p id={`${startDateId}-error`} className="mt-1 text-xs text-error">
              {fieldErrors.startDate}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor={endDateId} className="mb-1 block text-sm font-medium">
            End date
          </label>
          <input
            id={endDateId}
            type="date"
            className="input input-bordered w-full"
            value={endDate}
            onChange={(event) => {
              setEndDate(event.target.value);
              clearFieldError("endDate");
            }}
            aria-describedby={
              fieldErrors.endDate ? `${endDateId}-error` : undefined
            }
            aria-invalid={fieldErrors.endDate ? true : undefined}
            disabled={isBusy}
            required
          />
          {fieldErrors.endDate ? (
            <p id={`${endDateId}-error`} className="mt-1 text-xs text-error">
              {fieldErrors.endDate}
            </p>
          ) : null}
        </div>
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-error">
          {formError}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      ) : null}
      {isReady ? (
        <p role="status" className="text-sm text-base-content/65">
          Ready to import. An existing matching period will be replaced.
        </p>
      ) : null}

      <button
        type="submit"
        className="btn btn-primary btn-sm"
        disabled={isBusy}
      >
        {isParsing
          ? "Reading export…"
          : mutation.isPending
            ? "Importing…"
            : "Import analytics"}
      </button>
    </form>
  );
}
