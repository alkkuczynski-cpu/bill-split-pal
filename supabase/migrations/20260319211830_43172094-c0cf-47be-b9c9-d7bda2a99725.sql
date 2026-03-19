CREATE POLICY "Public can read revolut_username"
  ON public.profiles FOR SELECT
  TO public
  USING (true);