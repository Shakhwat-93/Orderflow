import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const alertVariants = cva(
  "group/alert relative grid w-full gap-1 rounded-xl border p-4 text-left text-sm transition-all duration-200 has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground border-border shadow-xs",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40 dark:bg-destructive/15 *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-destructive shadow-xs",
        warning:
          "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 dark:border-amber-500/40 dark:bg-amber-500/15 *:data-[slot=alert-description]:text-amber-700/90 dark:*:data-[slot=alert-description]:text-amber-400/90 *:[svg]:text-amber-600 dark:*:[svg]:text-amber-400 shadow-xs",
        success:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 dark:border-emerald-500/40 dark:bg-emerald-500/15 *:data-[slot=alert-description]:text-emerald-700/90 dark:*:data-[slot=alert-description]:text-emerald-400/90 *:[svg]:text-emerald-600 dark:*:[svg]:text-emerald-400 shadow-xs",
        info:
          "border-blue-500/30 bg-blue-500/10 text-blue-800 dark:text-blue-300 dark:border-blue-500/40 dark:bg-blue-500/15 *:data-[slot=alert-description]:text-blue-700/90 dark:*:data-[slot=alert-description]:text-blue-400/90 *:[svg]:text-blue-600 dark:*:[svg]:text-blue-400 shadow-xs",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-semibold leading-none tracking-tight group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm leading-relaxed text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-3 right-3 flex items-center gap-2", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction, alertVariants }
