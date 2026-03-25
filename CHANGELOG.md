# Changelog

## v1.3.3

### New

- Added a **Back to channel** button in the RHS popout window.
- Added a post context menu action: **Add to Channel Tabs** (creates a Link tab to the post permalink).
- Added **search + filter** controls in the Channel Tabs RHS:
  - Search by tab title
  - Search by link URL (for External link tabs)
  - Search by **page Markdown content** (for Page tabs)
  - Filter by tab type: All / External links / Pages / Folders
- When a match is inside a folder, the RHS automatically expands the folder to show it.

### Improvements

- Embedded YouTube links in Page tabs now render reliably as an `<iframe>` embed (includes `referrerPolicy` fix for YouTube player error 153).
- Stabilized header **hint mode** behavior when bot posts are disabled.

### Fixes

- Fixed channel header hint popout link format to include the **channel name** (improves behavior on mobile clients when opening the Channel Tabs popout).

