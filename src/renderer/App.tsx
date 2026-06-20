import { useMemo } from "react";

export function App(): JSX.Element {
  const statusText = useMemo(() => "Cuely bootstrap ready", []);
  return (
    <main>
      <h1>Cuely</h1>
      <p>{statusText}</p>
    </main>
  );
}
