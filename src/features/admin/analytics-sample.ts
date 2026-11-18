import type { Analytics, DailyPoint } from "./admin-analytics";

/** Deterministic sample report used only to review the analytics layout before the migration is live. */
export function sampleAnalytics(days: number): Analytics {
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const today = new Date();
  const daily: DailyPoint[] = Array.from({ length: days }, (_, index) => {
    const date = new Date(today.getTime() - (days - 1 - index) * 86400000);
    const weekend = [0, 6].includes(date.getDay());
    const trend = 1 + index / days * 0.6;
    const guests = Math.round((weekend ? 34 : 52) * trend * (0.75 + rand() * 0.5));
    const members = Math.round((weekend ? 14 : 22) * trend * (0.7 + rand() * 0.6));
    const visits = Math.round((guests + members) * (1.2 + rand() * 0.3));
    return {
      day: date.toISOString().slice(0, 10), guests, members, visits,
      pageViews: Math.round(visits * (3.1 + rand() * 1.4)),
      signIns: Math.round(members * (0.8 + rand() * 0.5)),
      signups: Math.round(rand() * 4 * trend),
      learners: Math.round(members * (0.6 + rand() * 0.3)),
    };
  });
  const sum = (key: keyof Omit<DailyPoint, "day">) => daily.reduce((total, d) => total + d[key], 0);
  const pageViews = sum("pageViews");
  const hourShape = [2, 1, 1, 0, 0, 1, 3, 6, 9, 8, 7, 8, 10, 9, 7, 7, 8, 10, 12, 15, 18, 20, 16, 8];
  const hourTotal = hourShape.reduce((a, b) => a + b, 0);
  return {
    days, from: daily[0].day, to: daily[days - 1].day,
    summary: { pageViews, visits: sum("visits"), visitors: Math.round((sum("guests") + sum("members")) * 0.42), guestVisitors: Math.round(sum("guests") * 0.4), memberVisitors: Math.round(sum("members") * 0.18), signIns: sum("signIns"), signInUsers: Math.round(sum("members") * 0.15), signups: sum("signups"), activeLearners: Math.round(sum("learners") * 0.16), learningEvents: sum("learners") * 6, onlineNow: 9, totalMembers: 412 },
    previous: { pageViews: Math.round(pageViews * 0.82), visits: Math.round(sum("visits") * 0.85), visitors: Math.round((sum("guests") + sum("members")) * 0.38), signIns: Math.round(sum("signIns") * 0.9), signups: Math.round(sum("signups") * 1.1), activeLearners: Math.round(sum("learners") * 0.14) },
    daily,
    topPages: [
      ["/", "public", 0.24, 0.92], ["/app/dashboard", "app", 0.14, 0], ["/app/news", "app", 0.1, 0], ["/courses", "public", 0.08, 0.95], ["/login", "auth", 0.07, 1],
      ["/app/reading", "app", 0.06, 0], ["/app/vocabulary", "app", 0.05, 0], ["/app/lesson/:id", "app", 0.04, 0], ["/register", "auth", 0.03, 1], ["/app/dictation", "app", 0.025, 0],
    ].map(([path, area, share, guest]) => { const views = Math.round(pageViews * (share as number)); return { path: path as string, area: area as "public" | "app" | "auth", views, visitors: Math.round(views * 0.35), guest_views: Math.round(views * (guest as number)) }; }),
    areas: { public: Math.round(pageViews * 0.38), app: Math.round(pageViews * 0.52), auth: Math.round(pageViews * 0.1) },
    devices: { mobile: 268, desktop: 141, tablet: 17 },
    signInMethods: { google: Math.round(sum("signIns") * 0.58), email: Math.round(sum("signIns") * 0.37), phone: Math.round(sum("signIns") * 0.05) },
    referrers: [{ host: "facebook.com", visits: 182 }, { host: "google.com", visits: 121 }, { host: "zalo.me", visits: 64 }, { host: "tiktok.com", visits: 29 }, { host: "youtube.com", visits: 12 }],
    hours: hourShape.map((v) => Math.round(pageViews * v / hourTotal)),
    recentSignIns: ["Mẫu · Minh Anh", "Mẫu · Quốc Bảo", "Mẫu · Thu Hà", "Mẫu · Gia Huy", "Mẫu · Ngọc Lan"].map((name, index) => ({ at: new Date(today.getTime() - index * 47 * 60000).toISOString(), method: ["google", "email", "google", "phone", "email"][index], device: ["mobile", "desktop", "mobile", "mobile", "desktop"][index], user_id: null, display_name: name })),
    topMembers: ["Mẫu · Minh Anh", "Mẫu · Thu Hà", "Mẫu · Quốc Bảo", "Mẫu · Gia Huy"].map((name, index) => ({ user_id: `sample-${index}`, display_name: name, page_views: 240 - index * 41, visits: 31 - index * 5, last_seen: new Date(today.getTime() - index * 3 * 3600000).toISOString() })),
  };
}
