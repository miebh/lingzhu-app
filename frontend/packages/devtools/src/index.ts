/**
 * Development-only tooling. Nothing here ships in a release build: the desktop
 * entry imports it behind an `import.meta.env.MODE` check, so a production
 * bundle drops the whole package.
 */
export { copyValue, describeElement, mountInspector, type InspectTarget } from "./inspector";
