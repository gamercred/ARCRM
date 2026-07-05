import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://gtolvsooitagmvcgrrxy.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0b2x2c29vaXRhZ212Y2dycnh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTM3NjksImV4cCI6MjA5ODc2OTc2OX0.cMgWmfwd656wsu-jBrFSs4OHXGj9rEC9HgQmbuOmxGU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
