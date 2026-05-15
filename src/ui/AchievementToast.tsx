import { useGameStore } from "../store/useGameStore";

export function AchievementToast() {
  const toast = useGameStore((s) => s.achievementToast);
  const dismiss = useGameStore((s) => s.dismissAchievementToast);
  if (!toast) return null;
  return (
    <div className="achievement-toast" onClick={dismiss}>
      <div className="ach-icon">✦</div>
      <div className="ach-body">
        <div className="ach-title">Achievement unlocked</div>
        <div className="ach-name">{toast.title}</div>
        <div className="ach-desc">{toast.description}</div>
      </div>
    </div>
  );
}
