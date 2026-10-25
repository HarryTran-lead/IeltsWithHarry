import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.STUDY_SMOKE_URL;
const publicKey = process.env.STUDY_SMOKE_PUBLIC_KEY;
const secretKey = process.env.STUDY_SMOKE_SECRET_KEY;
if (!url || !publicKey || !secretKey) throw new Error("Smoke test credentials missing");

const admin = createClient(url, secretKey, { auth: { persistSession: false } });
const users = [];
const channels = [];
const clients = [];
const runId = randomUUID();

async function createLearner(label) {
  const email = `study-smoke-${label}-${runId}@example.invalid`;
  const password = `Smoke!${randomUUID()}aA1`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `Smoke ${label}` } });
  if (created.error || !created.data.user) throw created.error ?? new Error("User creation failed");
  users.push(created.data.user.id);
  const client = createClient(url, publicKey, { auth: { persistSession: false } });
  clients.push(client);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Sign in failed");
  await client.realtime.setAuth(signedIn.data.session.access_token);
  return { client, user: signedIn.data.user };
}

function subscribed(channel) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Realtime subscribe timeout")), 12000);
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timeout); reject(new Error(`Realtime ${status}: ${error?.message ?? "no detail"}`)); }
    });
  });
}

try {
  const anonymous = createClient(url, publicKey, { auth: { persistSession: false } });
  const anonymousRead = await anonymous.from("study_room_messages").select("id").limit(1);
  if (!anonymousRead.error) throw new Error("Anonymous read unexpectedly succeeded");
  console.log("anonymous read denied: ok");
  const first = await createLearner("one");
  const second = await createLearner("two");
  let resolveReceived;
  let rejectReceived;
  const received = new Promise((resolve, reject) => { resolveReceived = resolve; rejectReceived = reject; });
  received.catch(() => undefined);
  let receiveTimeout;
  {
    const channel = second.client.channel("study-together", { config: { private: true, presence: { key: second.user.id } } });
    channels.push({ client: second.client, channel });
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "study_room_messages" }, (event) => {
      if (event.new.body === `Smoke ${runId}`) { clearTimeout(receiveTimeout); resolveReceived(event.new); }
    });
  }
  const secondChannel = channels[0].channel;
  await subscribed(secondChannel);
  await secondChannel.track({ user_id: second.user.id, joined_at: new Date().toISOString() });
  const firstChannel = first.client.channel("study-together", { config: { private: true, presence: { key: first.user.id } } });
  channels.push({ client: first.client, channel: firstChannel });
  await subscribed(firstChannel);
  await firstChannel.track({ user_id: first.user.id, joined_at: new Date().toISOString() });
  let peers = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    peers = Object.keys(secondChannel.presenceState()).length;
    if (peers === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (peers !== 2) throw new Error(`Expected two online learners, got ${peers}`);
  console.log("presence: ok");
  receiveTimeout = setTimeout(() => rejectReceived(new Error("Realtime INSERT not received")), 12000);
  const sent = await first.client.from("study_room_messages").insert({ body: `Smoke ${runId}` }).select().single();
  if (sent.error) throw sent.error;
  console.log("insert: ok");
  const event = await received;
  console.log(`realtime: ${event.id === sent.data.id ? "ok" : "mismatched"}`);
  const read = await second.client.from("study_room_messages").select("id,body").eq("id", sent.data.id).single();
  if (read.error || read.data?.body !== `Smoke ${runId}`) throw read.error ?? new Error("Cross-user read failed");
  console.log("cross-user read: ok");
  const deniedDelete = await second.client.from("study_room_messages").delete().eq("id", sent.data.id).select("id");
  if (deniedDelete.error || deniedDelete.data.length !== 0) throw deniedDelete.error ?? new Error("Other learner deleted a message");
  console.log("other learner delete denied: ok");
  const deleted = await first.client.from("study_room_messages").delete().eq("id", sent.data.id);
  if (deleted.error) throw deleted.error;
  console.log("author delete: ok");
} finally {
  await Promise.all(channels.map(({ client, channel }) => client.removeChannel(channel).catch(() => undefined)));
  for (const client of clients) client.realtime.disconnect();
  await Promise.all(users.map((id) => admin.auth.admin.deleteUser(id).then(({ error }) => {
    if (error) console.error("test user cleanup failed:", error.message);
  })));
}
