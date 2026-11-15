/**
 * Bundled language and theme catalogs are not used by this app: the diff
 * renderer always runs the Highlights backend with the registered Lingzhu
 * theme, so the Shiki/TextMate path and the catalog loaders are never reached.
 * Aliasing them keeps ~400 language/theme chunks out of the build.
 */

function unavailable(name: string): never {
  throw new Error(`${name} is not bundled in this build.`);
}

export const bundledLanguages = {};

export const themes = {
  getTheme: () => undefined,
};

export default unavailable;
