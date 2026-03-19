import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Crown, Check, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Person {
  id: string;
  name: string;
  is_payer: boolean;
  sort_order: number;
}

interface Item {
  id: string;
  name: string;
  price: number;
  quantity: number;
  color: string;
  sort_order: number;
}

interface Claim {
  id: string;
  item_id: string;
  person_id: string;
}

const AVATAR_COLORS = [
  "hsl(var(--primary))",
  "hsl(260, 60%, 55%)",
  "hsl(35, 90%, 55%)",
  "hsl(200, 70%, 50%)",
  "hsl(340, 65%, 50%)",
  "hsl(180, 55%, 42%)",
  "hsl(15, 75%, 50%)",
  "hsl(100, 50%, 42%)",
];

const ClaimItems = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session");

  const [people, setPeople] = useState<Person[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [tipAmount, setTipAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Load session data
  useEffect(() => {
    if (!sessionId) {
      // Fallback: try sessionStorage for local dev
      const stored = sessionStorage.getItem("splitpal_items");
      const sessionData = sessionStorage.getItem("splitpal_session");
      if (stored && sessionData) {
        const { items: storedItems, tipAmount: storedTip } = JSON.parse(stored);
        const { people: storedPeople } = JSON.parse(sessionData);
        setItems(storedItems.map((item: any, i: number) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          color: item.color,
          sort_order: i,
        })));
        setPeople(storedPeople.map((p: any, i: number) => ({
          id: `local-${i}`,
          name: p.name,
          is_payer: p.isPayer,
          sort_order: i,
        })));
        setTipAmount(storedTip || 0);
        setLoading(false);
      } else {
        toast.error("No session found");
        navigate("/");
      }
      return;
    }

    const fetchData = async () => {
      const [sessionRes, peopleRes, itemsRes, claimsRes] = await Promise.all([
        supabase.from("sessions").select("*").eq("id", sessionId).single(),
        supabase.from("session_people").select("*").eq("session_id", sessionId).order("sort_order"),
        supabase.from("session_items").select("*").eq("session_id", sessionId).order("sort_order"),
        supabase.from("item_claims").select("*").eq("session_id", sessionId),
      ]);

      if (sessionRes.error || !sessionRes.data) {
        toast.error("Session not found");
        navigate("/");
        return;
      }

      setTipAmount(Number(sessionRes.data.tip_amount) || 0);
      setPeople((peopleRes.data || []) as Person[]);
      setItems((itemsRes.data || []) as Item[]);
      setClaims((claimsRes.data || []) as Claim[]);
      setLoading(false);
    };

    fetchData();
  }, [sessionId, navigate]);

  // Realtime subscription for claims
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`claims-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "item_claims",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setClaims((prev) => [...prev, payload.new as Claim]);
          } else if (payload.eventType === "DELETE") {
            setClaims((prev) => prev.filter((c) => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const toggleClaim = async (itemId: string, personId: string) => {
    const existing = claims.find(
      (c) => c.item_id === itemId && c.person_id === personId
    );

    if (sessionId) {
      // DB mode
      if (existing) {
        await supabase.from("item_claims").delete().eq("id", existing.id);
      } else {
        await supabase.from("item_claims").insert({
          session_id: sessionId,
          item_id: itemId,
          person_id: personId,
        });
      }
    } else {
      // Local mode
      if (existing) {
        setClaims((prev) => prev.filter((c) => c.id !== existing.id));
      } else {
        setClaims((prev) => [
          ...prev,
          { id: `claim-${Date.now()}-${Math.random()}`, item_id: itemId, person_id: personId },
        ]);
      }
    }
  };

  // Compute per-person totals
  const personTotals = useMemo(() => {
    const totals: Record<string, { items: number; tip: number }> = {};

    people.forEach((p) => {
      totals[p.id] = { items: 0, tip: 0 };
    });

    items.forEach((item) => {
      const itemClaims = claims.filter((c) => c.item_id === item.id);
      if (itemClaims.length === 0) return;
      const sharePerPerson = (item.price * item.quantity) / itemClaims.length;
      itemClaims.forEach((c) => {
        if (totals[c.person_id]) {
          totals[c.person_id].items += sharePerPerson;
        }
      });
    });

    // Tip: split evenly among people with at least one claim
    const activePeople = people.filter((p) => totals[p.id]?.items > 0);
    if (activePeople.length > 0 && tipAmount > 0) {
      const tipPerPerson = tipAmount / activePeople.length;
      activePeople.forEach((p) => {
        totals[p.id].tip = tipPerPerson;
      });
    }

    return totals;
  }, [people, items, claims, tipAmount]);

  const claimedItemCount = useMemo(() => {
    return items.filter((item) => claims.some((c) => c.item_id === item.id)).length;
  }, [items, claims]);

  const allClaimed = claimedItemCount === items.length && items.length > 0;

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getItemClaimers = (itemId: string) => {
    return claims.filter((c) => c.item_id === itemId);
  };

  const handleContinue = () => {
    if (sessionId) {
      navigate(`/summary?session=${sessionId}`);
    } else {
      sessionStorage.setItem("splitpal_claims", JSON.stringify(claims));
      sessionStorage.setItem("splitpal_person_totals", JSON.stringify(personTotals));
      navigate("/summary");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-2">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-xl bg-card flex items-center justify-center shadow-sm border border-border"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">Claim Items</h1>
          <p className="text-sm text-muted-foreground">Tap your avatar to claim what you ordered</p>
        </div>
      </div>

      {/* Progress banner */}
      <div className="px-4 py-2">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            allClaimed
              ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30"
              : "bg-muted text-muted-foreground border border-border"
          }`}
        >
          <Check className={`w-4 h-4 ${allClaimed ? "text-emerald-600" : ""}`} />
          <span>
            {allClaimed
              ? "All items claimed!"
              : `${claimedItemCount} of ${items.length} items claimed`}
          </span>
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 px-4 pb-4 overflow-y-auto">
        <div className="space-y-2 mb-6">
          <AnimatePresence>
            {items.map((item) => {
              const itemClaimers = getItemClaimers(item.id);
              const splitCount = itemClaimers.length;
              const totalPrice = item.price * item.quantity;
              const splitPrice = splitCount > 0 ? totalPrice / splitCount : 0;

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-card border border-border"
                >
                  {/* Item info */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.quantity > 1 && (
                            <span className="text-muted-foreground">{item.quantity}× </span>
                          )}
                          {item.name}
                        </p>
                        {item.quantity > 1 && (
                          <p className="text-xs text-muted-foreground">
                            €{item.price.toFixed(2)} each
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-foreground whitespace-nowrap ml-2">
                      €{totalPrice.toFixed(2)}
                    </span>
                  </div>

                  {/* Person avatars */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {people.map((person, pi) => {
                      const isClaimed = itemClaimers.some(
                        (c) => c.person_id === person.id
                      );
                      const avatarColor = AVATAR_COLORS[pi % AVATAR_COLORS.length];

                      return (
                        <button
                          key={person.id}
                          onClick={() => toggleClaim(item.id, person.id)}
                          className={`relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                            isClaimed
                              ? "text-white shadow-sm"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                          style={
                            isClaimed
                              ? { backgroundColor: avatarColor }
                              : undefined
                          }
                        >
                          {person.is_payer && (
                            <Crown className="w-3 h-3 flex-shrink-0" style={{ color: isClaimed ? "white" : "hsl(45, 85%, 50%)" }} />
                          )}
                          <span className="truncate max-w-[60px]">{person.name}</span>
                          {isClaimed && <Check className="w-3 h-3 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Split info */}
                  {splitCount > 1 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Split {splitCount} ways — €{splitPrice.toFixed(2)} each
                    </p>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Per-person totals */}
        <div className="rounded-xl bg-card border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-display font-semibold text-foreground">Everyone's Share</p>
          </div>

          <div className="space-y-3">
            {people.map((person, pi) => {
              const totals = personTotals[person.id] || { items: 0, tip: 0 };
              const total = totals.items + totals.tip;
              const isActive = totals.items > 0;
              const avatarColor = AVATAR_COLORS[pi % AVATAR_COLORS.length];

              return (
                <div
                  key={person.id}
                  className={`flex items-center justify-between transition-opacity ${
                    isActive ? "opacity-100" : "opacity-40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold relative"
                      style={{ backgroundColor: isActive ? avatarColor : "hsl(var(--muted))" }}
                    >
                      {getInitials(person.name)}
                      {person.is_payer && (
                        <Crown
                          className="absolute -top-1 -right-1 w-3.5 h-3.5"
                          style={{ color: "hsl(45, 85%, 50%)" }}
                        />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{person.name}</p>
                      {isActive && totals.tip > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Items €{totals.items.toFixed(2)} + Tip €{totals.tip.toFixed(2)}
                        </p>
                      )}
                      {!isActive && (
                        <p className="text-xs text-muted-foreground">No items claimed</p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      isActive ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    €{total.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Grand total */}
          <div className="flex justify-between text-base font-display font-bold text-foreground pt-3 mt-3 border-t border-border">
            <span>Total</span>
            <span>
              €{(items.reduce((s, i) => s + i.price * i.quantity, 0) + tipAmount).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Continue button */}
      <div className="px-4 pb-8">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleContinue}
          disabled={!allClaimed}
          className={`w-full h-14 rounded-2xl font-display font-semibold text-lg transition-all flex items-center justify-center gap-2 ${
            allClaimed
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {allClaimed ? "Continue" : `Claim all ${items.length - claimedItemCount} remaining`}
        </motion.button>
      </div>
    </div>
  );
};

export default ClaimItems;
