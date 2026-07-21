"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getApiErrorMessage } from "@/lib/api/error";
import { useAuth } from "@/lib/auth/auth-context";
import { Field, FormError, SubmitButton } from "@/components/form";

export default function LoginPage() {
  const router = useRouter();
  const { login, status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Already signed in? Don't show the login form — send them to the app.
  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  // useMutation gives us isPending and error state for free — the data layer we already set up.
  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: () => router.replace("/"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-zinc-500">Sign in to your account.</p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={mutation.isPending}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={mutation.isPending}
        />

        <FormError
          message={mutation.isError ? getApiErrorMessage(mutation.error) : null}
        />

        <SubmitButton pending={mutation.isPending}>Sign in</SubmitButton>
      </form>

      <p className="text-center text-sm text-zinc-500">
        No account?{" "}
        <Link href="/register" className="font-medium text-zinc-900 underline dark:text-zinc-100">
          Create one
        </Link>
      </p>
    </div>
  );
}
