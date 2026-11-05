import { createCn } from "cn/config";

// The app's type roles are custom theme keys, so register them as font sizes.
// Without this, a merge such as "text-meta text-text-muted" treats the size as
// a color and drops it.
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["caption", "meta", "body", "row", "reading"] }],
    },
  },
});
