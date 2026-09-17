import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { currentUser } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Create your account — Chalk",
};

export default async function SignupPage() {
  if (await currentUser()) redirect("/app");
  return <AuthForm mode="signup" />;
}
