"use client";

import { handleSupabaseError } from "@fitme/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { createClient } from "~/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 6;

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, "Password must be at least 6 characters"),
});

type FormValues = z.infer<typeof schema>;

/** Only same-origin targets, so `?next=` can't send users to another site. */
function safeNextPath(next: string | null) {
  if (!next) {
    return "/dashboard";
  }
  const url = new URL(next, window.location.origin);
  return url.origin === window.location.origin
    ? `${url.pathname}${url.search}${url.hash}`
    : "/dashboard";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { email: "", password: "" },
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(values);

    if (error) {
      handleSupabaseError(error, setServerError);
      return;
    }

    router.replace(safeNextPath(searchParams.get("next")));
    router.refresh();
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          autoComplete="email"
          id="email"
          placeholder="you@example.com"
          type="email"
          {...register("email")}
        />
        {errors.email ? (
          <p className="text-destructive text-sm">{errors.email.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          autoComplete="current-password"
          id="password"
          type="password"
          {...register("password")}
        />
        {errors.password ? (
          <p className="text-destructive text-sm">{errors.password.message}</p>
        ) : null}
      </div>

      {serverError ? (
        <p className="text-destructive text-sm">{serverError}</p>
      ) : null}

      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
