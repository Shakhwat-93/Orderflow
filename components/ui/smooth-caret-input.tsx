"use client";

import React, {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { cn } from "@/lib/utils";

const DESKTOP_POINTER_QUERY = "(any-hover: hover) and (any-pointer: fine)";

const SUPPORTED_INPUT_TYPES = new Set([
  "text",
  "password",
  "email",
  "search",
  "tel",
  "url",
  "number",
]);

const PASSWORD_CHAR =
  typeof navigator !== "undefined" &&
  navigator.userAgent.match(/firefox|fxios/i)
    ? "\u25CF"
    : "\u2022";

export interface SmoothCaretInputProps
  extends ComponentPropsWithoutRef<"input"> {
  wrapperClassName?: string;
  caretColor?: string;
  smoothCaret?: boolean;
}

export const SmoothCaretInput = forwardRef<
  HTMLInputElement,
  SmoothCaretInputProps
>(
  (
    {
      className,
      wrapperClassName,
      type = "text",
      value,
      defaultValue,
      onChange,
      onFocus,
      onBlur,
      onKeyDown,
      onKeyUp,
      onClick,
      onSelect,
      style,
      disabled,
      readOnly,
      caretColor,
      smoothCaret = true,
      ...props
    },
    forwardedRef,
  ) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLSpanElement>(null);

    const [isDesktop, setIsDesktop] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [internalValue, setInternalValue] = useState(defaultValue ?? "");

    const isControlled = value !== undefined;
    const inputValue = isControlled ? String(value) : internalValue;
    const prefersReducedMotion = useReducedMotion();

    const caretX = useMotionValue(0);
    const caretOpacity = useMotionValue(0);

    const springCaretX = useSpring(
      caretX,
      prefersReducedMotion
        ? { stiffness: 10000, damping: 100, mass: 0.1 }
        : { stiffness: 500, damping: 30, mass: 0.5 },
    );

    // Merge external forwarded ref with internal ref directly on commit
    const handleInputRef = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current =
          node;
      }
    };

    // Check desktop fine pointer
    useEffect(() => {
      const mediaQuery = window.matchMedia(DESKTOP_POINTER_QUERY);
      const updateDesktop = () => setIsDesktop(mediaQuery.matches);
      updateDesktop();
      mediaQuery.addEventListener("change", updateDesktop);
      return () => mediaQuery.removeEventListener("change", updateDesktop);
    }, []);

    const isSupportedType = SUPPORTED_INPUT_TYPES.has(type);
    const isInteractive = !disabled && !readOnly;
    const enableSmoothCaret =
      smoothCaret && isDesktop && isSupportedType && isInteractive;

    const syncMeasureSpan = () => {
      const input = inputRef.current;
      const measureSpan = measureRef.current;
      if (!input || !measureSpan) return;

      const styles = window.getComputedStyle(input);
      const isPassword = input.type === "password";

      let fontSize = styles.fontSize;
      if (
        PASSWORD_CHAR === "\u2022" &&
        isPassword &&
        typeof navigator !== "undefined" &&
        !navigator.userAgent.match(/chrome|chromium|crios/i)
      ) {
        fontSize = `${parseFloat(fontSize) + 6.25}px`;
      }

      measureSpan.style.font = `${styles.fontStyle} ${styles.fontWeight} ${fontSize} ${styles.fontFamily}`;
      measureSpan.style.letterSpacing = styles.letterSpacing;
      measureSpan.style.fontFeatureSettings = styles.fontFeatureSettings;
      measureSpan.style.fontVariationSettings = styles.fontVariationSettings;
    };

    const measurePrefixWidth = (text: string) => {
      const input = inputRef.current;
      const measureSpan = measureRef.current;
      if (!input || !measureSpan) return null;

      syncMeasureSpan();
      measureSpan.textContent = text;

      const paddingLeft =
        parseFloat(window.getComputedStyle(input).paddingLeft) || 0;

      return text.length > 0
        ? measureSpan.offsetWidth + paddingLeft
        : paddingLeft - 1;
    };

    const scrollCaretIntoView = (
      target: HTMLInputElement,
      absoluteWidth: number,
    ) => {
      const styles = window.getComputedStyle(target);
      const paddingLeft = parseFloat(styles.paddingLeft) || 0;
      const paddingRight = parseFloat(styles.paddingRight) || 0;
      const maxScroll = Math.max(0, target.scrollWidth - target.clientWidth);
      const visibleRight = target.scrollLeft + target.clientWidth - paddingRight;
      const visibleLeft = target.scrollLeft + paddingLeft;

      if (absoluteWidth > visibleRight) {
        target.scrollLeft = Math.min(
          absoluteWidth - target.clientWidth + paddingRight,
          maxScroll,
        );
        return;
      }

      if (absoluteWidth < visibleLeft) {
        target.scrollLeft = Math.max(0, absoluteWidth - paddingLeft);
      }
    };

    const getCaretIndex = (target: HTMLInputElement) => {
      const selectionStart = target.selectionStart ?? 0;
      const selectionEnd = target.selectionEnd ?? 0;

      if (selectionStart === selectionEnd) {
        return selectionStart;
      }

      return target.selectionDirection === "backward"
        ? selectionStart
        : selectionEnd;
    };

    const updateCaretFromInput = (target: HTMLInputElement) => {
      if (!enableSmoothCaret || document.activeElement !== target) {
        caretOpacity.set(0);
        return;
      }

      const selectionStart = target.selectionStart ?? 0;
      const selectionEnd = target.selectionEnd ?? 0;
      const hasSelection = selectionStart !== selectionEnd;
      const caretIndex = getCaretIndex(target);
      const isPassword = target.type === "password";
      const textBeforeCaret = isPassword
        ? PASSWORD_CHAR.repeat(caretIndex)
        : target.value.slice(0, caretIndex);

      const absoluteWidth = measurePrefixWidth(textBeforeCaret);
      if (absoluteWidth === null) return;

      scrollCaretIntoView(target, absoluteWidth);

      const styles = window.getComputedStyle(target);
      const paddingLeft = parseFloat(styles.paddingLeft) || 0;
      const paddingRight = parseFloat(styles.paddingRight) || 0;
      const caretPosition = absoluteWidth - target.scrollLeft;
      const minX = paddingLeft - 1;
      const maxX = target.clientWidth - paddingRight;
      const isCaretVisible =
        caretPosition >= minX && caretPosition <= maxX + 1;

      caretX.set(Math.min(caretPosition, maxX));

      if (!isCaretVisible || hasSelection) {
        caretOpacity.set(0);
        return;
      }

      caretOpacity.set(1);
    };

    const updateCaretRef = useRef(updateCaretFromInput);
    updateCaretRef.current = updateCaretFromInput;

    // Recalculate on value change if focused
    useEffect(() => {
      const input = inputRef.current;
      if (input && document.activeElement === input) {
        updateCaretRef.current(input);
      }
    }, [inputValue, type]);

    // Handle listeners for selection, fonts, resize, and scroll
    useEffect(() => {
      const input = inputRef.current;
      const container = containerRef.current;
      if (!input || !container || !enableSmoothCaret) return;

      const updateCaretIfFocused = () => {
        if (document.activeElement === input) {
          updateCaretRef.current(input);
        }
      };

      const handleSelectionChange = () => {
        if (document.activeElement !== input) return;
        requestAnimationFrame(() => {
          if (document.activeElement === input) {
            updateCaretRef.current(input);
          }
        });
      };

      document.addEventListener("selectionchange", handleSelectionChange);
      if (typeof document !== "undefined" && "fonts" in document) {
        document.fonts.addEventListener("loadingdone", updateCaretIfFocused);
        void document.fonts.ready.then(updateCaretIfFocused);
      }
      input.addEventListener("scroll", updateCaretIfFocused);

      const resizeObserver = new ResizeObserver(updateCaretIfFocused);
      resizeObserver.observe(container);

      return () => {
        document.removeEventListener("selectionchange", handleSelectionChange);
        if (typeof document !== "undefined" && "fonts" in document) {
          document.fonts.removeEventListener("loadingdone", updateCaretIfFocused);
        }
        input.removeEventListener("scroll", updateCaretIfFocused);
        resizeObserver.disconnect();
      };
    }, [enableSmoothCaret]);

    return (
      <div
        ref={containerRef}
        className={cn("relative grid grid-cols-1 p-0 w-full", wrapperClassName)}
        style={{
          caretColor: enableSmoothCaret && isFocused ? "transparent" : (style?.caretColor || "auto"),
        }}
      >
        <input
          {...props}
          ref={handleInputRef}
          type={type}
          value={inputValue}
          disabled={disabled}
          readOnly={readOnly}
          className={cn(
            "col-start-1 col-end-2 row-start-1 row-end-2 text-inherit w-full",
            className,
          )}
          style={{
            ...style,
            caretColor: enableSmoothCaret && isFocused ? "transparent" : (style?.caretColor || "auto"),
          }}
          onChange={(e) => {
            if (!isControlled) setInternalValue(e.target.value);
            onChange?.(e);
            requestAnimationFrame(() => {
              updateCaretRef.current(e.target);
            });
          }}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
            requestAnimationFrame(() => {
              updateCaretRef.current(e.target);
            });
          }}
          onBlur={(e) => {
            setIsFocused(false);
            caretOpacity.set(0);
            onBlur?.(e);
          }}
          onKeyDown={(e) => {
            onKeyDown?.(e);
            requestAnimationFrame(() => {
              updateCaretRef.current(e.currentTarget);
            });
          }}
          onKeyUp={(e) => {
            onKeyUp?.(e);
            requestAnimationFrame(() => {
              updateCaretRef.current(e.currentTarget);
            });
          }}
          onClick={(e) => {
            onClick?.(e);
            requestAnimationFrame(() => {
              updateCaretRef.current(e.currentTarget);
            });
          }}
          onSelect={(e) => {
            onSelect?.(e);
            requestAnimationFrame(() => {
              updateCaretRef.current(e.currentTarget);
            });
          }}
        />

        {/* Hidden measurement span for typography metrics */}
        <span
          ref={measureRef}
          aria-hidden="true"
          className="pointer-events-none invisible absolute top-0 left-0 whitespace-pre"
        />

        {/* Smooth spring caret */}
        <motion.div
          aria-hidden="true"
          className={cn(
            "pointer-events-none col-start-1 col-end-2 row-start-1 row-end-2 h-[1.15em] w-[2px] rounded-full self-center z-10",
            caretColor ? "" : "bg-foreground",
          )}
          style={{
            x: springCaretX,
            opacity: caretOpacity,
            backgroundColor: caretColor || undefined,
          }}
        />
      </div>
    );
  },
);

SmoothCaretInput.displayName = "SmoothCaretInput";
