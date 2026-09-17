import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { currentUser } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Sign in — Chalk",
};

export default async function LoginPage() {
  if (await currentUser()) redirect("/app");
  return <AuthForm mode="login" />;
}
