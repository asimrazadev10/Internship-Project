"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { GoogleButton } from "@/components/auth/google-button";
import { Field, FormError, OrDivider, SubmitButton } from "@/components/form";
import { getApiErrorMessage } from "@/lib/api/error";
import { useAuth } from "@/lib/auth/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { login, status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: () => router.replace("/"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-3xl font-extrabold tracking-tight">
          Welcome back
        </h2>
        <p className="text-sm text-muted">Sign in and rejoin the conversation.</p>
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

      <OrDivider />
      <GoogleButton />

      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/register" className="font-medium text-brand-strong hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
