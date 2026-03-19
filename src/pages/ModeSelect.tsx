import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Users, Link2, ArrowRight } from "lucide-react";

const ModeSelect = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "bill";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => navigate("/")} className="w-10 h-10 rounded-xl bg-card flex items-center justify-center shadow-sm border border-border">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">How are you splitting?</h1>
          <p className="text-sm text-muted-foreground">Choose how guests will join</p>
        </div>
      </div>

      <div className="flex-1 flex items-center">
        <div className="px-6 space-y-4 max-w-md mx-auto w-full">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onClick={() => navigate(`/setup?mode=${mode}&type=pass_phone`)}
            className="w-full flex items-center gap-4 p-5 rounded-2xl bg-card border border-border shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-display font-semibold text-lg text-foreground">Pass the Phone</div>
              <div className="text-sm text-muted-foreground">Enter everyone's name yourself</div>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground" />
          </motion.button>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            onClick={() => {
              // Share link mode: skip name entry, go straight to upload
              sessionStorage.setItem("splitpal_session", JSON.stringify({ mode, people: [], sessionType: "share_link" }));
              navigate(`/upload?type=share_link`);
            }}
            className="w-full flex items-center gap-4 p-5 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl transition-all active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
              <Link2 className="w-6 h-6" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-display font-semibold text-lg">Share a Link</div>
              <div className="text-sm opacity-80">Guests join via a link you share</div>
            </div>
            <ArrowRight className="w-5 h-5 opacity-70" />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default ModeSelect;
