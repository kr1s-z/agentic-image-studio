import { useState } from "react";
import LandingScreen from "./components/LandingScreen";
import JobDashboard from "./components/JobDashboard";

type Screen = "landing" | "dashboard";

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [jobId, setJobId] = useState<string | null>(null);
  const [originalImages, setOriginalImages] = useState<string[]>([]);
  const [goal, setGoal] = useState("");
  const [model, setModel] = useState("");

  function handleJobCreated(
    id: string,
    imageUrls: string[],
    goalText: string,
    selectedModel: string,
  ) {
    setJobId(id);
    setOriginalImages(imageUrls);
    setGoal(goalText);
    setModel(selectedModel);
    setScreen("dashboard");
  }

  function handleReset() {
    setScreen("landing");
    setJobId(null);
    setOriginalImages([]);
    setGoal("");
    setModel("");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      {screen === "landing" ? (
        <LandingScreen onJobCreated={handleJobCreated} />
      ) : (
        <JobDashboard
          jobId={jobId!}
          originalImages={originalImages}
          goal={goal}
          model={model}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
