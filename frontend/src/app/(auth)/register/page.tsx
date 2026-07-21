"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getApiErrorMessage } from "@/lib/api/error";
import { useAuth } from "@/lib/auth/auth-context";
import { Field, FormError, SubmitButton } from "@/components/form";

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Start chatting in seconds.
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
          // Mirrors the backend RegisterDto: 8–128 chars. Client-side validation is a UX
          // convenience; the backend is the real enforcement.
          minLength={8}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={mutation.isPending}
        />

        <FormError
          message={mutation.isError ? getApiErrorMessage(mutation.error) : null}
        />

        <SubmitButton pending={mutation.isPending}>Create account</SubmitButton>
      </form>

      <p className="text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-zinc-900 underline dark:text-zinc-100">
          Sign in
        </Link>
      </p>
    </div>
  );
}
