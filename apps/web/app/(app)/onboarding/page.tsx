// Phase 1: nickname + gender + 18+ confirmation, posted to PATCH /me/profile.
export default function OnboardingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-2xl mb-2">Onboarding</h1>
        <p className="text-muted-foreground text-sm">Phase 1 — see VENTLY_PLAN.md §6.</p>
      </div>
    </div>
  );
}
