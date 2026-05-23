// Phase 1: GET /me + PATCH /me/profile + stats from GET /me/stats (V1).
export default function ProfilePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-2xl mb-2">Profile</h1>
        <p className="text-muted-foreground text-sm">Phase 1 — see VENTLY_PLAN.md §6.</p>
      </div>
    </div>
  );
}
