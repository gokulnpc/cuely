import { useMemo, type ReactElement } from "react";

export function App(): ReactElement {
  const statusText = useMemo(() => "Cuely bootstrap ready", []);
  return (
    <main>
      <h1>Cuely</h1>
      <p>{statusText}</p>
    </main>
  );
}
