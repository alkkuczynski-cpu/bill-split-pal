import { useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Camera, Image, Upload, Loader2, Pencil, Check, X, Plus, Trash2, AlertTriangle, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { saveIdentity } from "@/lib/sessionIdentity";
import { safeStorage } from "@/lib/storage";


interface LineItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  mismatch?: boolean;
  color: string;
}

const ITEM_COLORS = [
  "hsl(160, 60%, 40%)",  // primary green
  "hsl(260, 60%, 55%)",  // night purple
  "hsl(35, 90%, 55%)",   // accent orange
  "hsl(200, 70%, 50%)",  // blue
  "hsl(340, 65%, 50%)",  // pink
  "hsl(45, 85%, 50%)",   // gold
  "hsl(180, 55%, 42%)",  // teal
  "hsl(15, 75%, 50%)",   // red-orange
  "hsl(280, 50%, 60%)",  // lavender
  "hsl(100, 50%, 42%)",  // lime
  "hsl(220, 60%, 55%)",  // royal blue
  "hsl(0, 65%, 50%)",    // red
];



const formatRawError = (value: unknown): string => {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const ReceiptUpload = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isShareLink = searchParams.get("type") === "share_link";
  const { user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editQuantity, setEditQuantity] = useState(1);
  const [editingQtyInline, setEditingQtyInline] = useState<string | null>(null);
  const [inlineQtyValue, setInlineQtyValue] = useState("");
  const [tipValue, setTipValue] = useState("");
  const [tipMode, setTipMode] = useState<"percent" | "flat">("percent");
  const [noTipActive, setNoTipActive] = useState(false);
  const [receiptExpanded, setReceiptExpanded] = useState(false);
  const newItemRef = useRef<HTMLInputElement>(null);

  const session = JSON.parse(sessionStorage.getItem("splitpal_session") || "{}");
  const isNight = session.mode === "night";
  const accentClass = isNight ? "bg-night text-night-foreground shadow-night/20" : "bg-primary text-primary-foreground shadow-primary/20";

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleScan = async () => {
    if (!preview) {
      console.warn("[scan] handleScan called without preview image");
      return;
    }

    const scanStartedAt = Date.now();
    console.log("[scan] Starting receipt scan", { previewLength: preview.length });

    setIsProcessing(true);
    setScanStatus("Reading your receipt…");
    setScanError(null);

    const statusMessages = ["Almost there…", "Just a moment more…", "Still working…"];
    let statusIndex = 0;
    const statusInterval = setInterval(() => {
      setScanStatus(statusMessages[Math.min(statusIndex, statusMessages.length - 1)]);
      statusIndex++;
    }, 10000);

    try {
      console.log("[scan] Invoking scan-receipt edge function", {
        payloadLength: preview.length,
      });

      const invokePromise = supabase.functions.invoke("scan-receipt", {
        body: { imageBase64: preview },
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Receipt scanning timed out — please try again")), 90000)
      );
      const { data: parsedData, error: fnError } = await Promise.race([invokePromise, timeoutPromise]) as any;

      const elapsedMs = Date.now() - scanStartedAt;
      console.log("[scan] Response received", { elapsedMs, parsedData, fnError });

      if (fnError) {
        throw new Error(fnError.message || String(fnError));
      }

      if (!parsedData || !Array.isArray(parsedData.items)) {
        throw new Error(`Unexpected response payload: ${JSON.stringify(parsedData)}`);
      }

      setScanStatus("Organising items…");

      const extracted: LineItem[] = parsedData.items.map((item: any, i: number) => ({
        id: `item-${i}-${Date.now()}`,
        name: item.name,
        price: item.price,
        quantity: item.quantity || 1,
        mismatch: item.mismatch || false,
        color: ITEM_COLORS[i % ITEM_COLORS.length],
      }));

      console.log("[scan] Parsed items successfully", {
        itemCount: extracted.length,
        elapsedMs: Date.now() - scanStartedAt,
      });

      setItems(extracted);
      setScanError(null);
      toast.success(`Found ${extracted.length} items on the receipt`);
    } catch (err: unknown) {
      const rawMessage = formatRawError(err);
      console.error("[scan] Scan failed", err);
      setScanError(`Raw error: ${rawMessage}`);
    } finally {
      setIsProcessing(false);
      setScanStatus("");
      console.log("[scan] Scan flow finished", { elapsedMs: Date.now() - scanStartedAt });
    }
  };

  const parsePriceInput = (val: string): number => {
    const cleaned = val.replace(/\s/g, '').replace(/,/g, '.');
    return parseFloat(cleaned) || 0;
  };

  const startEdit = (item: LineItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditPrice(item.price.toFixed(2));
    setEditQuantity(item.quantity);
  };

  const saveEdit = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, name: editName, price: parsePriceInput(editPrice), quantity: editQuantity, mismatch: false }
          : item
      )
    );
    setEditingId(null);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const addItem = () => {
    const newItem: LineItem = {
      id: `item-new-${Date.now()}`,
      name: "",
      price: 0.00,
      quantity: 1,
      color: ITEM_COLORS[items.length % ITEM_COLORS.length],
    };
    setItems((prev) => [...prev, newItem]);
    startEdit(newItem);
    setTimeout(() => newItemRef.current?.focus(), 50);
  };

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tipAmount = tipMode === "percent"
    ? subtotal * (parsePriceInput(tipValue)) / 100
    : parsePriceInput(tipValue);
  const total = subtotal + tipAmount;

  const hasMismatches = items.some((item) => item.mismatch);

  const handleContinue = async () => {
    const sessionData = JSON.parse(sessionStorage.getItem("splitpal_session") || "{}");
    const sessionType = isShareLink ? "share_link" : "pass_phone";

    // Determine host name from profile or guest storage
    const guestHost = (() => { try { return JSON.parse(safeStorage.getItem("splitpal_guest_host") || "null"); } catch { return null; } })();
    const hostDisplayName = profile?.display_name || guestHost?.display_name || "Host";
    const hostRevolut = profile?.revolut_username || guestHost?.revolut_username || "";

    try {
      // Create session in DB
      const { data: sessionRow, error: sessionError } = await supabase
        .from("sessions")
        .insert({
          mode: sessionData.mode || "bill",
          tip_amount: tipAmount,
          session_type: sessionType,
          host_user_id: user?.id || null,
        } as any)
        .select()
        .single();

      if (sessionError || !sessionRow) {
        console.error("Session create error:", sessionError);
        sessionStorage.setItem("splitpal_items", JSON.stringify({ items, tipAmount, total }));
        sessionStorage.setItem("splitpal_receipt_image", preview || "");
        navigate("/claim");
        return;
      }

      const sessionId = sessionRow.id;

      // Save session identity to localStorage
      saveIdentity({
        role: "host",
        displayName: hostDisplayName,
        sessionId,
        revolutUsername: hostRevolut,
      });

      if (isShareLink) {
        const hostName = hostDisplayName;
        await supabase.from("session_people").insert({
          session_id: sessionId,
          name: hostName,
          is_payer: true,
          sort_order: 0,
          user_id: user?.id || null,
        } as any);
      } else {
        // Pass phone mode: insert all people
        const peopleToInsert = (sessionData.people || []).map((p: any, i: number) => ({
          session_id: sessionId,
          name: p.name,
          is_payer: p.isPayer || false,
          sort_order: i,
        }));
        if (peopleToInsert.length > 0) {
          await supabase.from("session_people").insert(peopleToInsert);
        }
      }

      // Insert items
      const itemsToInsert = items.map((item, i) => ({
        session_id: sessionId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        color: item.color,
        sort_order: i,
      }));
      await supabase.from("session_items").insert(itemsToInsert);

      sessionStorage.setItem("splitpal_receipt_image", preview || "");
      navigate(`/claim?session=${sessionId}`);
    } catch (err) {
      console.error("Error saving session:", err);
      sessionStorage.setItem("splitpal_items", JSON.stringify({ items, tipAmount, total }));
      sessionStorage.setItem("splitpal_receipt_image", preview || "");
      navigate("/claim");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-xl bg-card flex items-center justify-center shadow-sm border border-border"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">
            {items.length > 0 ? "Review Items" : "Upload Receipt"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {items.length > 0 ? "Tap the pencil to edit any item" : "Snap or upload a photo of the bill"}
          </p>
        </div>
      </div>

      <div className="flex-1 px-4 pb-4 flex flex-col overflow-y-auto">
        {/* Upload area — only if no items extracted yet */}
        {items.length === 0 && !preview && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <div className="w-full max-w-sm space-y-4">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className={`w-full flex items-center gap-4 p-5 rounded-2xl ${accentClass} shadow-lg transition-all active:scale-[0.98]`}
              >
                <div className="w-12 h-12 rounded-xl bg-background/20 flex items-center justify-center">
                  <Camera className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <div className="font-display font-semibold text-lg">Take a Photo</div>
                  <div className="text-sm opacity-80">Use your camera to capture the receipt</div>
                </div>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-4 p-5 rounded-2xl bg-card border border-border text-foreground shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
              >
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                  <Image className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <div className="font-display font-semibold text-lg">Choose from Gallery</div>
                  <div className="text-sm text-muted-foreground">Select an existing photo</div>
                </div>
              </button>
            </div>

            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </motion.div>
        )}

        {/* Preview — before scan */}
        {items.length === 0 && preview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col">
            <div className="relative flex-1 rounded-2xl overflow-hidden border border-border bg-card mb-4">
              <img src={preview} alt="Receipt preview" className="w-full h-full object-contain" />
              <button
                onClick={() => { setPreview(null); setFileName(""); }}
                className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-card/90 backdrop-blur-sm border border-border text-sm font-medium text-foreground"
              >
                Change
              </button>
            </div>
            {fileName && <p className="text-sm text-muted-foreground text-center mb-4 truncate">{fileName}</p>}
          </motion.div>
        )}

        {/* Items list with receipt reference */}
        {items.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col">

            {/* Collapsible receipt image */}
            {preview && (
              <div className="mb-4 rounded-xl border border-border bg-card overflow-hidden">
                <button
                  onClick={() => setReceiptExpanded(!receiptExpanded)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground"
                >
                  <span className="font-display">📄 Receipt Photo</span>
                  {receiptExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                <AnimatePresence>
                  {receiptExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3">
                        <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
                          <img src={preview} alt="Receipt" className="w-full object-contain" />
                        </div>
                        {/* Color legend */}
                        <div className="flex flex-wrap gap-2 mt-3">
                          {items.map((item) => (
                            <div key={item.id} className="flex items-center gap-1.5">
                              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                              <span className="text-xs text-muted-foreground truncate max-w-[100px]">{item.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Mismatch warning */}
            {hasMismatches && (
              <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-accent/10 border border-accent/30">
                <AlertTriangle className="w-4 h-4 text-accent flex-shrink-0" />
                <p className="text-xs text-accent">Some items may have incorrect quantity/price splits. Review flagged items.</p>
              </div>
            )}

            <div className="space-y-2 mb-6">
              <AnimatePresence>
                {items.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className={`flex items-center gap-3 p-3 rounded-xl bg-card border ${item.mismatch ? "border-accent/50 bg-accent/5" : "border-border"}`}
                  >
                    {/* Color dot */}
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />

                    {editingId === item.id ? (
                      <>
                        <div className="flex-1 flex flex-col gap-2">
                          <input
                            ref={newItemRef}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Item name"
                            className="w-full bg-muted rounded-lg px-3 py-1.5 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">Qty</span>
                              <div className="flex items-center rounded-lg border border-border overflow-hidden">
                                <button
                                  onClick={() => setEditQuantity(Math.max(1, editQuantity - 1))}
                                  className="w-8 h-8 flex items-center justify-center bg-muted text-foreground active:bg-primary/10 transition-colors"
                                >
                                  −
                                </button>
                                {editingQtyInline === editingId ? (
                                  <input
                                    value={inlineQtyValue}
                                    onChange={(e) => setInlineQtyValue(e.target.value.replace(/\D/g, ""))}
                                    onBlur={() => {
                                      const v = parseInt(inlineQtyValue, 10);
                                      setEditQuantity(v >= 1 ? v : 1);
                                      setEditingQtyInline(null);
                                    }}
                                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    inputMode="numeric"
                                    autoFocus
                                    className="w-10 h-8 text-center text-sm font-medium text-foreground bg-background border-x border-border focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                ) : (
                                  <button
                                    onClick={() => { setEditingQtyInline(editingId); setInlineQtyValue(String(editQuantity)); }}
                                    className="w-8 h-8 flex items-center justify-center text-sm font-medium text-foreground bg-background cursor-text"
                                  >
                                    {editQuantity}
                                  </button>
                                )}
                                <button
                                  onClick={() => setEditQuantity(editQuantity + 1)}
                                  className="w-8 h-8 flex items-center justify-center bg-muted text-foreground active:bg-primary/10 transition-colors"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">€</span>
                              <input
                                value={editPrice}
                                onChange={(e) => setEditPrice(e.target.value)}
                                inputMode="decimal"
                                className="w-20 bg-muted rounded-lg px-2 py-1.5 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                        </div>
                        <button onClick={() => saveEdit(item.id)} className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Check className="w-4 h-4 text-primary" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                          <X className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {item.quantity > 1 && <span className="text-muted-foreground">{item.quantity}× </span>}
                            {item.name}
                          </p>
                          {item.quantity > 1 && (
                            <p className="text-xs text-muted-foreground">€{item.price.toFixed(2)} each</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {item.mismatch && <AlertTriangle className="w-3.5 h-3.5 text-accent" />}
                          <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                            €{(item.price * item.quantity).toFixed(2)}
                          </span>
                        </div>
                        <button onClick={() => startEdit(item)} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => removeItem(item.id)} className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Add item button */}
              <button
                onClick={addItem}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">Add item</span>
              </button>
            </div>

            {/* Tip section */}
            <div className="rounded-xl bg-card border border-border p-4 mb-4">
              <p className="text-sm font-display font-semibold text-foreground mb-3">Tip</p>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => { setTipMode("percent"); setNoTipActive(false); }}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${tipMode === "percent" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                  >
                    %
                  </button>
                  <button
                    onClick={() => { setTipMode("flat"); setNoTipActive(false); }}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${tipMode === "flat" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                  >
                    €
                  </button>
                </div>
                <div className="flex-1">
                  <input
                    inputMode="decimal"
                    value={tipValue}
                    onChange={(e) => { setTipValue(e.target.value); setNoTipActive(false); }}
                    placeholder={tipMode === "percent" ? "e.g. 10" : "e.g. 5.00"}
                    className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <button
                  onClick={() => { setTipValue("0"); setNoTipActive(true); }}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${
                    noTipActive
                      ? "bg-emerald-500 text-white border-emerald-500"
                      : "bg-muted border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  No tip
                </button>
              </div>
              {tipAmount > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Tip: €{tipAmount.toFixed(2)}
                </p>
              )}
            </div>

            {/* Totals */}
            <div className="rounded-xl bg-card border border-border p-4 mb-4">
              <div className="flex justify-between text-sm text-muted-foreground mb-1">
                <span>Subtotal</span>
                <span>€{subtotal.toFixed(2)}</span>
              </div>
              {tipAmount > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground mb-1">
                  <span>Tip</span>
                  <span>€{tipAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-display font-bold text-foreground pt-2 border-t border-border">
                <span>Total</span>
                <span>€{total.toFixed(2)}</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom buttons */}
      {preview && items.length === 0 && (
        <div className="px-4 pb-8 space-y-3">
          {/* Error banner with retry */}
          {scanError && !isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 flex items-start gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words">{scanError}</pre>
                <button
                  onClick={handleScan}
                  className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-primary active:scale-95 transition-transform"
                >
                  <RefreshCw className="w-4 h-4" /> Try again
                </button>
              </div>
            </motion.div>
          )}

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleScan}
            disabled={isProcessing}
            className={`w-full h-14 rounded-2xl font-display font-semibold text-lg shadow-lg transition-all flex items-center justify-center gap-2 ${accentClass}`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {scanStatus || "Scanning receipt…"}
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                {scanError ? "Retry Scan" : "Scan Receipt"}
              </>
            )}
          </motion.button>
        </div>
      )}

      {items.length > 0 && (
        <div className="px-4 pb-8">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleContinue}
            className={`w-full h-14 rounded-2xl font-display font-semibold text-lg shadow-lg transition-all flex items-center justify-center gap-2 ${accentClass}`}
          >
            Continue
          </motion.button>
        </div>
      )}
    </div>
  );
};

export default ReceiptUpload;
