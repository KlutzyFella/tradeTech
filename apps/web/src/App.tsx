import { LoginScreen } from "@/features/auth/LoginScreen"
import { TeamShell } from "@/features/shell/TeamShell"
import { useMe } from "@/lib/queries"

export function App() {
  const me = useMe()
  if (me.isPending) return null
  if (me.isError) {
    return <p className="p-6 text-destructive">Can’t reach the TradeTech server. Check your connection and reload.</p>
  }
  if (!me.data) return <LoginScreen />
  if (me.data.kind === "team") return <TeamShell me={me.data} />
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold">Signed in as host</h1>
      <p className="mt-2 text-muted-foreground">The host console is the next build step. Use the host API for now.</p>
    </main>
  )
}

export default App
