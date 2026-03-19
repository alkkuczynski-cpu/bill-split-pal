import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Person { id: string; name: string; is_payer: boolean; sort_order: number; }
interface Item { id: string; name: string; price: number; quantity: number; color: string; sort_order: number; }
interface Claim { id: string; item_id: string; person_id: string; quantity: number; shared_with: string[]; }

const GuestSummary = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session");
  const guestPersonId = searchParams.get("person") || sessionStorage.getItem("splitpal_guest_person_id");

  const [people, setPeople] = useState<Person[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [tipAmount, setTipAmount] = useState(0);
  const [hostRevolutUsername, setHostRevolutUsername] = useState("");
  const [loading, setLoading] = useState(true);

  const parseSharedWith = (val: any): string[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
    return [];
  };

  useEffect(() => {
    if (!sessionId) return;
    const load = async () => {
      const [sessionRes, peopleRes, itemsRes, claimsRes] = await Promise.all([
        supabase.from("sessions").select("*").eq("id", sessionId).single(),
        supabase.from("session_people").select("*").eq("session_id", sessionId).order("sort_order"),
        supabase.from("session_items").select("*").eq("session_id", sessionId).order("sort_order"),
        supabase.from("item_claims").select("*").eq("session_id", sessionId),
      ]);

      if (sessionRes.data) {
        setTipAmount(Number(sessionRes.data.tip_amount) || 0);
        // Fetch host profile for revolut username
        if ((sessionRes.data as any).host_user_id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("revolut_username, display_name")
            .eq("user_id", (sessionRes.data as any).host_user_id)
            .single();
          if (profile) setHostRevolutUsername((profile as any).revolut_username || "");
        }
      }
      if (peopleRes.data) setPeople(peopleRes.data as Person[]);
      if (itemsRes.data) setItems(itemsRes.data as Item[]);
      if (claimsRes.data) {
        setClaims(claimsRes.data.map((r: any) => ({
          id: r.id, item_id: r.item_id, person_id: r.person_id,
          quantity: r.quantity ?? 1, shared_with: parseSharedWith(r.shared_with),
        })));
      }
      setLoading(false);
    };
    load();
  }, [sessionId]);

  const guest = useMemo(() => people.find((p) => p.id === guestPersonId), [people, guestPersonId]);
  const payer = useMemo(() => people.find((p) => p.is_payer), [people]);

  const breakdown = useMemo(() => {
    if (!guest) return { itemLines: [] as { name: string; amount: number }[], tip: 0, total: 0 };
    const result: { itemLines: { name: string; amount: number }[]; tip: number; total: number } = { itemLines: [], tip: 0, total: 0 };

    items.forEach((item) => {
      const itemClaims = claims.filter((c) => c.item_id === item.id);
      let personAmount = 0;

      if (item.quantity === 1) {
        if (itemClaims.some((c) => c.person_id === guest.id)) {
          personAmount = item.price / itemClaims.length;
        }
      } else {
        itemClaims.forEach((c) => {
          if (c.person_id === guest.id) personAmount += item.price * c.quantity;
          if (c.shared_with.length > 0) {
            const sharers = [c.person_id, ...c.shared_with];
            if (sharers.includes(guest.id)) personAmount += item.price / sharers.length;
          }
        });
      }

      if (personAmount > 0) {
        result.itemLines.push({ name: item.name, amount: personAmount });
      }
    });

    // Tip
    const activePeople = people.filter((p) => {
      let total = 0;
      items.forEach((item) => {
        const ic = claims.filter((c) => c.item_id === item.id);
        if (item.quantity === 1) {
          if (ic.some((c) => c.person_id === p.id)) total += item.price / ic.length;
        } else {
          ic.forEach((c) => {
            if (c.person_id === p.id) total += item.price * c.quantity;
            if (c.shared_with.length > 0 && [c.person_id, ...c.shared_with].includes(p.id))
              total += item.price / (1 + c.shared_with.length);
          });
        }
      });
      return total > 0;
    });

    if (activePeople.length > 0 && tipAmount > 0 && activePeople.some((p) => p.id === guest.id)) {
      result.tip = tipAmount / activePeople.length;
    }

    result.total = result.itemLines.reduce((s, l) => s + l.amount, 0) + result.tip;
    return result;
  }, [guest, items, claims, people, tipAmount]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!guest) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
        <p className="text-muted-foreground">Could not find your details.</p>
      </div>
    );
  }

  const revolutLink = hostRevolutUsername
    ? `https://revolut.me/${hostRevolutUsername}/${breakdown.total.toFixed(2)}`
    : null;

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="px-4 pt-8 space-y-5 max-w-lg mx-auto">
        {/* Success banner */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-2xl bg-primary/10 border border-primary/20 px-5 py-4">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <Check className="w-5 h-5 text-primary-foreground" strokeWidth={3} />
          </div>
          <div>
            <p className="font-display font-bold text-foreground">Bill finalised!</p>
            <p className="text-xs text-muted-foreground">Here's what you owe.</p>
          </div>
        </motion.div>

        {/* Your breakdown */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="rounded-2xl bg-card border border-border shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-display font-bold text-foreground text-lg">{guest.name}</p>
              <p className="text-xs text-muted-foreground">You owe {payer?.name ?? "the host"}</p>
            </div>
            <span className="text-3xl font-display font-bold text-primary">€{breakdown.total.toFixed(2)}</span>
          </div>

          <div className="space-y-1 border-t border-border pt-3">
            {breakdown.itemLines.map((line, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{line.name}</span>
                <span className="text-foreground">€{line.amount.toFixed(2)}</span>
              </div>
            ))}
            {breakdown.tip > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tip</span>
                <span className="text-foreground">€{breakdown.tip.toFixed(2)}</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Pay button */}
        {revolutLink && (
          <motion.a
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            href={revolutLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full h-14 rounded-2xl bg-[hsl(220,10%,13%)] text-white font-display font-semibold text-lg flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
          >
            Pay €{breakdown.total.toFixed(2)} on Revolut
            <ExternalLink className="w-5 h-5" />
          </motion.a>
        )}
      </div>
    </div>
  );
};

export default GuestSummary;
