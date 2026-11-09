import type { Me } from "@tradetech/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/live"

type Mode = "team" | "host"

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>("team")
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">TradeTech</h1>
        <p className="text-muted-foreground">
          {mode === "team"
            ? "Sign in with the room code and team login your host gave you."
            : "Sign in to run your events."}
        </p>
      </header>
      {mode === "team" ? <TeamForm /> : <HostForm />}
      <button
        type="button"
        onClick={() => setMode(mode === "team" ? "host" : "team")}
        className="self-start text-sm text-muted-foreground underline underline-offset-4 outline-none focus-visible:text-foreground"
      >
        {mode === "team" ? "Running an event? Host sign-in" : "Joining a room? Team sign-in"}
      </button>
    </main>
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
        className={props.className ?? "h-11"}
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
      <Button type="submit" size="lg" className="h-11" disabled={pending || disabled}>
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
      <Field id="roomCode" label="Room code" value={roomCode} onChange={(v) => setRoomCode(v.toUpperCase())} autoComplete="off" className="h-11 text-lg tracking-widest" />
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
