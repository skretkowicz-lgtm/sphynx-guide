// Shared Supabase client for login.html and profile.html. Loaded after the
// jsDelivr <script> tag that defines the global `supabase` factory.
//
// SUPABASE_ANON_KEY is the publishable/anon key — safe to ship to the
// browser. It has no power beyond what the RLS policies in
// sql/002_profiles_consultations_documents.sql grant. Never put the
// service_role key (the one used in server/.env) here or in any file under
// the static site root.
(function () {
  var SUPABASE_URL = 'https://mtyqrfoeferypnfetdxr.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_KVJwUD4Fd-krX-TFkU0rBA_EXeJp8tw';

  window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
