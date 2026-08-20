import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SupabaseNotConfigured } from "@/components/SupabaseNotConfigured";

export default async function RootPage() {
  if (!isSupabaseConfigured) {
    return <SupabaseNotConfigured />;
  }

  const supabase = await createClient();
  // Local JWT verification rather than a round trip to the Auth server, for
  // the reasons written out in app/dashboard/layout.tsx. This route decides one
  // thing: which page to send you to.
  const { data: claims } = await supabase.auth.getClaims();

  redirect(claims ? "/dashboard" : "/login");
}
