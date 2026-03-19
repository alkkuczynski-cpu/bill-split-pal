import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Check, Crown, ExternalLink, Share2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  quantity: number;
  shared_with: string[];
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

const Summary = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session");
  const { profile } = useAuth();

  const [people, setPeople] = useState<Person[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [tipAmount, setTipAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [revolutUsername, setRevolutUsername] = useState("");

  const parseSharedWith = (val: any): string[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      try { return JSON.parse(val); } catch { return []; }
    }
    return [];
  };

  useEffect(() => {
    const loadData = async () => {
      if (sessionId) {
        const [sessionRes, peopleRes, itemsRes, claimsRes] = await Promise.all([
          supabase.from("sessions").select("*").eq("id", sessionId).single(),
          supabase.from("session_people").select("*").eq("session_id", sessionId).order("sort_order"),
          supabase.from("session_items").select("*").eq("session_id", sessionId).order("sort_order"),
          supabase.from("item_claims").select("*").eq("session_id", sessionId),
        ]);
        if (sessionRes.data) {
          setTipAmount(sessionRes.data.tip_amount ?? 0);
          // Fetch host's revolut username
          const hostUserId = (sessionRes.data as any).host_user_id;
          if (hostUserId) {
            const { data: hostProfile } = await supabase
              .from("profiles")
              .select("revolut_username")
              .eq("user_id", hostUserId)
              .single();
            if (hostProfile) setRevolutUsername((hostProfile as any).revolut_username || "");
          }
        }
        // Use profile's revolut username as fallback
        if (profile?.revolut_username) setRevolutUsername((prev) => prev || profile.revolut_username);
        if (peopleRes.data) setPeople(peopleRes.data);
        if (itemsRes.data) setItems(itemsRes.data as Item[]);
        if (claimsRes.data) {
          setClaims(claimsRes.data.map((r: any) => ({
            id: r.id, item_id: r.item_id, person_id: r.person_id,
            quantity: r.quantity ?? 1, shared_with: parseSharedWith(r.shared_with),
          })));
        }
      } else {
        // Load from sessionStorage (host flow)
        const storedItems = sessionStorage.getItem("splitpal_items");
        const storedSession = sessionStorage.getItem("splitpal_session");
        const storedClaims = sessionStorage.getItem("splitpal_claims");
        if (storedItems && storedSession) {
          const { items: si, tipAmount: st } = JSON.parse(storedItems);
          const { people: sp } = JSON.parse(storedSession);
          setItems(si.map((item: any, i: number) => ({ ...item, sort_order: i })));
          setPeople(sp.map((p: any, i: number) => ({ ...p, sort_order: i })));
          setTipAmount(st ?? 0);
          if (storedClaims) setClaims(JSON.parse(storedClaims));
        }
      }
      setLoading(false);
    };
    loadData();
  }, [sessionId]);

  // ─── Compute per-person totals & itemised breakdown ───

  const payer = useMemo(() => people.find((p) => p.is_payer), [people]);

  const personBreakdown = useMemo(() => {
    const result: Record<string, { itemLines: { name: string; amount: number }[]; tip: number; total: number }> = {};
    people.forEach((p) => { result[p.id] = { itemLines: [], tip: 0, total: 0 }; });

    items.forEach((item) => {
      const itemClaims = claims.filter((c) => c.item_id === item.id);

      if (item.quantity === 1) {
        if (itemClaims.length > 0) {
          const share = item.price / itemClaims.length;
          itemClaims.forEach((c) => {
            if (result[c.person_id]) {
              result[c.person_id].itemLines.push({
                name: item.name + (itemClaims.length > 1 ? ` (1/${itemClaims.length})` : ""),
                amount: share,
              });
            }
          });
        }
      } else {
        // Accumulate per-person costs for this item
        const personCosts: Record<string, number> = {};
        itemClaims.forEach((c) => {
          if (!personCosts[c.person_id]) personCosts[c.person_id] = 0;
          personCosts[c.person_id] += item.price * c.quantity;
          if (c.shared_with.length > 0) {
            const sharers = [c.person_id, ...c.shared_with];
            const costPer = item.price / sharers.length;
            sharers.forEach((pid) => {
              if (!personCosts[pid]) personCosts[pid] = 0;
              personCosts[pid] += costPer;
            });
          }
        });
        Object.entries(personCosts).forEach(([pid, amount]) => {
          if (amount > 0 && result[pid]) {
            result[pid].itemLines.push({ name: item.name, amount });
          }
        });
      }
    });

    // Tip distribution
    const activePeople = people.filter((p) => {
      const lines = result[p.id]?.itemLines ?? [];
      return lines.reduce((s, l) => s + l.amount, 0) > 0;
    });
    if (activePeople.length > 0 && tipAmount > 0) {
      const tipPer = tipAmount / activePeople.length;
      activePeople.forEach((p) => { result[p.id].tip = tipPer; });
    }

    // Totals
    Object.keys(result).forEach((pid) => {
      const r = result[pid];
      r.total = r.itemLines.reduce((s, l) => s + l.amount, 0) + r.tip;
    });

    return result;
  }, [people, items, claims, tipAmount]);

  const billTotal = useMemo(() => items.reduce((s, i) => s + i.price * i.quantity, 0), [items]);
  const grandTotal = billTotal + tipAmount;

  const outstanding = useMemo(() => {
    if (!payer) return 0;
    return people
      .filter((p) => !p.is_payer)
      .reduce((s, p) => s + (personBreakdown[p.id]?.total ?? 0), 0);
  }, [people, payer, personBreakdown]);

  // ─── Share ───

  const handleShare = async () => {
    const lines = ["🧾 SplitPal — Here's who owes what:\n"];
    if (payer) {
      const payerData = personBreakdown[payer.id];
      lines.push(`${payer.name} (paid): €${payerData?.total.toFixed(2) ?? "0.00"} (own share)\n`);
    }
    people.filter((p) => !p.is_payer).forEach((p) => {
      const data = personBreakdown[p.id];
      if (data && data.total > 0) {
        lines.push(`${p.name}: €${data.total.toFixed(2)}`);
      }
    });
    lines.push(`\nTotal: €${grandTotal.toFixed(2)}`);
    const text = lines.join("\n");

    if (navigator.share) {
      try { await navigator.share({ text }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      // could toast here
    }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const payerData = payer ? personBreakdown[payer.id] : null;
  const others = people.filter((p) => !p.is_payer && (personBreakdown[p.id]?.total ?? 0) > 0);

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-lg border-b border-border px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-xl bg-card flex items-center justify-center shadow-sm border border-border"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="text-lg font-display font-bold text-foreground">Summary</h1>
      </div>

      <div className="px-4 pt-6 space-y-5 max-w-lg mx-auto">
        {/* Success banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-2xl bg-primary/10 border border-primary/20 px-5 py-4"
        >
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <Check className="w-5 h-5 text-primary-foreground" strokeWidth={3} />
          </div>
          <div>
            <p className="font-display font-bold text-foreground">All settled up!</p>
            <p className="text-xs text-muted-foreground">Every item has been claimed. Here's the breakdown.</p>
          </div>
        </motion.div>

        {/* Payer's own share */}
        {payer && payerData && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl bg-card border border-border shadow-sm p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                style={{ backgroundColor: AVATAR_COLORS[people.findIndex((p) => p.id === payer.id) % AVATAR_COLORS.length] }}
              >
                {getInitials(payer.name)}
              </div>
              <div className="flex-1">
                <p className="font-display font-bold text-foreground flex items-center gap-1.5">
                  {payer.name} <Crown className="w-3.5 h-3.5 text-accent" />
                </p>
                <p className="text-xs text-muted-foreground">Your share</p>
              </div>
              <span className="text-2xl font-display font-bold text-primary">
                €{payerData.total.toFixed(2)}
              </span>
            </div>
            <div className="space-y-1 border-t border-border pt-3">
              {payerData.itemLines.map((line, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{line.name}</span>
                  <span className="text-foreground">€{line.amount.toFixed(2)}</span>
                </div>
              ))}
              {payerData.tip > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tip</span>
                  <span className="text-foreground">€{payerData.tip.toFixed(2)}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Per-person cards */}
        {others.map((person, idx) => {
          const data = personBreakdown[person.id];
          if (!data) return null;
          const pIndex = people.findIndex((p) => p.id === person.id);
          const color = AVATAR_COLORS[pIndex % AVATAR_COLORS.length];
          const revolutLink = revolutUsername ? `https://revolut.me/${revolutUsername}/${data.total.toFixed(2)}` : null;

          return (
            <motion.div
              key={person.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + idx * 0.05 }}
              className="rounded-2xl bg-card border border-border shadow-sm p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {getInitials(person.name)}
                </div>
                <div className="flex-1">
                  <p className="font-display font-bold text-foreground">{person.name}</p>
                  <p className="text-xs text-muted-foreground">Owes {payer?.name ?? "payer"}</p>
                </div>
                <span className="text-xl font-display font-bold text-foreground">
                  €{data.total.toFixed(2)}
                </span>
              </div>

              {/* Itemised list */}
              <div className="space-y-1 border-t border-border pt-3">
                {data.itemLines.map((line, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{line.name}</span>
                    <span className="text-foreground">€{line.amount.toFixed(2)}</span>
                  </div>
                ))}
                {data.tip > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tip</span>
                    <span className="text-foreground">€{data.tip.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Revolut button */}
              <a
                href={revolutLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 w-full h-12 rounded-xl bg-[hsl(220,10%,13%)] text-white font-display font-semibold text-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
              >
                Request €{data.total.toFixed(2)} on Revolut
                <ExternalLink className="w-4 h-4" />
              </a>
            </motion.div>
          );
        })}

        {/* Overall total */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl bg-card border border-border shadow-sm p-5"
        >
          <p className="font-display font-bold text-foreground mb-3">Bill overview</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-foreground">€{billTotal.toFixed(2)}</span>
            </div>
            {tipAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tip</span>
                <span className="text-foreground">€{tipAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-display font-bold text-base pt-2 border-t border-border">
              <span className="text-foreground">Grand total</span>
              <span className="text-foreground">€{grandTotal.toFixed(2)}</span>
            </div>
            {outstanding > 0 && (
              <div className="flex justify-between text-primary font-semibold pt-1">
                <span>Outstanding</span>
                <span>€{outstanding.toFixed(2)}</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Share button */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleShare}
          className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-display font-semibold text-lg flex items-center justify-center gap-2"
        >
          <Share2 className="w-5 h-5" />
          Share summary
        </motion.button>
      </div>
    </div>
  );
};

export default Summary;
