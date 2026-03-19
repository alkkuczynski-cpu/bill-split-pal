import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const WaitingRoom = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session");
  const [dots, setDots] = useState("");

  // Animate dots
  useEffect(() => {
    const iv = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 500);
    return () => clearInterval(iv);
  }, []);

  // Poll for items
  useEffect(() => {
    if (!sessionId) return;

    const checkItems = async () => {
      const { count } = await supabase
        .from("session_items")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId);
      if ((count ?? 0) > 0) {
        navigate(`/claim?session=${sessionId}&guest=true`, { replace: true });
      }
    };

    checkItems();
    const iv = setInterval(checkItems, 3000);
    return () => clearInterval(iv);
  }, [sessionId, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="text-6xl mb-6 animate-float select-none">📸</div>
        <h1 className="text-2xl font-display font-bold text-foreground">Waiting for the receipt{dots}</h1>
        <p className="mt-3 text-muted-foreground">The host is scanning the receipt. You'll be taken to the claim screen automatically.</p>
        <div className="mt-8">
          <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
        </div>
      </motion.div>
    </div>
  );
};

export default WaitingRoom;
