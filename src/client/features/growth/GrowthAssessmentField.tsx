import { useId } from "react";

export function GrowthAssessmentField({
  label,
  value,
  onChange,
  multiline = false,
  className = "",
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  className?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={`flex flex-col gap-2 ${className}`}>
      <span className="text-sm font-medium">{label}</span>
      {multiline ? (
        <textarea
          className="textarea textarea-bordered min-h-20 w-full"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className="input input-bordered input-sm"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error ? (
        <span id={`${id}-error`} className="text-xs text-error">
          {error}
        </span>
      ) : null}
    </label>
  );
}
