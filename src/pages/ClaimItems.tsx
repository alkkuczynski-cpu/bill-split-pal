import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Crown, Check, Users, ChevronDown, ChevronUp,
  Minus, Plus, AlertTriangle, Share2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

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

const ClaimItems = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session");

  const [people, setPeople] = useState<Person[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [tipAmount, setTipAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [receiptExpanded, setReceiptExpanded] = useState(false);

  // Assignment panel
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelItemId, setPanelItemId] = useState<string | null>(null);
  const [panelPersonId, setPanelPersonId] = useState<string | null>(null);
  const [panelQty, setPanelQty] = useState(1);
  const [panelSharedWith, setPanelSharedWith] = useState<string[]>([]);

  // Long-press
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  // Parse shared_with from DB row
  const parseSharedWith = (val: any): string[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      try { return JSON.parse(val); } catch { return []; }
    }
    return [];
  };

  const claimFromRow = (row: any): Claim => ({
    id: row.id,
    item_id: row.item_id,
    person_id: row.person_id,
    quantity: row.quantity ?? 1,
    shared_with: parseSharedWith(row.shared_with),
  });

  // Load session data
  useEffect(() => {
    const storedImage = sessionStorage.getItem("splitpal_receipt_image");
    if (storedImage) setReceiptImage(storedImage);

    if (!sessionId) {
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
      setClaims((claimsRes.data || []).map(claimFromRow));
      setLoading(false);
    };

    fetchData();
  }, [sessionId, navigate]);

  // Realtime subscription
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`claims-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "item_claims", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newClaim = claimFromRow(payload.new);
            setClaims((prev) => {
              if (prev.some((c) => c.id === newClaim.id)) return prev;
              const filtered = prev.filter(
                (c) => !(c.id.startsWith("temp-") && c.item_id === newClaim.item_id && c.person_id === newClaim.person_id)
              );
              return [...filtered, newClaim];
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = claimFromRow(payload.new);
            setClaims((prev) =>
              prev.map((c) => c.id === updated.id ? updated : c)
            );
          } else if (payload.eventType === "DELETE") {
            setClaims((prev) => prev.filter((c) => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  // Toggle claim (simple tap - for single-unit items or initial claim on multi-unit)
  const toggleClaim = async (itemId: string, personId: string) => {
    const existing = claims.find((c) => c.item_id === itemId && c.person_id === personId);

    if (sessionId) {
      if (existing) {
        setClaims((prev) => prev.filter((c) => c.id !== existing.id));
        const { error } = await supabase.from("item_claims").delete().eq("id", existing.id);
        if (error) setClaims((prev) => [...prev, existing]);
      } else {
        const tempId = `temp-${Date.now()}-${Math.random()}`;
        const optimistic: Claim = { id: tempId, item_id: itemId, person_id: personId, quantity: 1, shared_with: [] };
        setClaims((prev) => [...prev, optimistic]);
        const { data, error } = await supabase
          .from("item_claims")
          .insert({ session_id: sessionId, item_id: itemId, person_id: personId, quantity: 1, shared_with: [] } as any)
          .select()
          .single();
        if (error) {
          setClaims((prev) => prev.filter((c) => c.id !== tempId));
        } else if (data) {
          setClaims((prev) => prev.map((c) => c.id === tempId ? claimFromRow(data) : c));
        }
      }
    } else {
      if (existing) {
        setClaims((prev) => prev.filter((c) => c.id !== existing.id));
      } else {
        setClaims((prev) => [
          ...prev,
          { id: `claim-${Date.now()}-${Math.random()}`, item_id: itemId, person_id: personId, quantity: 1, shared_with: [] },
        ]);
      }
    }
  };

  // Open assignment panel for multi-unit items
  const openPanel = (itemId: string, personId: string) => {
    const existing = claims.find((c) => c.item_id === itemId && c.person_id === personId);
    setPanelItemId(itemId);
    setPanelPersonId(personId);
    setPanelQty(existing?.quantity ?? 1);
    setPanelSharedWith(existing?.shared_with ?? []);
    setPanelOpen(true);
  };

  // Confirm panel changes
  const confirmPanel = async () => {
    if (!panelItemId || !panelPersonId) return;
    const existing = claims.find((c) => c.item_id === panelItemId && c.person_id === panelPersonId);

    const newClaim: Partial<Claim> = {
      item_id: panelItemId,
      person_id: panelPersonId,
      quantity: panelQty,
      shared_with: panelSharedWith,
    };

    if (sessionId) {
      if (existing) {
        // Optimistic update
        setClaims((prev) => prev.map((c) =>
          c.id === existing.id ? { ...c, quantity: panelQty, shared_with: panelSharedWith } : c
        ));
        const { error } = await supabase
          .from("item_claims")
          .update({ quantity: panelQty, shared_with: panelSharedWith } as any)
          .eq("id", existing.id);
        if (error) {
          setClaims((prev) => prev.map((c) => c.id === existing.id ? existing : c));
          toast.error("Failed to update claim");
        }
      } else {
        // Create new claim
        const tempId = `temp-${Date.now()}-${Math.random()}`;
        const optimistic: Claim = { id: tempId, ...newClaim } as Claim;
        setClaims((prev) => [...prev, optimistic]);
        const { data, error } = await supabase
          .from("item_claims")
          .insert({ session_id: sessionId, ...newClaim } as any)
          .select()
          .single();
        if (error) {
          setClaims((prev) => prev.filter((c) => c.id !== tempId));
          toast.error("Failed to create claim");
        } else if (data) {
          setClaims((prev) => prev.map((c) => c.id === tempId ? claimFromRow(data) : c));
        }
      }
    } else {
      if (existing) {
        setClaims((prev) => prev.map((c) =>
          c.id === existing.id ? { ...c, quantity: panelQty, shared_with: panelSharedWith } : c
        ));
      } else {
        setClaims((prev) => [
          ...prev,
          { id: `claim-${Date.now()}-${Math.random()}`, ...newClaim } as Claim,
        ]);
      }
    }

    setPanelOpen(false);
  };

  // Long-press handlers
  const handlePointerDown = (itemId: string, personId: string, isMultiUnit: boolean) => {
    longPressTriggered.current = false;
    if (!isMultiUnit) return;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      openPanel(itemId, personId);
    }, 400);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleAvatarClick = (itemId: string, personId: string, isMultiUnit: boolean) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    // For multi-unit items: if already claimed, open panel. If not, toggle claim.
    if (isMultiUnit) {
      const existing = claims.find((c) => c.item_id === itemId && c.person_id === personId);
      if (existing) {
        openPanel(itemId, personId);
        return;
      }
    }
    toggleClaim(itemId, personId);
  };

  // Compute per-item info
  const itemClaimInfo = useMemo(() => {
    const info: Record<string, { totalUnits: number; overClaimed: boolean; remaining: number }> = {};
    items.forEach((item) => {
      const itemClaims = claims.filter((c) => c.item_id === item.id);
      const soloUnits = itemClaims.reduce((s, c) => s + c.quantity, 0);
      const sharedUnits = itemClaims.filter((c) => c.shared_with.length > 0).length;
      const totalUnits = soloUnits + sharedUnits;
      info[item.id] = {
        totalUnits,
        overClaimed: totalUnits > item.quantity,
        remaining: item.quantity - totalUnits,
      };
    });
    return info;
  }, [items, claims]);

  // Compute per-person totals
  const personTotals = useMemo(() => {
    const totals: Record<string, { items: number; tip: number }> = {};
    people.forEach((p) => { totals[p.id] = { items: 0, tip: 0 }; });

    items.forEach((item) => {
      const itemClaims = claims.filter((c) => c.item_id === item.id);
      const unitPrice = item.price;

      if (item.quantity === 1) {
        // Single-unit: split equally among all claimers
        if (itemClaims.length > 0) {
          const share = (unitPrice * item.quantity) / itemClaims.length;
          itemClaims.forEach((c) => {
            if (totals[c.person_id]) totals[c.person_id].items += share;
          });
        }
      } else {
        // Multi-unit: solo units + shared units
        itemClaims.forEach((c) => {
          if (totals[c.person_id]) {
            totals[c.person_id].items += unitPrice * c.quantity;
          }
          // Shared unit: split 1 unit among initiator + shared_with
          if (c.shared_with.length > 0) {
            const sharers = [c.person_id, ...c.shared_with];
            const costPerPerson = unitPrice / sharers.length;
            sharers.forEach((pid) => {
              if (totals[pid]) totals[pid].items += costPerPerson;
            });
          }
        });
      }
    });

    const activePeople = people.filter((p) => totals[p.id]?.items > 0);
    if (activePeople.length > 0 && tipAmount > 0) {
      const tipPerPerson = tipAmount / activePeople.length;
      activePeople.forEach((p) => { totals[p.id].tip = tipPerPerson; });
    }

    return totals;
  }, [people, items, claims, tipAmount]);

  // Progress
  const totalUnclaimedUnits = useMemo(() => {
    return items.reduce((s, item) => {
      const info = itemClaimInfo[item.id];
      return s + Math.max(0, info ? info.remaining : item.quantity);
    }, 0);
  }, [items, itemClaimInfo]);

  const fullyClaimedCount = useMemo(() => {
    return items.filter((item) => {
      const info = itemClaimInfo[item.id];
      return info && info.remaining <= 0;
    }).length;
  }, [items, itemClaimInfo]);

  const allClaimed = fullyClaimedCount === items.length && items.length > 0;

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  // Get all people involved in an item (direct claimers + shared_with participants)
  const getInvolvedPeople = (itemId: string): Set<string> => {
    const involved = new Set<string>();
    claims.filter((c) => c.item_id === itemId).forEach((c) => {
      involved.add(c.person_id);
      c.shared_with.forEach((pid) => involved.add(pid));
    });
    return involved;
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

  // Panel computed values
  const panelItem = items.find((i) => i.id === panelItemId);
  const panelPerson = people.find((p) => p.id === panelPersonId);

  const panelMaxQty = useMemo(() => {
    if (!panelItemId || !panelPersonId) return 1;
    const item = items.find((i) => i.id === panelItemId);
    if (!item) return 1;
    const otherClaims = claims.filter((c) => c.item_id === panelItemId && c.person_id !== panelPersonId);
    const otherUnits = otherClaims.reduce((s, c) => s + c.quantity + (c.shared_with.length > 0 ? 1 : 0), 0);
    const myShared = panelSharedWith.length > 0 ? 1 : 0;
    return Math.max(1, item.quantity - otherUnits - myShared);
  }, [panelItemId, panelPersonId, panelSharedWith, items, claims]);

  // Clamp panelQty when max changes
  useEffect(() => {
    if (panelOpen && panelQty > panelMaxQty) {
      setPanelQty(panelMaxQty);
    }
  }, [panelMaxQty, panelOpen, panelQty]);

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
          <p className="text-sm text-muted-foreground">Tap to claim · Hold for details</p>
        </div>
      </div>

      {/* Receipt photo collapsible */}
      {receiptImage && (
        <div className="px-4 py-2">
          <button
            onClick={() => setReceiptExpanded(!receiptExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-card border border-border text-sm font-medium text-foreground"
          >
            <span>📷 Receipt Photo</span>
            {receiptExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          <AnimatePresence>
            {receiptExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 rounded-xl border border-border overflow-hidden max-h-80 overflow-y-auto">
                  <img src={receiptImage} alt="Receipt" className="w-full object-contain" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

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
              : `${fullyClaimedCount} of ${items.length} items claimed`}
            {!allClaimed && totalUnclaimedUnits > 0 && (
              <span className="text-xs ml-1 opacity-70">
                ({totalUnclaimedUnits} unit{totalUnclaimedUnits !== 1 ? "s" : ""} remaining)
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 px-4 pb-4 overflow-y-auto">
        <div className="space-y-2 mb-6">
          <AnimatePresence>
            {items.map((item) => {
              const itemClaims = claims.filter((c) => c.item_id === item.id);
              const info = itemClaimInfo[item.id];
              const totalPrice = item.price * item.quantity;
              const isMultiUnit = item.quantity > 1;
              const involved = getInvolvedPeople(item.id);

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
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.quantity > 1 && <span className="text-muted-foreground">{item.quantity}× </span>}
                          {item.name}
                        </p>
                        {item.quantity > 1 && (
                          <p className="text-xs text-muted-foreground">€{item.price.toFixed(2)} each</p>
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
                      const claim = itemClaims.find((c) => c.person_id === person.id);
                      const isClaimed = !!claim;
                      const isSharedParticipant = !isClaimed && involved.has(person.id);
                      const avatarColor = AVATAR_COLORS[pi % AVATAR_COLORS.length];

                      return (
                        <button
                          key={person.id}
                          onClick={() => handleAvatarClick(item.id, person.id, isMultiUnit)}
                          onPointerDown={() => handlePointerDown(item.id, person.id, isMultiUnit)}
                          onPointerUp={handlePointerUp}
                          onPointerCancel={handlePointerUp}
                          onContextMenu={(e) => e.preventDefault()}
                          className={`relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 select-none ${
                            isClaimed
                              ? "text-white shadow-sm"
                              : isSharedParticipant
                              ? "text-white shadow-sm ring-2 ring-white/50"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                          style={
                            isClaimed || isSharedParticipant
                              ? { backgroundColor: avatarColor, opacity: isSharedParticipant ? 0.7 : 1 }
                              : undefined
                          }
                        >
                          {person.is_payer && (
                            <Crown className="w-3 h-3 flex-shrink-0" style={{ color: isClaimed || isSharedParticipant ? "white" : "hsl(45, 85%, 50%)" }} />
                          )}
                          <span className="truncate max-w-[60px]">{person.name}</span>
                          {isClaimed && claim.quantity > 1 && (
                            <span className="bg-white/30 rounded px-1 text-[10px] font-bold">{claim.quantity}</span>
                          )}
                          {isClaimed && claim.shared_with.length > 0 && (
                            <Share2 className="w-3 h-3 flex-shrink-0 opacity-80" />
                          )}
                          {isClaimed && claim.quantity === 1 && claim.shared_with.length === 0 && (
                            <Check className="w-3 h-3 flex-shrink-0" />
                          )}
                          {isSharedParticipant && (
                            <span className="text-[10px] opacity-80">½</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Split info & warnings */}
                  {(itemClaims.length > 0 || involved.size > 0) && (
                    <div className="mt-2 space-y-0.5">
                      {info?.overClaimed && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Over-claimed by {info.totalUnits - item.quantity} unit{info.totalUnits - item.quantity !== 1 ? "s" : ""}
                        </p>
                      )}
                      {/* Show per-person breakdown for multi-unit items */}
                      {isMultiUnit && itemClaims.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {itemClaims.map((c) => {
                            const person = people.find((p) => p.id === c.person_id);
                            const soloCost = item.price * c.quantity;
                            const sharedCost = c.shared_with.length > 0 ? item.price / (1 + c.shared_with.length) : 0;
                            const totalCost = soloCost + sharedCost;
                            const unitDesc = c.shared_with.length > 0
                              ? `${c.quantity}× + split 1`
                              : `${c.quantity}×`;
                            return (
                              <p key={c.id} className="text-xs text-muted-foreground">
                                {person?.name}: {unitDesc} = €{totalCost.toFixed(2)}
                              </p>
                            );
                          })}
                          {/* Show shared participants who don't have their own claim */}
                          {itemClaims.filter((c) => c.shared_with.length > 0).map((c) =>
                            c.shared_with
                              .filter((pid) => !itemClaims.some((cl) => cl.person_id === pid))
                              .map((pid) => {
                                const person = people.find((p) => p.id === pid);
                                const cost = item.price / (1 + c.shared_with.length);
                                return (
                                  <p key={`shared-${c.id}-${pid}`} className="text-xs text-muted-foreground">
                                    {person?.name}: split = €{cost.toFixed(2)}
                                  </p>
                                );
                              })
                          )}
                        </div>
                      )}
                      {/* Single-unit items with multiple claimers */}
                      {!isMultiUnit && itemClaims.length > 1 && (
                        <p className="text-xs text-muted-foreground">
                          Split {itemClaims.length} ways · €{(item.price / itemClaims.length).toFixed(2)} each
                        </p>
                      )}
                      {info && info.remaining > 0 && (
                        <p className="text-xs text-muted-foreground opacity-70">
                          {info.remaining} unit{info.remaining !== 1 ? "s" : ""} unclaimed
                        </p>
                      )}
                    </div>
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
                  className={`flex items-center justify-between transition-opacity ${isActive ? "opacity-100" : "opacity-40"}`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold relative"
                      style={{ backgroundColor: isActive ? avatarColor : "hsl(var(--muted))" }}
                    >
                      {getInitials(person.name)}
                      {person.is_payer && (
                        <Crown className="absolute -top-1 -right-1 w-3.5 h-3.5" style={{ color: "hsl(45, 85%, 50%)" }} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{person.name}</p>
                      {isActive && totals.tip > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Items €{totals.items.toFixed(2)} + Tip €{totals.tip.toFixed(2)}
                        </p>
                      )}
                      {!isActive && <p className="text-xs text-muted-foreground">No items claimed</p>}
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                    €{total.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between text-base font-display font-bold text-foreground pt-3 mt-3 border-t border-border">
            <span>Total</span>
            <span>€{(items.reduce((s, i) => s + i.price * i.quantity, 0) + tipAmount).toFixed(2)}</span>
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
          {allClaimed ? "Continue" : `Claim all ${items.length - fullyClaimedCount} remaining`}
        </motion.button>
      </div>

      {/* Assignment Panel Drawer */}
      <Drawer open={panelOpen} onOpenChange={setPanelOpen}>
        <DrawerContent>
          {panelItem && panelPerson && (
            <div className="px-4 pb-6 pt-2">
              <DrawerHeader className="px-0 pb-3">
                <DrawerTitle className="text-base font-display">
                  {panelPerson.name} — {panelItem.quantity}× {panelItem.name}
                </DrawerTitle>
                <p className="text-xs text-muted-foreground">€{panelItem.price.toFixed(2)} per unit</p>
              </DrawerHeader>

              {/* Quantity stepper */}
              <div className="mb-4">
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Units to take</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPanelQty(Math.max(1, panelQty - 1))}
                    disabled={panelQty <= 1}
                    className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-foreground active:scale-95 transition-transform disabled:opacity-30"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <span className="w-10 text-center text-lg font-bold text-foreground">{panelQty}</span>
                  <button
                    onClick={() => setPanelQty(Math.min(panelMaxQty, panelQty + 1))}
                    disabled={panelQty >= panelMaxQty}
                    className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-foreground active:scale-95 transition-transform disabled:opacity-30"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-muted-foreground ml-2">
                    = €{(panelItem.price * panelQty).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Split one with */}
              <div className="mb-5">
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                  Split one unit with…
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {people
                    .filter((p) => p.id !== panelPersonId)
                    .map((person, pi) => {
                      const isSelected = panelSharedWith.includes(person.id);
                      const originalIndex = people.findIndex((p) => p.id === person.id);
                      const avatarColor = AVATAR_COLORS[originalIndex % AVATAR_COLORS.length];
                      return (
                        <button
                          key={person.id}
                          onClick={() => {
                            if (isSelected) {
                              setPanelSharedWith((prev) => prev.filter((id) => id !== person.id));
                            } else {
                              // Check if adding a shared unit would exceed remaining
                              const otherClaims = claims.filter(
                                (c) => c.item_id === panelItemId && c.person_id !== panelPersonId
                              );
                              const otherUnits = otherClaims.reduce(
                                (s, c) => s + c.quantity + (c.shared_with.length > 0 ? 1 : 0), 0
                              );
                              const wouldHaveShared = panelSharedWith.length === 0; // going from 0 shared to 1
                              if (wouldHaveShared && panelQty + 1 + otherUnits > panelItem!.quantity) {
                                // Need to decrease solo qty to make room
                                setPanelQty(Math.max(1, panelItem!.quantity - otherUnits - 1));
                              }
                              setPanelSharedWith((prev) => [...prev, person.id]);
                            }
                          }}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                            isSelected
                              ? "text-white shadow-sm ring-2 ring-offset-1 ring-primary"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                          style={isSelected ? { backgroundColor: avatarColor } : undefined}
                        >
                          {person.is_payer && (
                            <Crown className="w-3 h-3" style={{ color: isSelected ? "white" : "hsl(45, 85%, 50%)" }} />
                          )}
                          <span>{person.name}</span>
                          {isSelected && <Check className="w-3 h-3" />}
                        </button>
                      );
                    })}
                </div>
                {panelSharedWith.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    1 unit split {panelSharedWith.length + 1} ways · €{(panelItem.price / (panelSharedWith.length + 1)).toFixed(2)} each
                  </p>
                )}
              </div>

              {/* Summary & confirm */}
              <div className="bg-muted/50 rounded-xl p-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Solo units</span>
                  <span className="font-medium text-foreground">{panelQty} × €{panelItem.price.toFixed(2)} = €{(panelQty * panelItem.price).toFixed(2)}</span>
                </div>
                {panelSharedWith.length > 0 && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-muted-foreground">Shared unit</span>
                    <span className="font-medium text-foreground">€{(panelItem.price / (panelSharedWith.length + 1)).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-border">
                  <span className="text-foreground">{panelPerson.name}'s total</span>
                  <span className="text-foreground">
                    €{(
                      panelQty * panelItem.price +
                      (panelSharedWith.length > 0 ? panelItem.price / (panelSharedWith.length + 1) : 0)
                    ).toFixed(2)}
                  </span>
                </div>
              </div>

              <Button onClick={confirmPanel} className="w-full h-12 rounded-xl text-base font-semibold">
                Confirm
              </Button>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default ClaimItems;
