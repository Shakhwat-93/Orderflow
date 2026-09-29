import * as React from "react";
import { cn } from "@/lib/utils";
import { SmoothCaretInput } from "@/components/ui/smooth-caret-input";

export interface InputProps
  extends React.ComponentPropsWithoutRef<"input"> {
  smoothCaret?: boolean;
  wrapperClassName?: string;
  caretColor?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = "text",
      smoothCaret = true,
      wrapperClassName,
      caretColor,
      ...props
    },
    ref,
  ) => {
    return (
      <SmoothCaretInput
        ref={ref}
        type={type}
        smoothCaret={smoothCaret}
        caretColor={caretColor}
        wrapperClassName={wrapperClassName}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input, SmoothCaretInput };
