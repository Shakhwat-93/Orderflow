import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button relative overflow-hidden inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends ButtonPrimitive.Props,
    VariantProps<typeof buttonVariants> {
  shimmer?: boolean
  shimmerColor?: string
  shimmerDuration?: string
}

function getVariantShimmerColor(variant?: string | null): string {
  switch (variant) {
    case "destructive":
      return "rgba(239, 68, 68, 0.45)"
    case "secondary":
      return "rgba(255, 255, 255, 0.22)"
    case "outline":
      return "rgba(129, 140, 248, 0.35)"
    case "ghost":
      return "rgba(255, 255, 255, 0.12)"
    case "default":
    default:
      return "rgba(255, 255, 255, 0.45)"
  }
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      children,
      shimmer = true,
      shimmerColor,
      shimmerDuration = "3s",
      disabled,
      ...props
    },
    ref
  ) => {
    const isLink = variant === "link"
    const isExcluded =
      !shimmer ||
      isLink ||
      disabled ||
      props["aria-disabled"] === true ||
      props["aria-disabled"] === "true" ||
      props["aria-busy"] === true ||
      props["aria-busy"] === "true"

    const color = shimmerColor || getVariantShimmerColor(variant)

    return (
      <ButtonPrimitive
        ref={ref}
        data-slot="button"
        disabled={disabled}
        className={cn(
          "group/button relative overflow-hidden",
          buttonVariants({ variant, size, className })
        )}
        style={
          {
            "--speed": shimmerDuration,
            "--spread": "90deg",
            "--shimmer-color": color,
            ...props.style,
          } as React.CSSProperties & Record<string, unknown>
        }
        {...props}
      >
        {/* Magic UI Shimmer Perimeter Layer */}
        {!isExcluded && (
          <span
            data-shimmer-layer="true"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] overflow-hidden opacity-75 transition-opacity duration-300 group-hover/button:opacity-100 motion-reduce:hidden"
            style={{
              mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              maskComposite: "exclude",
              WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              WebkitMaskComposite: "xor",
              padding: "1.5px",
            }}
          >
            <span className="shimmer-spark-container absolute inset-0 overflow-visible">
              <span className="animate-shimmer-slide absolute inset-0 aspect-square h-[100cqh]">
                <span
                  className="animate-spin-around absolute -inset-full w-auto rotate-0"
                  style={{
                    background:
                      "conic-gradient(from calc(270deg - (var(--spread) * 0.5)), transparent 0, var(--shimmer-color) var(--spread), transparent var(--spread))",
                  }}
                />
              </span>
            </span>
          </span>
        )}

        {/* Subtle inner highlight for tactile depth */}
        {!isExcluded && variant !== "ghost" && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_-2px_4px_rgba(255,255,255,0.06)] transition-all duration-300 group-hover/button:shadow-[inset_0_-2px_6px_rgba(255,255,255,0.12)] motion-reduce:hidden"
          />
        )}

        {/* Content Layer */}
        <span className="relative z-10 inline-flex items-center justify-center gap-[inherit] shrink-0">
          {children}
        </span>
      </ButtonPrimitive>
    )
  }
)

Button.displayName = "Button"

export { Button, buttonVariants }
