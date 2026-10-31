import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface RenameDialogProps {
  open: boolean;
  initial: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (title: string) => void;
}

export function RenameDialog({ open, initial, onOpenChange, onConfirm }: RenameDialogProps) {
  const [title, setTitle] = useState(initial);

  useEffect(() => {
    if (open) setTitle(initial);
  }, [open, initial]);

  const submit = () => {
    const next = title.trim();
    if (!next) return;
    onConfirm(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="select-none"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogTitle>Rename session</DialogTitle>
          <DialogDescription>Give this conversation a name you can find later.</DialogDescription>
          <Input
            autoFocus
            value={title}
            aria-label="Session title"
            onChange={(event) => setTitle(event.target.value)}
            className="mt-4 select-text"
          />
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={title.trim() === ""}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="select-none">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
