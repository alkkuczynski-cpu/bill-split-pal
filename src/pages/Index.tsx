import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Receipt, Moon, ArrowRight, User, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { lovable } from "@/integrations/lovable/index";

const Index = () => {
  const navigate = useNavigate();
  const { user, profile, loading, needsOnboarding } = useAuth();

  const handleSplitBill = async () => {
    if (!user) {
      // Need to sign in first
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (error) console.error("Sign in error:", error);
      return;
    }
    if (needsOnboarding) {
      navigate("/onboarding");
      return;
    }
    navigate("/mode-select?mode=bill");
  };

  const handleNightOut = async () => {
    if (!user) {
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (error) console.error("Sign in error:", error);
      return;
    }
    if (needsOnboarding) {
      navigate("/onboarding");
      return;
    }
    navigate("/mode-select?mode=night");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Profile icon */}
      {user && profile && (
        <div className="absolute top-6 right-6 z-10">
          <button
            onClick={() => navigate("/profile")}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shadow-md"
          >
            {profile.display_name ? profile.display_name[0].toUpperCase() : <User className="w-5 h-5" />}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="pt-16 pb-8 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-display font-bold tracking-tight text-foreground">
            Split<span className="text-primary">Pal</span>
          </h1>
          <p className="mt-3 text-muted-foreground text-lg">
            Split bills fairly. No drama.
          </p>
        </motion.div>
      </div>

      {/* Illustration area */}
      <motion.div
        className="flex-1 flex items-center justify-center px-6 pb-8"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <div className="text-8xl animate-float select-none">🧾</div>
      </motion.div>

      {/* Action buttons */}
      <div className="px-6 pb-12 space-y-4 max-w-md mx-auto w-full">
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          onClick={handleSplitBill}
          className="w-full flex items-center gap-4 p-5 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-[0.98]"
        >
          <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
            <Receipt className="w-6 h-6" />
          </div>
          <div className="flex-1 text-left">
            <div className="font-display font-semibold text-lg">Split a Bill</div>
            <div className="text-sm opacity-80">One receipt, split between friends</div>
          </div>
          <ArrowRight className="w-5 h-5 opacity-70" />
        </motion.button>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          onClick={handleNightOut}
          className="w-full flex items-center gap-4 p-5 rounded-2xl bg-night text-night-foreground shadow-lg shadow-night/20 hover:shadow-xl hover:shadow-night/30 transition-all active:scale-[0.98]"
        >
          <div className="w-12 h-12 rounded-xl bg-night-foreground/20 flex items-center justify-center">
            <Moon className="w-6 h-6" />
          </div>
          <div className="flex-1 text-left">
            <div className="font-display font-semibold text-lg">Start a Night Out</div>
            <div className="text-sm opacity-80">Multiple receipts throughout the evening</div>
          </div>
          <ArrowRight className="w-5 h-5 opacity-70" />
        </motion.button>

        {!user && (
          <p className="text-center text-xs text-muted-foreground pt-2">
            Sign in with Google to start splitting
          </p>
        )}
      </div>
    </div>
  );
};

export default Index;
