// Collège La Rivière — assistant de rédaction IA (fonction Supabase « ecole-ia »)
// Utilisé pour corriger et reformuler les consignes aux parents et les observations de conduite.
// Secret nécessaire : GEMINI_API_KEY (Edge Functions › Secrets). Facultatif : GEMINI_MODEL.
// À déployer AVEC vérification JWT (option « Verify JWT » activée) : seuls les membres connectés l'utilisent.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MAX_PER_DAY = 80;
const SYSTEM = "Tu es l’assistant de rédaction d’une école primaire de Kinshasa (République démocratique du Congo). " +
  "Tu aides les enseignants et la direction à écrire aux parents : français simple, respectueux, au vouvoiement, sans jargon. " +
  "N’invente jamais de fait (note, absence, incident) qui n’est pas donné. Respecte exactement le format de réponse demandé.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(token);
    if (!u?.user) return json({ error: "non connecté", code: "not_granted" }, 401);
    const { data: mem } = await sb.from("ecole_members").select("school_id").eq("user_id", u.user.id).maybeSingle();
    if (!mem) return json({ error: "pas membre", code: "not_granted" }, 403);

    const since = new Date(Date.now() - 86400_000).toISOString();
    const { count } = await sb.from("ecole_usage").select("id", { count: "exact", head: true }).eq("kind", "ia").eq("who", u.user.id).gte("at", since);
    if ((count || 0) >= MAX_PER_DAY) return json({ error: "limite", code: "rate_limited" }, 429);

    const b = await req.json().catch(() => ({}));
    const prompt = String(b.prompt || "").slice(0, 6000);
    if (!prompt) return json({ error: "vide" }, 400);
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return json({ error: "GEMINI_API_KEY manquant" }, 500);
    await sb.from("ecole_usage").insert({ kind: "ia", who: u.user.id });
    const text = await askGemini(key, prompt, !!b.json);
    if (!text) return json({ error: "pas de réponse" }, 502);
    return json({ text });
  } catch (e) {
    console.log("ecole-ia", String(e));
    return json({ error: "erreur" }, 500);
  }
});

// Plusieurs modèles : si l'un est saturé (limite gratuite) ou indisponible, on passe au suivant
async function askGemini(key: string, prompt: string, asJson: boolean): Promise<string> {
  const models = [Deno.env.get("GEMINI_MODEL"), "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.6-flash", "gemini-flash-lite-latest", "gemini-flash-latest"].filter(Boolean) as string[];
  const deadline = Date.now() + 20000;
  for (const model of models) {
    const left = deadline - Date.now();
    if (left < 1500) break;
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), left);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        signal: ac.signal,
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 900, temperature: 0.5, ...(asJson ? { responseMimeType: "application/json" } : {}) },
        }),
      });
      if (!r.ok) { console.log("gemini", model, r.status, (await r.text()).slice(0, 300)); continue; }
      const out = await r.json();
      const t = (out.candidates?.[0]?.content?.parts || []).map((p: any) => (p.thought ? "" : p.text || "")).join("").trim();
      if (t) return t;
    } catch (e) { console.log("gemini", model, String(e)); }
    finally { clearTimeout(to); }
  }
  return "";
}
