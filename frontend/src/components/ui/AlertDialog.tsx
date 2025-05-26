import { ReactNode } from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';

interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: ReactNode;
}

export default function AlertDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  icon,
}: AlertDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={isOpen} onOpenChange={onClose}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/25" />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-lg">
          <div
            className="flex gap-4"
            role="alertdialog"
            aria-labelledby="alert-dialog-title"
            aria-describedby="alert-dialog-description"
          >
            {icon && (
              <div className="mt-1 flex-shrink-0" aria-hidden="true">
                {icon}
              </div>
            )}
            <div>
              <AlertDialogPrimitive.Title
                id="alert-dialog-title"
                className="text-lg font-semibold leading-6"
              >
                {title}
              </AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description
                id="alert-dialog-description"
                className="mt-2 text-sm text-muted-foreground"
              >
                {description}
              </AlertDialogPrimitive.Description>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <AlertDialogPrimitive.Cancel asChild>
              <button className="rounded-md px-3 py-2 text-sm hover:bg-muted" onClick={onClose}>
                {cancelLabel}
              </button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action
              onClick={onConfirm}
              className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2"
            >
              {confirmLabel}
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
