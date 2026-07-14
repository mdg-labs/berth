// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon, KeyRoundIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { useAuthUser } from "@/components/providers/auth-guard";
import { ErrorAlert } from "@/components/catalog/error-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toastManager } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import { formatApiError } from "@/lib/i18n/api-error";

type TokenSummary = {
  id: string;
  name: string;
  tokenPrefix: string;
  allowPull: boolean;
  allowPush: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  repositoryIds: string[];
  repositoryNames: string[];
};

type TokensResponse = {
  tokens: TokenSummary[];
  repositories: Array<{
    id: string;
    name: string;
    role: string | null;
  }>;
  policy: {
    patMaxValidityDays: number | null;
    patAllowNeverExpire: boolean;
  };
};

type CreateTokenResponse = {
  token: string;
  summary: TokenSummary;
};

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString();
}

export function AccountTokensSection() {
  const { data: authData } = useAuthUser();
  const user = authData?.user;
  const t = useTranslations("account.tokens");
  const tErrors = useTranslations("errorsApi");
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [allowPull, setAllowPull] = useState(true);
  const [allowPush, setAllowPush] = useState(false);
  const [scopeMode, setScopeMode] = useState<"all" | "selected">("all");
  const [selectedRepositoryIds, setSelectedRepositoryIds] = useState<string[]>([]);
  const [expiryMode, setExpiryMode] = useState<"never" | "custom">("never");
  const [expiresAt, setExpiresAt] = useState("");

  const tokensQuery = useQuery({
    queryKey: ["account-tokens"],
    queryFn: () => apiFetch<TokensResponse>("/api/account/tokens"),
  });

  const maxExpiryDate = useMemo(() => {
    const maxDays = tokensQuery.data?.policy.patMaxValidityDays;
    if (maxDays === null || maxDays === undefined) {
      return undefined;
    }
    const date = new Date();
    date.setDate(date.getDate() + maxDays);
    return date.toISOString().slice(0, 10);
  }, [tokensQuery.data?.policy.patMaxValidityDays]);

  const minExpiryDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }, []);

  function resetCreateForm() {
    setName("");
    setAllowPull(true);
    setAllowPush(false);
    setScopeMode("all");
    setSelectedRepositoryIds([]);
    setExpiryMode("never");
    setExpiresAt("");
  }

  const createMutation = useMutation({
    mutationFn: () => {
      let parsedExpiresAt: string | null = null;
      if (expiryMode === "custom" && expiresAt) {
        parsedExpiresAt = new Date(`${expiresAt}T23:59:59.999Z`).toISOString();
      }

      return apiFetch<CreateTokenResponse>("/api/account/tokens", {
        method: "POST",
        body: {
          name,
          allowPull,
          allowPush,
          expiresAt: parsedExpiresAt,
          repositoryIds:
            scopeMode === "selected" ? selectedRepositoryIds : null,
        },
      });
    },
    onSuccess: (data) => {
      setCreatedToken(data.token);
      setCreateOpen(false);
      resetCreateForm();
      void queryClient.invalidateQueries({ queryKey: ["account-tokens"] });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.createErrorTitle"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (tokenId: string) =>
      apiFetch(`/api/account/tokens/${tokenId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["account-tokens"] });
      toastManager.add({
        type: "success",
        title: t("toast.revokeSuccessTitle"),
        description: t("toast.revokeSuccessDescription"),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.revokeErrorTitle"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
  });

  function toggleRepository(repositoryId: string, checked: boolean) {
    setSelectedRepositoryIds((current) =>
      checked
        ? [...current, repositoryId]
        : current.filter((id) => id !== repositoryId),
    );
  }

  useEffect(() => {
    if (tokensQuery.data?.policy.patAllowNeverExpire === false) {
      setExpiryMode("custom");
    }
  }, [tokensQuery.data?.policy.patAllowNeverExpire]);

  const allowNeverExpire =
    tokensQuery.data?.policy.patAllowNeverExpire ?? true;
  const tokens = tokensQuery.data?.tokens ?? [];
  const repositories = tokensQuery.data?.repositories ?? [];

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRoundIcon className="size-5" />
              {t("title")}
            </CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            {t("createToken")}
          </Button>
        </CardHeader>
        <CardContent>
          {tokensQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : tokensQuery.isError ? (
            <ErrorAlert error={tokensQuery.error} />
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.name")}</TableHead>
                  <TableHead>{t("columns.prefix")}</TableHead>
                  <TableHead>{t("columns.scopes")}</TableHead>
                  <TableHead>{t("columns.repositories")}</TableHead>
                  <TableHead>{t("columns.expires")}</TableHead>
                  <TableHead>{t("columns.lastUsed")}</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">{token.name}</TableCell>
                    <TableCell>
                      <code className="text-xs">{token.tokenPrefix}…</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {token.allowPull ? (
                          <Badge variant="secondary">{t("scope.pull")}</Badge>
                        ) : null}
                        {token.allowPush ? (
                          <Badge variant="secondary">{t("scope.push")}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {token.repositoryNames.length > 0
                        ? token.repositoryNames.join(", ")
                        : t("allRepositories")}
                    </TableCell>
                    <TableCell>
                      {token.revokedAt
                        ? t("status.revoked")
                        : token.expiresAt
                          ? formatDate(token.expiresAt)
                          : t("status.never")}
                    </TableCell>
                    <TableCell>{formatDate(token.lastUsedAt)}</TableCell>
                    <TableCell>
                      {!token.revokedAt ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("revoke")}
                          disabled={revokeMutation.isPending}
                          onClick={() => revokeMutation.mutate(token.id)}
                        >
                          <Trash2Icon />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            resetCreateForm();
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("createDialog.title")}</DialogTitle>
            <DialogDescription>{t("createDialog.description")}</DialogDescription>
          </DialogHeader>
          <Form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
            }}
          >
            <DialogPanel className="space-y-4">
            <Field>
              <FieldLabel htmlFor="token-name">{t("createDialog.name")}</FieldLabel>
              <Input
                id="token-name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>{t("createDialog.scopes")}</FieldLabel>
              <div className="flex flex-wrap gap-4">
                <Label className="flex items-center gap-2">
                  <Checkbox
                    checked={allowPull}
                    onCheckedChange={(checked) => setAllowPull(checked === true)}
                  />
                  {t("scope.pull")}
                </Label>
                <Label className="flex items-center gap-2">
                  <Checkbox
                    checked={allowPush}
                    onCheckedChange={(checked) => setAllowPush(checked === true)}
                  />
                  {t("scope.push")}
                </Label>
              </div>
            </Field>
            <Field>
              <FieldLabel>{t("createDialog.repositories")}</FieldLabel>
              <RadioGroup
                value={scopeMode}
                onValueChange={(value) =>
                  setScopeMode(value as "all" | "selected")
                }
              >
                <Label className="flex items-center gap-2">
                  <Radio value="all" />
                  {t("createDialog.allRepositories")}
                </Label>
                <Label className="flex items-center gap-2">
                  <Radio value="selected" />
                  {t("createDialog.selectedRepositories")}
                </Label>
              </RadioGroup>
              {scopeMode === "selected" ? (
                <div className="mt-3 max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                  {repositories.map((repository) => (
                    <Label
                      key={repository.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={selectedRepositoryIds.includes(repository.id)}
                        onCheckedChange={(checked) =>
                          toggleRepository(repository.id, checked === true)
                        }
                      />
                      {repository.name}
                    </Label>
                  ))}
                </div>
              ) : null}
            </Field>
            <Field>
              <FieldLabel>{t("createDialog.expiration")}</FieldLabel>
              <RadioGroup
                value={expiryMode}
                onValueChange={(value) =>
                  setExpiryMode(value as "never" | "custom")
                }
              >
                {allowNeverExpire ? (
                  <Label className="flex items-center gap-2">
                    <Radio value="never" />
                    {t("createDialog.neverExpire")}
                  </Label>
                ) : null}
                <Label className="flex items-center gap-2">
                  <Radio value="custom" />
                  {t("createDialog.customExpiry")}
                </Label>
              </RadioGroup>
              {expiryMode === "custom" ? (
                <Input
                  className="mt-2"
                  type="date"
                  required
                  min={minExpiryDate}
                  max={maxExpiryDate}
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              ) : null}
              {tokensQuery.data?.policy.patMaxValidityDays ? (
                <FieldDescription>
                  {t("createDialog.maxValidityHint", {
                    days: tokensQuery.data.policy.patMaxValidityDays,
                  })}
                </FieldDescription>
              ) : null}
            </Field>
            </DialogPanel>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                {t("createDialog.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  createMutation.isPending ||
                  (scopeMode === "selected" &&
                    selectedRepositoryIds.length === 0) ||
                  (!allowPull && !allowPush)
                }
                data-loading={createMutation.isPending ? "" : undefined}
              >
                {createMutation.isPending ? <Spinner /> : null}
                {t("createDialog.submit")}
              </Button>
            </DialogFooter>
          </Form>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={createdToken !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreatedToken(null);
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("createdDialog.title")}</DialogTitle>
            <DialogDescription>{t("createdDialog.description")}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <Field>
              <FieldLabel>{t("createdDialog.token")}</FieldLabel>
              <div className="flex gap-2">
                <Input readOnly value={createdToken ?? ""} />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (createdToken) {
                      void navigator.clipboard.writeText(createdToken);
                      toastManager.add({
                        type: "success",
                        title: t("createdDialog.copied"),
                      });
                    }
                  }}
                >
                  <CopyIcon />
                </Button>
              </div>
            </Field>
            {user ? (
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">{t("createdDialog.dockerTitle")}</p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">
                  {t("createdDialog.dockerInstructions", { email: user.email })}
                </pre>
              </div>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" onClick={() => setCreatedToken(null)}>
              {t("createdDialog.done")}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
