import type { Me } from "@tradetech/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import { brand } from "@/brand"
import { BrandLockup } from "@/components/brand/BrandLogo"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/live"
import { cn } from "@/lib/utils"

type Mode = "team" | "host"

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>("team")
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Brand panel: always the club's charcoal, whatever the theme. */}
      <section className="dark relative isolate flex flex-col justify-between gap-8 overflow-hidden bg-[var(--neutral-950)] px-6 py-8 text-foreground sm:px-10 lg:px-14 lg:py-12">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-1.5 bg-brand max-lg:hidden" />
        {/* The club's symbol, oversized and faint: brand geometry instead of decoration. */}
        <img
          src={brand.markSrc}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute -right-16 -bottom-24 -z-10 w-[34rem] opacity-[0.07] select-none max-lg:hidden"
        />
        <div className="flex items-center gap-4 lg:flex-col lg:items-start lg:gap-10">
          <BrandLockup className="w-20 sm:w-24 lg:w-44" />
          <div className="flex flex-col gap-2 lg:gap-4">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl lg:text-5xl">
              Trade the news.
              <br />
              Beat the room.
            </h1>
            <p className="max-w-md text-sm text-muted-foreground lg:text-base">{brand.tagline}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground max-lg:hidden">
          {brand.productName} trading competition, run with {brand.clientName}.
        </p>
      </section>

      <main className="relative flex flex-col justify-center px-6 py-10 sm:px-10">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-col gap-7">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">{mode === "team" ? "Join your room" : "Host sign-in"}</h2>
            <p className="text-sm text-muted-foreground">
              {mode === "team"
                ? "Use the room code, team login and password from your host."
                : "Sign in to set up and run your events."}
            </p>
          </div>
          <div role="group" aria-label="Who is signing in" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(["team", "host"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "h-9 rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  mode === m ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/25" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "team" ? "Team sign-in" : "Host sign-in"}
              </button>
            ))}
          </div>
          {mode === "team" ? <TeamForm /> : <HostForm />}
        </div>
      </main>
    </div>
  )
}

function useLogin(path: string, body: () => unknown) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<Me>(path, body()),
    onSuccess: (me) => queryClient.setQueryData(queryKeys.me, me),
  })
}

function Field(props: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  className?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        required
        className={cn("h-11", props.className)}
      />
    </div>
  )
}

function SubmitArea({ error, pending, disabled }: { error: Error | null; pending: boolean; disabled: boolean }) {
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11 text-base" disabled={pending || disabled}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </>
  )
}

function TeamForm() {
  const [roomCode, setRoomCode] = useState("")
  const [loginName, setLoginName] = useState("")
  const [password, setPassword] = useState("")
  const login = useLogin("/auth/team/login", () => ({ roomCode, loginName, password }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate()
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <Field
        id="roomCode"
        label="Room code"
        value={roomCode}
        onChange={(v) => setRoomCode(v.toUpperCase())}
        autoComplete="off"
        className="figures text-lg tracking-[0.2em] uppercase"
      />
      <Field id="loginName" label="Team login" value={loginName} onChange={setLoginName} autoComplete="username" />
      <Field id="password" label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
      <SubmitArea error={login.error} pending={login.isPending} disabled={!roomCode || !loginName || !password} />
    </form>
  )
}

function HostForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const login = useLogin("/auth/host/login", () => ({ email, password }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate()
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" />
      <Field id="host-password" label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
      <SubmitArea error={login.error} pending={login.isPending} disabled={!email || !password} />
    </form>
  )
}
