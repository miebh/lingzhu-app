import { onMount } from "solid-js";
import { AppShell } from "./app/AppShell";
import { Toaster } from "./components/shell/Toaster";
import { startApp } from "./store/bootstrap";

/** Stores are module singletons, so the tree needs no provider chain. */
export default function App() {
  onMount(() => {
    startApp();
  });

  return (
    <>
      <AppShell />
      <Toaster />
    </>
  );
}
