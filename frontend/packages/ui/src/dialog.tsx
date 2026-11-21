import type { JSX } from "solid-js";
import { Show, splitProps } from "solid-js";
import { Dialog as DialogPrimitive } from "@kobalte/core/dialog";
import { useT } from "@lingzhu/ui/i18n";
import { cn } from "@lingzhu/ui/utils";

type DialogRootProps = Parameters<typeof DialogPrimitive>[0];

function Dialog(props: DialogRootProps) {
  return <DialogPrimitive data-slot="dialog" {...props} />;
}

interface DialogContentProps extends JSX.HTMLAttributes<HTMLDivElement> {
  size?: "default" | "wide" | "large" | "model" | "manage";
  height?: "fit" | "body" | "connect" | "model";
  hideClose?: boolean;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: Event) => void;
  onInteractOutside?: (event: Event) => void;
}

function DialogContent(props: DialogContentProps) {
  const tr = useT();
  const [local, rest] = splitProps(props, [
    "class",
    "size",
    "height",
    "hideClose",
    "children",
    "onOpenAutoFocus",
    "onCloseAutoFocus",
    "onEscapeKeyDown",
    "onPointerDownOutside",
    "onInteractOutside",
  ]);
  const size = () => local.size ?? "default";
  const height = () => local.height ?? "fit";
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-overlay-scrim" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-size={size()}
        onOpenAutoFocus={local.onOpenAutoFocus}
        onCloseAutoFocus={local.onCloseAutoFocus}
        onEscapeKeyDown={local.onEscapeKeyDown}
        onPointerDownOutside={local.onPointerDownOutside as never}
        onInteractOutside={local.onInteractOutside as never}
        class={cn(
          "fixed inset-0 z-50 m-auto max-h-[calc(100vh-48px)] max-w-[calc(100vw-48px)] overflow-y-auto no-scrollbar rounded-md border-0 bg-bg-layer-01 p-4 text-text-base shadow-elevation-overlay outline-none",
          height() === "body"
            ? "h-dialog-body"
            : height() === "connect"
              ? "h-dialog-connect"
              : height() === "model"
                ? "h-dialog-model"
                : "h-fit",
          size() === "wide"
            ? "w-dialog-wide"
            : size() === "large"
              ? "w-dialog-large"
              : size() === "model"
                ? "w-dialog-model"
                : size() === "manage"
                  ? "w-dialog-manage"
                  : "w-dialog",
          local.class,
        )}
        {...rest}
      >
        {local.children}
        <Show when={!local.hideClose}>
          <DialogPrimitive.CloseButton
            as="button"
            aria-label={tr("connectProviderClose")}
            class="absolute end-3.5 top-3.5 grid size-5 shrink-0 cursor-default place-items-center rounded-sm text-text-faint transition-colors hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M12.4446 3.55469L3.55566 12.4436M3.55566 3.55469L12.4446 12.4436"
                stroke="currentColor"
                stroke-linejoin="round"
              />
            </svg>
          </DialogPrimitive.CloseButton>
        </Show>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle(props: JSX.HTMLAttributes<HTMLHeadingElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      class={cn("text-[15px] leading-5 font-[530] tracking-[-0.13px] text-text-base", local.class)}
      {...rest}
    />
  );
}

function DialogDescription(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      class={cn("mt-1 text-body leading-5 font-[440] tracking-[-0.04px] text-text-muted", local.class)}
      {...rest}
    />
  );
}

export { Dialog, DialogContent, DialogTitle, DialogDescription };
