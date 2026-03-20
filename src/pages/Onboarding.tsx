import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User, AtSign, ArrowRight, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const Onboarding = () => {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [revolutUsername, setRevolutUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = displayName.trim().length > 0 && revolutUsername.trim().length > 0;

  const handleSave = async () => {
    if (!user || !canSave) return;
    setSaving(true);
    setError(null);

    const username = revolutUsername.trim().replace(/^@/, "");

    try {
      // Try upsert first, fall back to insert if it fails
      const { error: upsertErr } = await supabase.from("profiles").upsert(
        {
          user_id: user.id,
          display_name: displayName.trim(),
          revolut_username: username,
        } as any,
        { onConflict: "user_id" }
      );

      if (upsertErr) {
        // Try a plain insert as fallback
        const { error: insertErr } = await supabase.from("profiles").insert({
          user_id: user.id,
          display_name: displayName.trim(),
          revolut_username: username,
        } as any);

        if (insertErr) {
          console.error("Profile save failed:", insertErr);
          setError(`Could not save profile: ${insertErr.message}`);
          setSaving(false);
          return;
        }
      }

      await refreshProfile();
      toast.success("Profile saved!");
      navigate("/");
    } catch (e: any) {
      console.error("Profile save exception:", e);
      setError(e?.message || "An unexpected error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="pt-16 pb-8 px-6 text-center">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Welcome to Split<span className="text-primary">Pal</span>
          </h1>
          <p className="mt-3 text-muted-foreground text-lg">Set up your profile to get started</p>
        </motion.div>
      </div>

      <div className="flex-1 px-6 max-w-md mx-auto w-full space-y-6">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">{error}</p>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <label className="text-sm font-medium text-foreground mb-2 block">Display Name</label>
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="w-full h-14 pl-12 pr-4 rounded-2xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-lg"
            />
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <label className="text-sm font-medium text-foreground mb-2 block">Revolut Username</label>
          <div className="relative">
            <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              value={revolutUsername}
              onChange={(e) => setRevolutUsername(e.target.value)}
              placeholder="your_revolut_tag"
              className="w-full h-14 pl-12 pr-4 rounded-2xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-lg"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">This will be used to generate payment request links</p>
        </motion.div>
      </div>

      <div className="px-6 pb-8 max-w-md mx-auto w-full">
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSave}
          disabled={!canSave || saving}
          className={`w-full h-14 rounded-2xl font-display font-semibold text-lg flex items-center justify-center gap-2 transition-all ${
            canSave ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground"
          }`}
        >
          {saving ? "Saving..." : "Get Started"}
          {!saving && <ArrowRight className="w-5 h-5" />}
        </motion.button>
      </div>
    </div>
  );
};

export default Onboarding;
