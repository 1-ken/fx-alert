"use client";

import { RichTextEditor } from "./rich-text-editor";
import { cn } from "@/lib/utils";

interface RichTextEditorFieldProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  label?: string;
  description?: string;
  error?: string;
}

/**
 * Standalone RichTextEditor field component
 * Use this when you need a rich text editor outside of React Hook Form
 */
export function RichTextEditorField({
  value,
  onChange,
  placeholder = "Start typing...",
  className,
  disabled = false,
  label,
  description,
  error,
}: RichTextEditorFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {label}
        </label>
      )}
      <RichTextEditor
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}

/**
 * React Hook Form wrapper for RichTextEditor
 * Use this with FormField from react-hook-form
 * 
 * @example
 * ```tsx
 * <FormField
 *   control={form.control}
 *   name="description"
 *   render={({ field }) => (
 *     <FormItem>
 *       <FormLabel>Description</FormLabel>
 *       <FormControl>
 *         <RichTextEditorFormField
 *           value={field.value}
 *           onChange={field.onChange}
 *           placeholder="Enter description..."
 *         />
 *       </FormControl>
 *       <FormDescription>Enter a detailed description</FormDescription>
 *       <FormMessage />
 *     </FormItem>
 *   )}
 * />
 * ```
 */
export function RichTextEditorFormField({
  value,
  onChange,
  placeholder = "Start typing...",
  className,
  disabled = false,
}: Omit<RichTextEditorFieldProps, "label" | "description" | "error">) {
  return (
    <RichTextEditor
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
    />
  );
}
