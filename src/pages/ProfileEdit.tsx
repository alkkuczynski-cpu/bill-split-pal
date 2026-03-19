import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, User, AtSign, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const ProfileEdit = () => {
  const navigate = useNavigate();
  const { profile, user, refreshProfile, signOut } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [revolutUsername, setRevolutUsername] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setRevolutUsername(profile.revolut_username);
    }
  }, [profile]);

  const canSave = displayName.trim().length > 0 && revolutUsername.trim().length > 0;

  const handleSave = async () => {
    if (!user || !canSave) return;
    setSaving(true);
    const username = revolutUsername.trim().replace(/^@/, "");

    const { error } = await supabase.from("profiles").update({
      display_name: displayName.trim(),
      revolut_username: username,
    } as any).eq("user_id", user.id);

    if (error) {
      toast.error("Failed to update profile");
    } else {
      toast.success("Profile updated");
      await refreshProfile();
    }
    setSaving(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-xl bg-card flex items-center justify-center shadow-sm border border-border">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="text-xl font-display font-bold text-foreground">Edit Profile</h1>
      </div>

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
          disabled={!canSave || saving}
          className={`w-full h-14 rounded-2xl font-display font-semibold text-lg transition-all ${
            canSave ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground"
          }`}
        >
          {saving ? "Saving..." : "Save Changes"}
        </motion.button>

        <button onClick={handleSignOut} className="w-full flex items-center justify-center gap-2 py-3 text-sm text-destructive font-medium">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </div>
  );
};

export default ProfileEdit;
