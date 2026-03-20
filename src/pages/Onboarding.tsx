import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User, AtSign, ArrowRight, Check } from "lucide-react";
import { safeStorage } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const Onboarding = () => {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [revolutUsername, setRevolutUsername] = useState("");
  const [saved, setSaved] = useState(false);

  const canSave = displayName.trim().length > 0 && revolutUsername.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;

    const name = displayName.trim();
    const revolut = revolutUsername.trim().replace(/^@/, "");

    // Write to localStorage synchronously — no network calls, no blocking
    safeStorage.setItem(
      "splitpal_guest_host",
      JSON.stringify({ display_name: name, revolut_username: revolut })
    );

    setSaved(true);

    // Fire-and-forget: sync to DB if authenticated (never blocks the user)
    if (user) {
      supabase
        .from("profiles")
        .upsert(
          { user_id: user.id, display_name: name, revolut_username: revolut } as any,
          { onConflict: "user_id" }
        )
        .then(() => { refreshProfile().then(() => {}, () => {}); })
        .then(() => {}, () => {});
    }

    // Navigate home after a brief confirmation
    setTimeout(() => navigate("/"), 600);
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

      {saved ? (
        <div className="flex-1 flex items-center justify-center">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
              <Check className="w-8 h-8 text-primary-foreground" strokeWidth={3} />
            </div>
            <p className="font-display font-bold text-foreground text-lg">You're all set!</p>
          </motion.div>
        </div>
      ) : (
        <>
          <div className="flex-1 px-6 max-w-md mx-auto w-full space-y-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <label className="text-sm font-medium text-foreground mb-2 block">Display Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  autoFocus
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
              disabled={!canSave}
              className={`w-full h-14 rounded-2xl font-display font-semibold text-lg flex items-center justify-center gap-2 transition-all ${
                canSave ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground"
              }`}
            >
              Get Started
              <ArrowRight className="w-5 h-5" />
            </motion.button>
          </div>
        </>
      )}
    </div>
  );
};

export default Onboarding;
