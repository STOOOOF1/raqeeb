// الحذف اليومي للمحادثات: يُستدعى من pg_cron عند منتصف الليل بتوقيت الرياض عبر cleanup_chats()
// يحذف ملفات الصوت من التخزين (عبر Storage API، فالحذف المباشر من storage.objects ممنوع) ثم صفوف الرسائل.
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TZ_OFFSET_MS = 3 * 3600_000; // الرياض UTC+3 بلا توقيت صيفي
const DAY = 86400_000;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { data: sec } = await admin.from("app_secrets").select("value").eq("key", "hook_secret").maybeSingle();
  if (!sec?.value || req.headers.get("x-hook-secret") !== sec.value) return json({ error: "forbidden" }, 403);

  // كل ما أُرسل قبل بداية اليوم الحالي بتوقيت الرياض
  const now = Date.now();
  const cutoff = new Date(Math.floor((now + TZ_OFFSET_MS) / DAY) * DAY - TZ_OFFSET_MS).toISOString();

  let messages = 0, files = 0;
  try {
    for (let i = 0; i < 100; i++) {
      const { data: rows, error } = await admin.from("messages").select("id,audio_path")
        .lt("created_at", cutoff).order("created_at").limit(500);
      if (error) throw error;
      if (!rows?.length) break;
      const paths = rows.map((r) => r.audio_path).filter(Boolean) as string[];
      if (paths.length) {
        const { data: removed, error: se } = await admin.storage.from("audio").remove(paths);
        if (se) throw se;
        files += removed?.length ?? 0;
      }
      const { error: de } = await admin.from("messages").delete().in("id", rows.map((r) => r.id));
      if (de) throw de;
      messages += rows.length;
    }
  } catch (e) {
    console.error("cleanup failed", e);
    return json({ error: "server", messages, files }, 500);
  }
  console.log("chat cleanup", { cutoff, messages, files });
  return json({ cutoff, messages, files });
});
