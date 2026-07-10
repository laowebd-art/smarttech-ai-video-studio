import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...rest }: InputProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="label-text">
          {label}
        </label>
      )}
      <input id={id} className={cn("input-field", error && "border-red-400", className)} {...rest} />
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function TextArea({ label, error, className, id, ...rest }: TextAreaProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="label-text">
          {label}
        </label>
      )}
      <textarea id={id} className={cn("input-field resize-none", error && "border-red-400", className)} {...rest} />
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export function Select({ label, className, id, children, ...rest }: SelectProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="label-text">
          {label}
        </label>
      )}
      <select id={id} className={cn("input-field", className)} {...rest}>
        {children}
      </select>
    </div>
  );
}
