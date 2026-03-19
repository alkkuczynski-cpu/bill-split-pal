import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Summary = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <button
        onClick={() => navigate(-1)}
        className="absolute top-6 left-4 w-10 h-10 rounded-xl bg-card flex items-center justify-center shadow-sm border border-border"
      >
        <ArrowLeft className="w-5 h-5 text-foreground" />
      </button>
      <h1 className="text-2xl font-display font-bold text-foreground mb-2">Summary</h1>
      <p className="text-muted-foreground text-center">Coming soon — final split breakdown will appear here.</p>
    </div>
  );
};

export default Summary;
