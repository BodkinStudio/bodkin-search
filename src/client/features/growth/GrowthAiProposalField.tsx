import { getFieldError } from "@/client/lib/forms";

type TextField = {
  state: { value: string; meta: { errors: readonly unknown[] } };
  handleChange: (value: string) => void;
  handleBlur: () => void;
};

export function GrowthAiProposalField({
  id,
  label,
  field,
  maxLength,
  rows,
  hint,
  type = "text",
}: {
  id: string;
  label: string;
  field: TextField;
  maxLength?: number;
  rows?: number;
  hint?: string;
  type?: "text" | "date";
}) {
  const error = getFieldError(field.state.meta.errors);
  const attributes = {
    id,
    value: field.state.value,
    maxLength,
    required: true,
    onInput: (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      field.handleChange(event.currentTarget.value),
    onBlur: field.handleBlur,
    "aria-invalid": Boolean(error),
    "aria-describedby": `${id}-error${hint ? ` ${id}-hint` : ""}`,
  };
  return (
    <div>
      <label className="font-medium" htmlFor={id}>
        {label}
      </label>
      {rows ? (
        <textarea
          {...attributes}
          rows={rows}
          className="textarea textarea-bordered mt-1 w-full"
        />
      ) : (
        <input
          {...attributes}
          type={type}
          className="input input-bordered mt-1 w-full"
        />
      )}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-base-content/70">
          {hint}
        </p>
      ) : null}
      <p id={`${id}-error`} role="alert">
        {error}
      </p>
    </div>
  );
}
