import { afterEach, describe, expect, it, vi } from "vitest";

import { getSupabaseConfig, isAuthConfigured } from "@/lib/supabase/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Supabase configuration", () => {
  it("is not configured by default, so the public site keeps working", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(getSupabaseConfig()).toBeNull();
    expect(isAuthConfigured()).toBe(false);
  });

  it("needs both the URL and the publishable key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(getSupabaseConfig()).toBeNull();

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_abc");
    expect(getSupabaseConfig()).toBeNull();
  });

  it("ignores an invalid URL instead of crashing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not a url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_abc");
    expect(getSupabaseConfig()).toBeNull();
  });

  it("returns the public configuration when everything is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_abc");
    expect(getSupabaseConfig()).toEqual({
      url: "https://abc.supabase.co",
      publishableKey: "sb_publishable_abc",
    });
    expect(isAuthConfigured()).toBe(true);
  });
});
