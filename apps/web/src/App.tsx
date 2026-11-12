import { LoginScreen } from "@/features/auth/LoginScreen"
import { HostApp } from "@/features/host/HostApp"
import { ProjectorScreen } from "@/features/projector/ProjectorScreen"
import { TeamShell } from "@/features/shell/TeamShell"
import { useMe } from "@/lib/queries"

export function App() {
  const me = useMe()
  if (me.isPending) return null
  if (me.isError) {
    return <p className="p-6 text-destructive">Can’t reach the TradeTech server. Check your connection and reload.</p>
  }
  if (!me.data) return <LoginScreen />
  // The venue's big screen: /projector/<roomId>, for the event's host.
  const projector = /^\/projector\/([1-9]\d{0,17})\/?$/.exec(window.location.pathname)
  if (projector) {
    if (me.data.kind !== "host") {
      return <p className="p-6 text-muted-foreground">The projector view is for hosts. Sign in as the event’s host to open it.</p>
    }
    return <ProjectorScreen roomId={projector[1]!} />
  }
  if (me.data.kind === "team") return <TeamShell me={me.data} />
  return <HostApp me={me.data} />
}

export default App
