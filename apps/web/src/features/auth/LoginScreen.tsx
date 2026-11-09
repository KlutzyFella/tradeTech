import type { Me } from "@tradetech/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/live"

export function LoginScreen() {
  const queryClient = useQueryClient()
  const [roomCode, setRoomCode] = useState("")
  const [loginName, setLoginName] = useState("")
  const [password, setPassword] = useState("")

  const login = useMutation({
    mutationFn: () => api.post<Me>("/auth/team/login", { roomCode, loginName, password }),
    onSuccess: (me) => queryClient.setQueryData(queryKeys.me, me),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate()
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">TradeTech</h1>
        <p className="text-muted-foreground">Sign in with the room code and team login your host gave you.</p>
      </header>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="roomCode">Room code</Label>
          <Input
            id="roomCode"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            className="h-11 text-lg tracking-widest"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loginName">Team login</Label>
          <Input
            id="loginName"
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="h-11"
          />
        </div>
        {login.error && (
          <p role="alert" className="text-sm text-destructive">
            {login.error.message}
          </p>
        )}
        <Button type="submit" size="lg" className="h-11" disabled={login.isPending || !roomCode || !loginName || !password}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  )
}
