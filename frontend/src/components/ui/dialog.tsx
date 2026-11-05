import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogContent({
  className,
  size = "default",
  height = "fit",
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  size?: "default" | "wide" | "model" | "manage"
  height?: "fit" | "body" | "connect"
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-bg-base/80 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-size={size}
        className={cn(
          "fixed inset-0 z-50 m-auto max-h-[calc(100vh-48px)] max-w-[calc(100vw-48px)] overflow-y-auto rounded-xl border border-border-strong bg-bg-layer-02 p-6 text-text-base outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          height === "body" ? "h-dialog-body" : height === "connect" ? "h-dialog-connect" : "h-fit",
          size === "wide"
            ? "w-dialog-wide"
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
      className={cn("text-reading font-medium text-text-base", className)}
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
      className={cn("mt-2 text-meta leading-5 text-text-muted", className)}
      {...props}
    />
  )
}

export { Dialog, DialogContent, DialogTitle, DialogDescription }
