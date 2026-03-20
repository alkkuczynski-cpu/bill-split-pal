import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, X, Crown, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const SessionSetup = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "bill";
  const isNight = mode === "night";
  const { profile } = useAuth();

  // Get host display name from profile or guest host localStorage
  const getHostName = (): string => {
    if (profile?.display_name) return profile.display_name;
    try {
      const guest = localStorage.getItem("splitpal_guest_host");
      if (guest) {
        const parsed = JSON.parse(guest);
        return parsed.display_name || "";
      }
    } catch {}
    return "";
  };

  const hostName = getHostName();

  const [names, setNames] = useState<string[]>([hostName || ""]);
  const [payerIndex, setPayerIndex] = useState<number>(0);
  const [newName, setNewName] = useState("");

  // Update first name if profile loads after mount
  useEffect(() => {
    const name = getHostName();
    if (name && !names[0]) {
      setNames((prev) => [name, ...prev.slice(1)]);
    }
  }, [profile]);

  const addPerson = () => {
    if (newName.trim()) {
      setNames((prev) => [...prev, newName.trim()]);
      setNewName("");
    }
  };

  const removePerson = (index: number) => {
    setNames((prev) => prev.filter((_, i) => i !== index));
    if (payerIndex === index) setPayerIndex(0);
    else if (payerIndex > index) setPayerIndex(payerIndex - 1);
  };

  const updateName = (index: number, value: string) => {
    setNames((prev) => prev.map((n, i) => (i === index ? value : n)));
  };

  const validNames = names.filter((n) => n.trim().length > 0);
  const canProceed = validNames.length >= 2;

  const handleContinue = () => {
    const people = validNames.map((name, i) => ({
      name,
      isPayer: i === payerIndex,
    }));
    sessionStorage.setItem(
      "splitpal_session",
      JSON.stringify({ mode, people })
    );
    navigate("/upload");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button
          onClick={() => navigate("/")}
          className="w-10 h-10 rounded-xl bg-card flex items-center justify-center shadow-sm border border-border"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">
            {isNight ? "Night Out" : "Split a Bill"}
          </h1>
          <p className="text-sm text-muted-foreground">Who's at the table?</p>
        </div>
      </div>

      {/* People list */}
      <div className="flex-1 px-4 pb-4">
        <div className="space-y-3">
          <AnimatePresence>
            {names.map((name, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-3"
              >
                <button
                  onClick={() => setPayerIndex(index)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                    payerIndex === index
                      ? isNight
                        ? "bg-night text-night-foreground shadow-md shadow-night/20"
                        : "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "bg-card border border-border text-muted-foreground"
                  }`}
                  title="Set as payer"
                >
                  <Crown className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => updateName(index, e.target.value)}
                  placeholder={index === 0 ? "Your name (payer)" : `Person ${index + 1}`}
                  className="flex-1 h-12 px-4 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {names.length > 1 && (
                  <button
                    onClick={() => removePerson(index)}
                    className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Add person */}
        <div className="mt-4 flex items-center gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPerson()}
            placeholder="Add a person..."
            className="flex-1 h-12 px-4 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={addPerson}
            className={`w-12 h-12 rounded-xl flex items-center justify-center text-primary-foreground shrink-0 transition-all active:scale-95 ${
              isNight ? "bg-night" : "bg-primary"
            }`}
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Payer hint */}
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Crown className="w-4 h-4" />
          <span>
            Tap the crown to set who's paying.{" "}
            {validNames.length > 0 && (
              <span className="font-medium text-foreground">
                {validNames[payerIndex] || "No one"} is paying.
              </span>
            )}
          </span>
        </div>

        {/* People count */}
        {validNames.length > 0 && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>
              {validNames.length} {validNames.length === 1 ? "person" : "people"} at the table
            </span>
          </div>
        )}
      </div>

      {/* Continue button */}
      <div className="px-4 pb-8">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleContinue}
          disabled={!canProceed}
          className={`w-full h-14 rounded-2xl font-display font-semibold text-lg transition-all ${
            canProceed
              ? isNight
                ? "bg-night text-night-foreground shadow-lg shadow-night/20"
                : "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {canProceed ? "Continue" : "Add at least 2 people"}
        </motion.button>
      </div>
    </div>
  );
};

export default SessionSetup;
