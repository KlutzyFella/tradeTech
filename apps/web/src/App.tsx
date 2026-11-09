import { Button } from "@/components/ui/button"

/**
 * Placeholder shell. Participant screens (join, market, ticket, portfolio,
 * news, results) and the host console arrive in stages B–C of the blueprint.
 */
export function App() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">TradeTech</h1>
        <p className="text-sm text-muted-foreground">
          Live stock-trading competition. Enter your room code to join your team.
        </p>
      </header>
      <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Room code
          <input
            name="roomCode"
            autoComplete="off"
            inputMode="text"
            className="h-10 rounded-md border border-input bg-background px-3 font-mono uppercase"
            disabled
          />
        </label>
        <Button type="submit" disabled>
          Join room (coming soon)
        </Button>
      </form>
    </main>
  )
}

export default App
