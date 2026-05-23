import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { MobileNavigation, DesktopSidebar } from "./components/Navigation";
import { SplashScreen } from "./screens/SplashScreen";
import { WelcomeScreen } from "./screens/WelcomeScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { MoodSelectionScreen } from "./screens/MoodSelectionScreen";
import { MatchingScreen } from "./screens/MatchingScreen";
import { ChatScreen } from "./screens/ChatScreen";
import { VoiceCallScreen } from "./screens/VoiceCallScreen";
import { ConnectionsScreen } from "./screens/ConnectionsScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { useLocation } from "react-router";

function AppContent() {
  const location = useLocation();
  const hideNavigation = [
    "/",
    "/welcome",
    "/onboarding",
    "/mood",
    "/matching",
    "/voice-call",
  ].includes(location.pathname);

  return (
    <div className="min-h-screen bg-background">
      {!hideNavigation && <DesktopSidebar />}
      <Routes>
        <Route path="/" element={<SplashScreen />} />
        <Route path="/welcome" element={<WelcomeScreen />} />
        <Route path="/onboarding" element={<OnboardingScreen />} />
        <Route path="/mood" element={<MoodSelectionScreen />} />
        <Route path="/matching" element={<MatchingScreen />} />
        <Route path="/chat" element={<ChatScreen />} />
        <Route path="/voice-call" element={<VoiceCallScreen />} />
        <Route path="/connections" element={<ConnectionsScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/home" element={<HomeScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!hideNavigation && <MobileNavigation />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
