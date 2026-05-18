// Bootstrap default admin account if none exists. Safe to call repeatedly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_USERNAME = "admin@001";
const ADMIN_PASSWORD = "Dasnotri123";
const ADMIN_FULLNAME = "System Admin";
// Username may contain special chars not allowed in email local part. Sanitize.
const sanitize = (u: string) => u.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
const ADMIN_EMAIL = `${sanitize(ADMIN_USERNAME)}@mktre.local`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check if any admin exists
    const { data: existing } = await admin
      .from("user_roles")
      .select("id")
      .eq("role", "admin")
      .limit(1);
    if (existing && existing.length > 0) {
      return Response.json({ ok: true, message: "Admin đã tồn tại" }, { headers: corsHeaders });
    }

    // Create auth user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { username: ADMIN_USERNAME, full_name: ADMIN_FULLNAME },
    });
    if (createErr) throw createErr;

    const authUserId = created.user!.id;

    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .insert({
        auth_user_id: authUserId,
        full_name: ADMIN_FULLNAME,
        username: ADMIN_USERNAME,
        email: ADMIN_EMAIL,
        status: "active",
      })
      .select("id")
      .single();
    if (profErr) throw profErr;

    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: profile.id, role: "admin" });
    if (roleErr) throw roleErr;

    return Response.json(
      { ok: true, message: "Tạo admin thành công", username: ADMIN_USERNAME },
      { headers: corsHeaders },
    );
  } catch (e) {
    console.error(e);
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500, headers: corsHeaders },
    );
  }
});
