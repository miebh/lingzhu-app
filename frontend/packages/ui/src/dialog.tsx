import * as React from "react"
import { useT } from "@lingzhu/ui/i18n";
import { Dialog as DialogPrimitive } from "radix-ui"
import { cn } from "@lingzhu/ui/utils"

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogContent({
  className,
  size = "default",
  height = "fit",
  hideClose = false,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  size?: "default" | "wide" | "large" | "model" | "manage"
  height?: "fit" | "body" | "connect" | "model"
  hideClose?: boolean
}) {
  const tr = useT();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay-scrim" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-size={size}
        className={cn(
          "fixed inset-0 z-50 m-auto max-h-[calc(100vh-48px)] max-w-[calc(100vw-48px)] overflow-y-auto no-scrollbar rounded-md border-0 bg-bg-layer-01 p-4 text-text-base shadow-elevation-overlay outline-none",
          height === "body" ? "h-dialog-body" : height === "connect" ? "h-dialog-connect" : height === "model" ? "h-dialog-model" : "h-fit",
          size === "wide"
            ? "w-dialog-wide"
            : size === "large"
              ? "w-dialog-large"
              : size === "model"
                ? "w-dialog-model"
                : size === "manage"
                  ? "w-dialog-manage"
                  : "w-dialog",
          className
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            aria-label={tr("connectProviderClose")}
            className="absolute end-3.5 top-3.5 grid size-5 shrink-0 cursor-default place-items-center rounded-sm text-text-faint transition-colors hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M12.4446 3.55469L3.55566 12.4436M3.55566 3.55469L12.4446 12.4436"
                stroke="currentColor"
                strokeLinejoin="round"
              />
            </svg>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-[15px] leading-5 font-[530] tracking-[-0.13px] text-text-base", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("mt-1 text-body leading-5 font-[440] tracking-[-0.04px] text-text-muted", className)}
      {...props}
    />
  )
}

export { Dialog, DialogContent, DialogTitle, DialogDescription }
