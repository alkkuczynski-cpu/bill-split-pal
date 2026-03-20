import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, User, AtSign, LogOut, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { safeStorage } from "@/lib/storage";
import { clearIdentity } from "@/lib/sessionIdentity";
import { toast } from "sonner";

const ProfileEdit = () => {
  const navigate = useNavigate();
  const { profile, user, refreshProfile, signOut } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [revolutUsername, setRevolutUsername] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Pre-fill from auth profile or guest localStorage
    if (profile) {
      setDisplayName(profile.display_name || "");
      setRevolutUsername(profile.revolut_username || "");
    } else {
      const guest = (() => { try { return JSON.parse(safeStorage.getItem("splitpal_guest_host") || "null"); } catch { return null; } })();
      if (guest) {
        setDisplayName(guest.display_name || "");
        setRevolutUsername(guest.revolut_username || "");
      }
    }
  }, [profile]);

  const canSave = displayName.trim().length > 0 && revolutUsername.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;

    const name = displayName.trim();
    const revolut = revolutUsername.trim().replace(/^@/, "");

    // Synchronous localStorage write — never blocks
    safeStorage.setItem(
      "splitpal_guest_host",
      JSON.stringify({ display_name: name, revolut_username: revolut })
    );

    setSaved(true);

    // Fire-and-forget DB sync if authenticated
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

    setTimeout(() => navigate(-1), 600);
  };

  const handleSignOut = async () => {
    await signOut();
    safeStorage.removeItem("splitpal_guest_host");
    clearIdentity();
    sessionStorage.clear();
    navigate("/");
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-xl bg-card flex items-center justify-center shadow-sm border border-border">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="text-xl font-display font-bold text-foreground">Edit Profile</h1>
      </div>

      {saved ? (
        <div className="flex-1 flex items-center justify-center">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
              <Check className="w-8 h-8 text-primary-foreground" strokeWidth={3} />
            </div>
            <p className="font-display font-bold text-foreground text-lg">Profile updated!</p>
          </motion.div>
        </div>
      ) : (
        <div className="flex-1 px-4 max-w-md mx-auto w-full space-y-6 pt-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Display Name</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full h-14 pl-12 pr-4 rounded-2xl bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-lg" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Revolut Username</label>
            <div className="relative">
              <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input value={revolutUsername} onChange={(e) => setRevolutUsername(e.target.value)} className="w-full h-14 pl-12 pr-4 rounded-2xl bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-lg" />
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={!canSave}
            className={`w-full h-14 rounded-2xl font-display font-semibold text-lg transition-all ${
              canSave ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground"
            }`}
          >
            Save Changes
          </motion.button>

          <button onClick={handleSignOut} className="w-full flex items-center justify-center gap-2 py-3 text-sm text-destructive font-medium">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      )}
    </div>
  );
};

export default ProfileEdit;
