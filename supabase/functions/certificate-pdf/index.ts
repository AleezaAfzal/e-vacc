/**
 * Supabase Edge Function — wire via Database Webhook on `public.certificates` INSERT
 * or poll `certificate_ready` with a worker. Uses service role to set `pdf_url`.
 *
 * Deploy: supabase functions deploy certificate-pdf
 * Set secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Minimal stub: upload a placeholder PDF to Storage bucket `certificates` and update row.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const citizen_id = payload.citizen_id ?? payload.record?.citizen_id;
    const vaccine_id = payload.vaccine_id ?? payload.record?.vaccine_id;
    if (!citizen_id || !vaccine_id) {
      return new Response(JSON.stringify({ error: "citizen_id and vaccine_id required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const path = `${citizen_id}/${vaccine_id}.pdf`;
    const pdfBytes = new TextEncoder().encode(
      `%PDF-1.4 e-vacc certificate placeholder for ${citizen_id}`,
    );

    const { error: upErr } = await supabase.storage
      .from("certificates")
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (upErr) {
      console.error(upErr);
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: pub } = supabase.storage.from("certificates").getPublicUrl(path);

    await supabase
      .from("certificates")
      .update({ pdf_url: pub.publicUrl })
      .eq("citizen_id", citizen_id)
      .eq("vaccine_id", vaccine_id);

    return new Response(JSON.stringify({ ok: true, pdf_url: pub.publicUrl }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
