
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'bill',
  tip_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.session_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_payer boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE public.session_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  quantity int NOT NULL DEFAULT 1,
  color text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE public.item_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.session_items(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.session_people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(item_id, person_id)
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.session_people FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.session_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.item_claims FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.item_claims;
