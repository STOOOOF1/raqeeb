// مفتاح توقيع تطبيق أندرويد لبناء GitHub Actions فقط.
// لا سرّ مشترك: البناء يرسل رمز OIDC يوقّعه GitHub نفسه، ونتحقق أنه صادر لمستودع رقيب في حدث push أو تشغيل يدوي.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "raqeeb-ci";
const REPO = "stoooof1/raqeeb";
const EVENTS = new Set(["push", "workflow_dispatch"]);
const jwks = createRemoteJWKSet(new URL(ISSUER + "/.well-known/jwks"));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const token = req.headers.get("x-github-oidc") ?? "";
  let claims: Record<string, unknown>;
  try {
    ({ payload: claims } = await jwtVerify(token, jwks, { issuer: ISSUER, audience: AUDIENCE }));
  } catch {
    return json({ error: "unauthorized" }, 401);
  }
  if (String(claims.repository).toLowerCase() !== REPO || !EVENTS.has(String(claims.event_name))) {
    return json({ error: "forbidden" }, 403);
  }
  const { data, error } = await admin.from("app_secrets").select("key,value")
    .in("key", ["android_keystore", "android_keystore_pass"]);
  if (error) return json({ error: "server" }, 500);
  const s = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  if (!s.android_keystore) return json({ error: "no key" }, 500);
  console.log("keystore issued", claims.repository, claims.ref, claims.run_id);
  return json({ keystore: s.android_keystore, password: s.android_keystore_pass });
});
