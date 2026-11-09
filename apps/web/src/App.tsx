import { LoginScreen } from "@/features/auth/LoginScreen"
import { HostApp } from "@/features/host/HostApp"
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
  return <HostApp me={me.data} />
}

export default App
