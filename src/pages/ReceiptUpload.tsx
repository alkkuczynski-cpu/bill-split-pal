import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Camera, Image, Upload, Loader2 } from "lucide-react";

const ReceiptUpload = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  const session = JSON.parse(
    sessionStorage.getItem("splitpal_session") || "{}"
  );
  const isNight = session.mode === "night";

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
    // Simulating processing for now — will connect to Lovable AI later
    setTimeout(() => {
      setIsProcessing(false);
      // Navigate to items screen (to be built)
      navigate("/");
    }, 2000);
  };

  const accentClass = isNight ? "bg-night text-night-foreground shadow-night/20" : "bg-primary text-primary-foreground shadow-primary/20";

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
            Upload Receipt
          </h1>
          <p className="text-sm text-muted-foreground">
            Snap or upload a photo of the bill
          </p>
        </div>
      </div>

      <div className="flex-1 px-4 pb-4 flex flex-col">
        {/* Upload area */}
        {!preview ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <div className="w-full max-w-sm space-y-4">
              {/* Camera button */}
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

              {/* Gallery button */}
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

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </motion.div>
        ) : (
          /* Preview */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col"
          >
            <div className="relative flex-1 rounded-2xl overflow-hidden border border-border bg-card mb-4">
              <img
                src={preview}
                alt="Receipt preview"
                className="w-full h-full object-contain"
              />
              <button
                onClick={() => {
                  setPreview(null);
                  setFileName("");
                }}
                className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-card/90 backdrop-blur-sm border border-border text-sm font-medium text-foreground"
              >
                Change
              </button>
            </div>
            {fileName && (
              <p className="text-sm text-muted-foreground text-center mb-4 truncate">
                {fileName}
              </p>
            )}
          </motion.div>
        )}
      </div>

      {/* Scan button */}
      {preview && (
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
    </div>
  );
};

export default ReceiptUpload;
