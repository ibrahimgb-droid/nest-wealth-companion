import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;
export type Account = Tables<"accounts">;
export type Transaction = Tables<"transactions">;
export type Budget = Tables<"budgets">;

async function uid() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Not signed in");
  return id;
}

export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const id = await uid();
    const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Profile not found");
    return data;
  },
});

export const accountsQuery = queryOptions({
  queryKey: ["accounts"],
  queryFn: async () => {
    const { data, error } = await supabase.from("accounts").select("*").order("created_at");
    if (error) throw error;
    return data;
  },
});

export const transactionsQuery = queryOptions({
  queryKey: ["transactions"],
  queryFn: async () => {
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .gte("occurred_at", since.toISOString())
      .order("occurred_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return data;
  },
});

export const budgetsQuery = queryOptions({
  queryKey: ["budgets"],
  queryFn: async () => {
    const { data, error } = await supabase.from("budgets").select("*").order("created_at");
    if (error) throw error;
    return data;
  },
});

export const allFinanceQueries = [profileQuery, accountsQuery, transactionsQuery, budgetsQuery] as const;

/** Loads everything a signed-in page needs; sends users who haven't finished setup to onboarding. */
export async function ensureFinanceData(qc: import("@tanstack/react-query").QueryClient) {
  const [profile] = await Promise.all([
    qc.ensureQueryData(profileQuery),
    qc.ensureQueryData(accountsQuery),
    qc.ensureQueryData(transactionsQuery),
    qc.ensureQueryData(budgetsQuery),
  ]);
  if (!profile.onboarded_at) throw redirect({ to: "/onboarding" });
}

/** Onboarding needs the full cache too (sheets read it) but must not redirect to itself. */
export async function ensureOnboardingData(qc: import("@tanstack/react-query").QueryClient) {
  const [profile] = await Promise.all([
    qc.ensureQueryData(profileQuery),
    qc.ensureQueryData(accountsQuery),
    qc.ensureQueryData(transactionsQuery),
    qc.ensureQueryData(budgetsQuery),
  ]);
  if (profile.onboarded_at) throw redirect({ to: "/dashboard" });
}

export function useFinance() {
  const profile = useSuspenseQuery(profileQuery).data;
  const accounts = useSuspenseQuery(accountsQuery).data;
  const transactions = useSuspenseQuery(transactionsQuery).data;
  const budgets = useSuspenseQuery(budgetsQuery).data;
  return { profile, accounts, transactions, budgets };
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: TablesUpdate<"profiles">) => {
      const id = await uid();
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: profileQuery.queryKey });
      const prev = qc.getQueryData(profileQuery.queryKey);
      if (prev) qc.setQueryData(profileQuery.queryKey, { ...prev, ...patch } as Profile);
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(profileQuery.queryKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: profileQuery.queryKey }),
  });
}

export function useAddTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Omit<TablesInsert<"transactions">, "user_id">[]) => {
      const user_id = await uid();
      const { error } = await supabase.from("transactions").insert(rows.map((r) => ({ ...r, user_id })));
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: transactionsQuery.queryKey });
      qc.invalidateQueries({ queryKey: accountsQuery.queryKey });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: transactionsQuery.queryKey });
      qc.invalidateQueries({ queryKey: accountsQuery.queryKey });
    },
  });
}

export function useToggleShariah() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("transactions").update({ shariah_compliant: value }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, value }) => {
      await qc.cancelQueries({ queryKey: transactionsQuery.queryKey });
      const prev = qc.getQueryData(transactionsQuery.queryKey);
      if (prev)
        qc.setQueryData(
          transactionsQuery.queryKey,
          prev.map((t) => (t.id === id ? { ...t, shariah_compliant: value } : t)),
        );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(transactionsQuery.queryKey, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: transactionsQuery.queryKey }),
  });
}

export function useUpsertBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ category, monthly_limit }: { category: string; monthly_limit: number }) => {
      const user_id = await uid();
      const { error } = await supabase
        .from("budgets")
        .upsert({ user_id, category, monthly_limit }, { onConflict: "user_id,category" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: budgetsQuery.queryKey }),
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: budgetsQuery.queryKey }),
  });
}

export function useAddAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Omit<TablesInsert<"accounts">, "user_id">) => {
      const user_id = await uid();
      const { data, error } = await supabase
        .from("accounts")
        .insert({ ...row, user_id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (account) => {
      const prev = qc.getQueryData(accountsQuery.queryKey);
      if (prev) qc.setQueryData(accountsQuery.queryKey, [...prev, account]);
      qc.invalidateQueries({ queryKey: accountsQuery.queryKey });
    },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Pick<TablesUpdate<"accounts">, "name" | "institution"> }) => {
      const { error } = await supabase.from("accounts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: accountsQuery.queryKey }),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountsQuery.queryKey });
      qc.invalidateQueries({ queryKey: transactionsQuery.queryKey });
    },
  });
}
