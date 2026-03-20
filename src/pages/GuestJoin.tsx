import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { User, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { saveIdentity } from "@/lib/sessionIdentity";

const GuestJoin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session");

  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [sessionExists, setSessionExists] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(false);
  const [hasItems, setHasItems] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    const check = async () => {
      const { data } = await supabase.from("sessions").select("id, locked, session_type").eq("id", sessionId).single();
      if (!data) {
        setSessionExists(false);
        return;
      }
      setSessionExists(true);
      setLocked(data.locked);

      // Check if items exist
      const { count } = await supabase.from("session_items").select("id", { count: "exact", head: true }).eq("session_id", sessionId);
      setHasItems((count ?? 0) > 0);
    };
    check();
  }, [sessionId]);

  const handleJoin = async () => {
    if (!sessionId || !name.trim()) return;
    setJoining(true);

    // Get current max sort_order
    const { data: existing } = await supabase
      .from("session_people")
      .select("sort_order")
      .eq("session_id", sessionId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

    const { data: person, error } = await supabase
      .from("session_people")
      .insert({ session_id: sessionId, name: name.trim(), is_payer: false, sort_order: nextOrder })
      .select()
      .single();

    if (error || !person) {
      toast.error("Failed to join session");
      setJoining(false);
      return;
    }

    // Store guest identity
    sessionStorage.setItem("splitpal_guest_person_id", person.id);
    sessionStorage.setItem("splitpal_guest_name", name.trim());
    saveIdentity({
      role: "guest",
      displayName: name.trim(),
      sessionId: sessionId!,
      personId: person.id,
    });

    if (hasItems) {
      navigate(`/claim?session=${sessionId}&guest=true`);
    } else {
      navigate(`/waiting?session=${sessionId}`);
    }
  };

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Invalid session link</p>
      </div>
    );
  }

  if (sessionExists === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!sessionExists) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-6xl mb-4">🔍</p>
          <p className="text-lg font-display font-bold text-foreground">Session not found</p>
          <p className="text-sm text-muted-foreground mt-2">This link may have expired or is invalid.</p>
        </div>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-6xl mb-4">🔒</p>
          <p className="text-lg font-display font-bold text-foreground">Session is closed</p>
          <p className="text-sm text-muted-foreground mt-2">The host has already finalised the bill.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="pt-16 pb-8 px-6 text-center">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-5xl mb-4">🧾</p>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Join Split<span className="text-primary">Pal</span>
          </h1>
          <p className="mt-3 text-muted-foreground text-lg">Enter your name to join this bill</p>
        </motion.div>
      </div>

      <div className="flex-1 flex items-start justify-center px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="w-full max-w-md">
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="Your name"
              autoFocus
              className="w-full h-14 pl-12 pr-4 rounded-2xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-lg"
            />
          </div>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleJoin}
            disabled={!name.trim() || joining}
            className={`mt-4 w-full h-14 rounded-2xl font-display font-semibold text-lg flex items-center justify-center gap-2 transition-all ${
              name.trim() ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground"
            }`}
          >
            {joining ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Join Bill <ArrowRight className="w-5 h-5" /></>}
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
};

export default GuestJoin;
