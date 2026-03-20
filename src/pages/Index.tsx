import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Receipt, Moon, ArrowRight, User, Loader2, AlertCircle, RefreshCw, LogOut, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { lovable } from "@/integrations/lovable/index";
import { safeStorage } from "@/lib/storage";
import { clearIdentity } from "@/lib/sessionIdentity";
import { toast } from "sonner";

const AUTH_TIMEOUT_MS = 10_000;

/** Read guest host profile from localStorage */
const readGuestHost = () => {
  const raw = safeStorage.getItem("splitpal_guest_host");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

const Index = () => {
  const navigate = useNavigate();
  const { user, profile, loading, needsOnboarding, signOut } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const [showGuestFallback, setShowGuestFallback] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestRevolut, setGuestRevolut] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const menuRef = useRef<HTMLDivElement>(null);

  // Re-read on each render so it picks up changes
  const guestHost = readGuestHost();
  const displayProfile = profile || guestHost;
  const hasProfile = !!displayProfile;
  const isAuthenticated = !!user || !!guestHost;

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!profileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileMenuOpen]);

  const attemptGoogleSignIn = async () => {
    setSigningIn(true);
    setAuthTimedOut(false);
    timeoutRef.current = setTimeout(() => {
      setAuthTimedOut(true);
      setSigningIn(false);
    }, AUTH_TIMEOUT_MS);

    try {
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (error) {
        clearTimeout(timeoutRef.current);
        setSigningIn(false);
        setAuthTimedOut(true);
        toast.error("Google sign-in failed. Try again or continue as guest.");
      }
    } catch (e) {
      clearTimeout(timeoutRef.current);
      setSigningIn(false);
      setAuthTimedOut(true);
      toast.error("Google sign-in failed. Try again or continue as guest.");
      console.error("Sign in exception:", e);
    }
  };

  const handleGuestHostSave = () => {
    const name = guestName.trim();
    const revolut = guestRevolut.trim().replace(/^@/, "");
    if (!name || !revolut) return;
    safeStorage.setItem("splitpal_guest_host", JSON.stringify({ display_name: name, revolut_username: revolut }));
    setShowGuestFallback(false);
    setAuthTimedOut(false);
    setProfileMenuOpen(false);
    toast.success("Profile saved!");
    // Force re-render by navigating to same page
    navigate("/", { replace: true });
    window.location.reload();
  };

  const handleSignOut = async () => {
    setProfileMenuOpen(false);
    await signOut();
    safeStorage.removeItem("splitpal_guest_host");
    clearIdentity();
    sessionStorage.clear();
    toast.success("Signed out");
    window.location.reload();
  };

  const handleEditProfile = () => {
    setProfileMenuOpen(false);
    if (user) {
      navigate("/profile");
    } else {
      setGuestName(guestHost?.display_name || "");
      setGuestRevolut(guestHost?.revolut_username || "");
      setShowGuestFallback(true);
    }
  };

  const handleAction = async (targetMode: string) => {
    // Check localStorage synchronously — this is the source of truth
    const localProfile = readGuestHost();
    const hasLocalProfile = localProfile?.display_name && localProfile?.revolut_username;
    const hasAuthProfile = profile?.display_name && profile?.revolut_username;

    if (!isAuthenticated && !hasLocalProfile) {
      await attemptGoogleSignIn();
      return;
    }
    if (!hasLocalProfile && !hasAuthProfile) {
      navigate("/onboarding");
      return;
    }
    navigate(`/mode-select?mode=${targetMode}`);
  };

  // Derive initials for the profile icon
  const profileInitial = displayProfile?.display_name
    ? displayProfile.display_name[0].toUpperCase()
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Profile menu — always show if we have any profile data */}
      {hasProfile && (
        <div className="absolute top-6 right-6 z-30" ref={menuRef}>
          <button
            onClick={() => setProfileMenuOpen((p) => !p)}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shadow-md active:scale-95 transition-transform"
          >
            {profileInitial || <User className="w-5 h-5" />}
          </button>

          {profileMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-card border border-border shadow-lg overflow-hidden z-40">
              {/* User info */}
              <div className="px-4 py-3 border-b border-border">
                <p className="font-display font-bold text-foreground text-sm truncate">
                  {displayProfile?.display_name || "User"}
                </p>
                {displayProfile?.revolut_username && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    @{displayProfile.revolut_username}
                  </p>
                )}
              </div>
              {/* Actions */}
              <button
                onClick={handleEditProfile}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted/50 transition-colors active:bg-muted"
              >
                <Pencil className="w-4 h-4 text-muted-foreground" />
                Edit profile
              </button>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-destructive hover:bg-destructive/5 transition-colors active:bg-destructive/10 border-t border-border"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="pt-16 pb-8 px-6 text-center">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-4xl font-display font-bold tracking-tight text-foreground">
            Split<span className="text-primary">Pal</span>
          </h1>
          <p className="mt-3 text-muted-foreground text-lg">Split bills fairly. No drama.</p>
        </motion.div>
      </div>

      {/* Illustration */}
      <motion.div
        className="flex-1 flex items-center justify-center px-6 pb-8"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <div className="text-8xl animate-float select-none">🧾</div>
      </motion.div>

      {/* Signing in overlay */}
      <AnimatePresence>
        {signingIn && !authTimedOut && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4"
          >
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-foreground font-display font-semibold">Signing in with Google…</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth timeout banner */}
      <AnimatePresence>
        {authTimedOut && !showGuestFallback && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="px-6 pb-4 max-w-md mx-auto w-full"
          >
            <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Google sign-in didn't respond</p>
                  <p className="text-xs text-muted-foreground mt-1">This can happen in preview mode or with pop-up blockers.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={attemptGoogleSignIn}
                  className="flex-1 h-10 rounded-xl bg-card border border-border text-foreground text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
                >
                  <RefreshCw className="w-4 h-4" /> Retry
                </button>
                <button
                  onClick={() => { setShowGuestFallback(true); setAuthTimedOut(false); }}
                  className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center active:scale-[0.97] transition-transform"
                >
                  Continue as guest
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Guest host fallback form */}
      <AnimatePresence>
        {showGuestFallback && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="px-6 pb-4 max-w-md mx-auto w-full"
          >
            <div className="rounded-2xl bg-card border border-border shadow-sm p-5 space-y-4">
              <div>
                <p className="font-display font-bold text-foreground">Quick setup</p>
                <p className="text-xs text-muted-foreground mt-1">Enter your details to start splitting</p>
              </div>
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Your name"
                className="w-full h-12 px-4 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                value={guestRevolut}
                onChange={(e) => setGuestRevolut(e.target.value)}
                placeholder="Revolut username (e.g. @yourname)"
                className="w-full h-12 px-4 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowGuestFallback(false)}
                  className="flex-1 h-11 rounded-xl bg-muted text-muted-foreground text-sm font-semibold active:scale-[0.97] transition-transform"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGuestHostSave}
                  disabled={!guestName.trim() || !guestRevolut.trim()}
                  className={`flex-1 h-11 rounded-xl text-sm font-semibold active:scale-[0.97] transition-all ${
                    guestName.trim() && guestRevolut.trim()
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  Save & continue
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <div className="px-6 pb-12 space-y-4 max-w-md mx-auto w-full">
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          onClick={() => handleAction("bill")}
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
          onClick={() => handleAction("night")}
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

        {!isAuthenticated && !loading && (
          <p className="text-center text-xs text-muted-foreground pt-2">
            Sign in with Google to start splitting
          </p>
        )}
      </div>
    </div>
  );
};

export default Index;
