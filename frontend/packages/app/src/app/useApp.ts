/**
 * Component-facing facade over the global stores.
 *
 * Layer rule: components import from `app/` (or `lib/`), never from `store/`
 * directly. Stores own external state and event ingestion; this module is the
 * single door the UI uses, so a store can change shape without touching every
 * component.
 */
export { usePreferences, usePreferencesStore } from "../store/preferences";
export { notify, notifySession } from "../store/notify";
export { useCatalogStore, useCatalog } from "../store/catalog";
