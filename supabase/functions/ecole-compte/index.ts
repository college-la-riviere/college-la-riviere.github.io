// Collège La Rivière — création du compte d'un membre de l'école (fonction Supabase « ecole-compte »)
// L'enseignant donne : le code de l'école, son code personnel à 4 chiffres, son téléphone et un mot de passe.
// La fonction vérifie le code, crée le compte (sans e-mail de confirmation) et le relie à son profil.
// Si le profil a déjà un compte avec le même téléphone, le mot de passe est simplement remplacé (mot de passe oublié).
// À déployer SANS vérification JWT (la personne n'a pas encore de compte) : option « Verify JWT » désactivée.
// (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const emailOf = (digits: string) => `${digits}@tel.college-la-riviere.github.io`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const b = await req.json().catch(() => ({}));
    const school = String(b.school || "").trim().toUpperCase();
    const code = String(b.code || "").replace(/\D/g, "");
    let phone = String(b.phone || "").replace(/\D/g, "");
    if (phone.startsWith("00")) phone = phone.slice(2);
    if (phone.length === 10 && phone.startsWith("0")) phone = "243" + phone.slice(1);
    if (phone.length === 9) phone = "243" + phone;
    const password = String(b.password || "");
    if (!school || code.length !== 4) return json({ error: "Code de l’école ou code personnel incomplet." }, 400);
    if (phone.length < 11 || phone.length > 15) return json({ error: "Numéro de téléphone invalide." }, 400);
    if (password.length < 6) return json({ error: "Le mot de passe doit avoir au moins 6 caractères." }, 400);

    // Anti-devinette : 5 essais ratés par heure, par téléphone et par adresse
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await sb.from("ecole_usage").select("id", { count: "exact", head: true })
      .eq("kind", "join_fail").in("who", [phone, "ip:" + ip]).gte("at", since);
    if ((count || 0) >= 5) return json({ error: "Trop d’essais. Réessayez dans une heure ou demandez votre code à la direction." }, 429);
    const fail = async (msg: string, status = 403) => {
      await sb.from("ecole_usage").insert([{ kind: "join_fail", who: phone }, { kind: "join_fail", who: "ip:" + ip }]);
      return json({ error: msg }, status);
    };

    const { data: sch } = await sb.from("ecole_schools").select("id,name").eq("code", school).maybeSingle();
    if (!sch) return fail("Code de l’école inconnu.");
    const { data: k } = await sb.from("ecole_codes").select("profile_id").eq("school_id", sch.id).eq("code", code).limit(2);
    if (!k || k.length !== 1) return fail("Code personnel incorrect.");
    const pid = k[0].profile_id as string;
    const { data: prof } = await sb.from("ecole_docs").select("data").eq("school_id", sch.id).eq("col", "inscriptions").eq("id", pid).maybeSingle();
    if (!prof || prof.data?.profil) return fail("Code personnel incorrect.");
    const p: any = prof.data;
    const email = emailOf(phone);

    // Profil déjà relié à un compte ?
    const { data: mem } = await sb.from("ecole_members").select("user_id,phone").eq("school_id", sch.id).eq("profile_id", pid).maybeSingle();
    if (mem) {
      if (mem.phone !== phone) return json({ error: "Ce profil est déjà utilisé sur un autre numéro. Demandez à la direction de le libérer." }, 409);
      const { error } = await sb.auth.admin.updateUserById(mem.user_id, { password });
      if (error) return json({ error: "Impossible de changer le mot de passe." }, 500);
      return json({ ok: true, email, reset: true });
    }

    const { data: created, error: cErr } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nom: p.nom, ecole: school } });
    if (cErr || !created?.user) {
      const exists = /already|registered|exists/i.test(cErr?.message || "");
      return json({ error: exists ? "Ce numéro a déjà un compte. Touchez « Se connecter »." : "Création du compte impossible." }, exists ? 409 : 500);
    }
    const uid = created.user.id;
    const role = p.role === "gestionnaire" ? "admin" : "teacher";
    const { error: mErr } = await sb.from("ecole_members").insert({ user_id: uid, school_id: sch.id, role, profile_id: pid, nom: p.nom || "", phone });
    if (mErr) { await sb.auth.admin.deleteUser(uid); return json({ error: "Ce profil vient d’être relié à un autre compte." }, 409); }
    const now = new Date().toISOString();
    await sb.from("ecole_docs").upsert([
      { school_id: sch.id, col: "inscriptions", id: uid, data: { nom: p.nom || "", tel: "+" + phone, matiere: p.matiere || "", profil: pid, date: now }, updated_by: uid },
      { school_id: sch.id, col: "inscriptions", id: pid, data: { ...p, tel: p.tel || "+" + phone }, updated_by: uid },
    ]);
    return json({ ok: true, email, role, nom: p.nom || "" });
  } catch (e) {
    console.log("ecole-compte", String(e));
    return json({ error: "Erreur du serveur. Réessayez." }, 500);
  }
});
