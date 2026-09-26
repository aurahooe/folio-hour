import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
let session = null;
let profile = null;
let mode = "signin";

function hourKey(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}`;
}

function show(view) {
  document.querySelectorAll(".view").forEach((el) => el.classList.remove("is-on"));
  const node = document.getElementById(`view-${view}`);
  if (node) node.classList.add("is-on");
}

function tickClock() {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(60, 0, 0);
  const left = next - now;
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  $("tick").textContent = `${now.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  })}  ·  next turn in ${m}m ${String(s).padStart(2, "0")}s`;
}

function renderWall(rows) {
  const wall = $("wall");
  if (!rows.length) {
    wall.innerHTML = `<article class="slip" style="--tilt:-1deg"><h3>Empty nails</h3><p>Nothing public yet. File a slip and mark it public.</p></article>`;
    return;
  }
  wall.innerHTML = rows
    .map((r, i) => {
      const tilt = ((i % 5) - 2) * 0.7;
      const who = r.folio_profiles?.display_name || "anonymous";
      const when = new Date(r.created_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `<article class="slip" style="--tilt:${tilt}deg;--d:${i * 0.05}s">
        <h3>${escapeHtml(r.title)}</h3>
        <p>${escapeHtml(r.body).slice(0, 280)}</p>
        <small>${escapeHtml(who)} · ${when}</small>
      </article>`;
    })
    .join("");
}

function renderDrawer(rows) {
  const box = $("drawer");
  if (!rows.length) {
    box.innerHTML = `<p class="muted">Your drawer is empty.</p>`;
    return;
  }
  box.innerHTML = rows
    .map(
      (r) => `<div class="drawer-item">
        <strong>${escapeHtml(r.title)}</strong>
        <div class="muted">${r.is_public ? "public" : "private"} · ${new Date(r.created_at).toLocaleDateString()}</div>
        <p>${escapeHtml(r.body).slice(0, 160)}</p>
        <button type="button" data-del="${r.id}">Tear this slip</button>
      </div>`
    )
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&")
    .replaceAll("<", "<")
    .replaceAll(">", ">")
    .replaceAll('"', """);
}

async function loadWall() {
  const { data } = await sb
    .from("folio_slips")
    .select("id,title,body,created_at,folio_profiles(display_name,handle)")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(36);
  renderWall(data || []);
}

async function ensureHour() {
  const key = hourKey();
  const { data: existing } = await sb.from("folio_hours").select("hour_key,slip_id,folio_slips(title,body,folio_profiles(display_name))").eq("hour_key", key).maybeSingle();

  if (existing?.folio_slips) {
    paintHour(existing.folio_slips, key);
    return;
  }

  const { data: publics } = await sb.from("folio_slips").select("id,title,body,folio_profiles(display_name)").eq("is_public", true);
  if (!publics?.length) {
    $("hourTitle").textContent = "The room is still setting type.";
    $("hourBody").textContent = "Public slips land on the wall. Every hour one of them is drawn to the front.";
    $("hourMeta").textContent = `Hour ${key} UTC · waiting on a public slip`;
    return;
  }

  const pick = publics[Math.floor(Math.random() * publics.length)];
  await sb.from("folio_hours").upsert({ hour_key: key, slip_id: pick.id, note: "drawn from the public wall" });
  paintHour(pick, key);
}

function paintHour(slip, key) {
  $("hourTitle").textContent = slip.title;
  $("hourBody").textContent = slip.body;
  const who = slip.folio_profiles?.display_name ? `from ${slip.folio_profiles.display_name}` : "";
  $("hourMeta").textContent = `Hour ${key} UTC ${who}`.trim();
}

async function loadProfile(user) {
  if (!user) {
    profile = null;
    return;
  }
  const { data } = await sb.from("folio_profiles").select("*").eq("id", user.id).maybeSingle();
  profile = data;
}

async function loadDrawer() {
  if (!session?.user) {
    $("drawer").innerHTML = `<p class="muted">Sign in to keep a drawer.</p>`;
    return;
  }
  const { data } = await sb
    .from("folio_slips")
    .select("*")
    .eq("author_id", session.user.id)
    .order("created_at", { ascending: false });
  renderDrawer(data || []);
}

function setAuthUi() {
  const btn = $("authBtn");
  if (session?.user) {
    btn.textContent = "Sign out";
    $("deskBtn").hidden = false;
  } else {
    btn.textContent = "Sign in";
  }
}

async function refreshAuth() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  await loadProfile(session?.user);
  setAuthUi();
  await loadDrawer();
}

document.querySelectorAll("[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = btn.getAttribute("data-view");
    if (v === "desk" && !session) {
      show("auth");
      return;
    }
    show(v);
  });
});

$("authBtn").addEventListener("click", async () => {
  if (session) {
    await sb.auth.signOut();
    session = null;
    profile = null;
    setAuthUi();
    show("wall");
    return;
  }
  show("auth");
});

$("authToggle").addEventListener("click", () => {
  mode = mode === "signin" ? "signup" : "signin";
  $("authTitle").textContent = mode === "signin" ? "Come in" : "Take a desk";
  $("authSubmit").textContent = mode === "signin" ? "Sign in" : "Create account";
  $("authToggle").textContent = mode === "signin" ? "Need an account?" : "Already have a desk?";
});

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("authEmail").value.trim();
  const password = $("authPass").value;
  const name = $("authName").value.trim() || email.split("@")[0];
  $("authNote").textContent = "Working…";
  try {
    if (mode === "signup") {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      if (data.user) {
        const handle = (name || "reader").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 18) + Math.floor(Math.random() * 90);
        await sb.from("folio_profiles").upsert({
          id: data.user.id,
          handle,
          display_name: name,
        });
      }
      $("authNote").textContent = data.session ? "Desk ready." : "Check your email if confirmation is on.";
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      $("authNote").textContent = "In.";
    }
    await refreshAuth();
    if (session) show("desk");
  } catch (err) {
    $("authNote").textContent = err.message || "Could not sign in.";
  }
});

$("slipForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!session?.user) {
    show("auth");
    return;
  }
  if (!profile) {
    const fallback = session.user.email.split("@")[0];
    await sb.from("folio_profiles").upsert({
      id: session.user.id,
      handle: fallback.replace(/[^a-z0-9]/g, "") + "desk",
      display_name: fallback,
    });
    await loadProfile(session.user);
  }
  const title = $("slipTitle").value.trim();
  const body = $("slipBody").value.trim();
  const is_public = $("slipPublic").checked;
  const { error } = await sb.from("folio_slips").insert({
    author_id: session.user.id,
    title,
    body,
    is_public,
  });
  $("formNote").textContent = error ? error.message : "Filed.";
  if (!error) {
    $("slipForm").reset();
    await loadDrawer();
    await loadWall();
    if (is_public) await ensureHour();
  }
});

$("drawer").addEventListener("click", async (e) => {
  const id = e.target.getAttribute?.("data-del");
  if (!id) return;
  await sb.from("folio_slips").delete().eq("id", id);
  await loadDrawer();
  await loadWall();
});

sb.auth.onAuthStateChange(async (_event, s) => {
  session = s;
  await loadProfile(s?.user);
  setAuthUi();
  await loadDrawer();
});

tickClock();
setInterval(tickClock, 1000);
refreshAuth();
loadWall();
ensureHour();
setInterval(ensureHour, 60 * 1000);
