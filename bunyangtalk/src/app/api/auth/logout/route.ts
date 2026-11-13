import { api, json } from "@/lib/http";
import { destroySession } from "@/lib/auth";

export const POST = api(async () => {
  await destroySession();
  return json({ ok: true, redirect: "/" });
});
