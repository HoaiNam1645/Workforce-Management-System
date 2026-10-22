export function formatDurationSeconds(totalSeconds: number) {
  const sign = totalSeconds < 0 ? "-" : "";
  const value = Math.max(Math.round(Math.abs(totalSeconds)), 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  const hourText = hours === 0 ? "00" : String(hours);
  return `${sign}${hourText}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatDurationMinutes(totalMinutes: number) {
  return formatDurationSeconds(totalMinutes * 60);
}

export function formatDurationHours(totalHours: number) {
  return formatDurationSeconds(totalHours * 3600);
}
