import { onMount } from "solid-js";
import { AppRoot } from "./app/routes";
import { startApp } from "./store/bootstrap";

/** Stores are module singletons, so the tree needs no provider chain. */
export default function App() {
  onMount(() => {
    startApp();
  });

  return <AppRoot />;
}
