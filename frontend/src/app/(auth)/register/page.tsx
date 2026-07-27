"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { GoogleButton } from "@/components/auth/google-button";
import { Field, FormError, OrDivider, SubmitButton } from "@/components/form";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/api-limits";
import { getApiErrorMessage } from "@/lib/api/error";
import { useAuth } from "@/lib/auth/auth-context";

export default function RegisterPage() {
  const router = useRouter();
  const { register, status } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  const mutation = useMutation({
    mutationFn: () => register({ name, email, password }),
    onSuccess: () => router.replace("/"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-3xl font-extrabold tracking-tight">
          Make your account
        </h2>
        <p className="text-sm text-muted">
          Start a group and bring your people in.
        </p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <Field
          id="name"
          label="Name"
          type="text"
          autoComplete="name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={mutation.isPending}
        />
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
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={mutation.isPending}
        />
        <FormError
          message={mutation.isError ? getApiErrorMessage(mutation.error) : null}
        />
        <SubmitButton pending={mutation.isPending}>Create account</SubmitButton>
      </form>

      <OrDivider />
      <GoogleButton />

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-strong hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
