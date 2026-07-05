"use client";

// INV-3 — capture the receiver's signature for a pickup slip. Reuses the exact
// mechanism the invite T&C flow uses (react-signature-canvas → trimmed PNG data
// URL); it is NOT a new signature system. The slip already exists (created by
// createPickupSlipAction) with an unsigned PDF, so "Sign later" is a valid exit:
// the slip is simply left unsigned and can be signed on a future pass.

import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { signPickupSlipAction } from "@/app/(app)/inventory/actions";

export function PickupSlipSignatureDialog({
  open,
  onOpenChange,
  slipId,
  slipNumber,
  recipientName,
  unsignedPdfUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slipId: string;
  slipNumber: string;
  recipientName: string;
  /** Signed URL for the initial (unsigned) PDF, if the create step produced one. */
  unsignedPdfUrl: string | null;
}) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [signing, setSigning] = useState(false);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);

  const currentPdfUrl = finalUrl ?? unsignedPdfUrl;

  async function handleSign() {
    const pad = sigRef.current;
    if (!pad || pad.isEmpty()) {
      toast.error("Please have the receiver sign first.");
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = pad.getTrimmedCanvas().toDataURL("image/png");
    } catch {
      dataUrl = pad.getCanvas().toDataURL("image/png");
    }
    setSigning(true);
    const res = await signPickupSlipAction(slipId, dataUrl);
    setSigning(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setFinalUrl(res.data.signedUrl);
    toast.success("Pickup slip signed");
  }

  const signed = finalUrl !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pickup slip {slipNumber}</DialogTitle>
          <DialogDescription>
            {signed
              ? "Signed and saved. You can open the PDF below."
              : `Have ${recipientName} sign to confirm receipt, or sign later.`}
          </DialogDescription>
        </DialogHeader>

        {!signed && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Receiver signature</Label>
              <button
                type="button"
                onClick={() => sigRef.current?.clear()}
                className="text-brand-gold text-[11px] font-medium"
              >
                Clear
              </button>
            </div>
            <div
              className="w-full overflow-hidden rounded-md border bg-white"
              style={{ borderColor: "var(--border)" }}
            >
              <SignatureCanvas
                ref={sigRef}
                penColor="#1a2332"
                canvasProps={{
                  className: "w-full",
                  style: { width: "100%", height: 180, touchAction: "none" },
                }}
              />
            </div>
          </div>
        )}

        {currentPdfUrl && (
          <a
            href={currentPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-navy inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open {signed ? "signed" : "unsigned"} pickup slip PDF
          </a>
        )}

        <DialogFooter>
          {signed ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={signing}
              >
                Sign later
              </Button>
              <Button type="button" onClick={handleSign} disabled={signing}>
                {signing ? "Saving…" : "Sign & finish"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
