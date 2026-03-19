import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Camera, Image, Upload, Loader2, Pencil, Check, X, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LineItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

const ReceiptUpload = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [tipValue, setTipValue] = useState("");
  const [tipMode, setTipMode] = useState<"percent" | "flat">("percent");

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
    if (!preview) return;
    setIsProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke("scan-receipt", {
        body: { imageBase64: preview },
      });

      if (error) {
        console.error("Scan error:", error);
        toast.error("Failed to scan receipt. Please try again.");
        setIsProcessing(false);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        setIsProcessing(false);
        return;
      }

      const extracted: LineItem[] = (data.items || []).map((item: any, i: number) => ({
        id: `item-${i}-${Date.now()}`,
        name: item.name,
        price: item.price,
        quantity: item.quantity || 1,
      }));

      setItems(extracted);
      toast.success(`Found ${extracted.length} items on the receipt`);
    } catch (err) {
      console.error("Scan error:", err);
      toast.error("Something went wrong scanning the receipt.");
    } finally {
      setIsProcessing(false);
    }
  };

  const startEdit = (item: LineItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditPrice(item.price.toFixed(2));
  };

  const saveEdit = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, name: editName, price: parseFloat(editPrice) || 0 } : item
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
      name: "New item",
      price: 0,
      quantity: 1,
    };
    setItems((prev) => [...prev, newItem]);
    startEdit(newItem);
  };

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tipAmount = tipMode === "percent"
    ? subtotal * (parseFloat(tipValue) || 0) / 100
    : parseFloat(tipValue) || 0;
  const total = subtotal + tipAmount;

  const handleContinue = () => {
    sessionStorage.setItem(
      "splitpal_items",
      JSON.stringify({ items, tipAmount, total })
    );
    navigate("/claim");
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

        {/* Items list */}
        {items.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col">
            <div className="space-y-2 mb-6">
              <AnimatePresence>
                {items.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border"
                  >
                    {editingId === item.id ? (
                      <>
                        <div className="flex-1 flex flex-col gap-2">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full bg-muted rounded-lg px-3 py-1.5 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Item name"
                          />
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-muted-foreground">€</span>
                            <input
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              type="number"
                              step="0.01"
                              className="w-24 bg-muted rounded-lg px-3 py-1.5 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                              placeholder="0.00"
                            />
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
                        </div>
                        <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                          €{(item.price * item.quantity).toFixed(2)}
                        </span>
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
                    onClick={() => setTipMode("percent")}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${tipMode === "percent" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                  >
                    %
                  </button>
                  <button
                    onClick={() => setTipMode("flat")}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${tipMode === "flat" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                  >
                    €
                  </button>
                </div>
                <div className="flex-1 relative">
                  <input
                    type="number"
                    step="0.01"
                    value={tipValue}
                    onChange={(e) => setTipValue(e.target.value)}
                    placeholder={tipMode === "percent" ? "e.g. 10" : "e.g. 5.00"}
                    className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
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
        <div className="px-4 pb-8">
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
                Scanning receipt...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Scan Receipt
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
