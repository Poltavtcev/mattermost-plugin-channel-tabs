# Changelog

This file is the **source of truth in-repo** for what each version contains. GitHub **Releases** should match these sections for the same tag.

**Why things used to diverge:** the changelog here was updated in small steps during development (sometimes mixing unreleased ideas with shipped fixes), while GitHub release notes are written at tag time from a fuller summary. From **v1.3.6** onward, keep this file and the GitHub release text in sync when you publish a tag.

---

## v1.3.6

### Fixes

- **RHS popout / header hint on Mattermost 11.6+:** the webapp changed popout routing (channel is passed as `?channel=` instead of an extra path segment). The plugin now picks the URL shape using **`GetServerVersion()`**: **11.6.0+** → `/_popout/rhs/{team}/plugin/channel-tabs?channel={Channel.Name}`; **older** (e.g. 11.4.x) → the previous `/_popout/rhs/{team}/{channelName}/plugin/channel-tabs` format so existing servers keep working.

---

## v1.3.5

### Fixes

- **RHS popout / header hint URL:** hint links use `/_popout/rhs/{team}/{channelName}/plugin/channel-tabs` where `{channelName}` is the server **Channel.Name** (the URL segment Mattermost uses — e.g. `town-square`, or a generated handle when the display name is not Latin). The webapp resolves the channel from that segment and still supports legacy bookmarks (id in path, optional `?channel=`, collapsed empty-team paths).
- **DM/GM header hints:** stronger fallbacks for the `{team}` slug when the channel has no `TeamId` — channel creator, `GetUsersInChannel`, and paginated `GetChannelMembers` when the bot or actor has no team membership.

### Improvements

- **Page Markdown:** links in rendered pages open in a new browser tab (`target="_blank"`, `rel="noopener noreferrer"`), except pure in-page anchors (`#...`), since the RHS panel is narrow.

---

## v1.3.4

### New

- **Header hint text override** (`HeaderHintLabel`): optional plugin setting to customize the label of the single hint link in the channel header (when **Header display mode** is *Show tab hint only*). If left empty, the default localized hint text is used.

### Fixes

- **Page Markdown line breaks:** micromark keeps newline characters inside paragraph text, but the browser collapses them to spaces by default. The page preview now uses `white-space: pre-line` on prose blocks (and normalizes CRLF before sanitize) so line breaks in the editor match the rendered page.
- **Channel header sync:** normalize **Header display mode** values (trim + case) so `hint` / `full` are not misread as `none`; background header refresh uses the plugin bot user and extra team fallbacks when resolving the RHS popout team slug (fixes missing or broken header hints after config changes).

### Improvements

- **Page editor — file chips:** files uploaded or previously linked are tracked in **`page_file_ids`** on the server. Removing a file link from the page text **does not** hide the chip until the user clicks **×** and **saves**. **×** queues removal for the next save (`dismiss_file_ids`). Chip labels keep the **last known** display name (markdown, upload, or API). First-session uploads before save use `extra_tracked_file_ids` so orphans are not lost.

---

## v1.3.3

### New

- Added a **Back to channel** button in the RHS popout window.
- Added a post context menu action: **Add to Channel Tabs** (creates a Link tab to the post permalink).
- Added **search + filter** controls in the Channel Tabs RHS:
  - Search by tab title
  - Search by link URL (External link tabs)
  - Search by page Markdown content (Page tabs)
  - Filter by tab type: All / External links / Pages / Folders
- When a match is inside a folder, the RHS automatically expands the folder to show it.

### Improvements

- Embedded YouTube links in Page tabs now render reliably as an `<iframe>` embed (includes `referrerPolicy` fix for YouTube player error 153).
- Stabilized header hint mode behavior when bot posts are disabled.

### Fixes

- Fixed channel header hint popout link format to include the channel name (improves behavior on mobile clients when opening the Channel Tabs popout).
- **Direct messages / group messages:**
  - Allow all participants to manage tabs (not only admins).
  - Fix header hint popout links when team slug is missing (prevents `/_popout/rhs//...`).
  - Fix popout back button to return to the correct DM via `/{team}/messages/@username`.

---

## v1.3.2

### New

- **Page Editor — file upload:** upload files while editing a page; inserts a Markdown link at the cursor (`![name](url)` for images, `[name](url)` for other files).
- **Page Editor — linked files panel:** compact chips for linked files; **×** removes the corresponding Markdown reference.
- **Header Display Mode** setting: do not display in header / hint only / full list in header; backward compatibility for legacy `SyncTabsToHeader`.

### Improvements

- In hint mode, the plugin updates only its own hint line in the channel header and keeps other header content intact; the hint link is updated in place.
- Folder UX in RHS: only one folder expanded at a time.
- File links use absolute URLs in inserted Markdown and in bot-backed page post normalization.

### Fixes

- Fixed intermittent non-clickable Page links in channel header sync.
- Added permalink fallback to `/pl/{post_id}` when team slug is unavailable.
- Automatic recovery for missing `post_id` on Page tabs when header sync is enabled.
- Restored spacing between root tab entries in compact channel header markdown.
- Header cleanup when header sync is disabled; best-effort cleanup on plugin deactivation.
- CI: golangci/gofmt-related adjustments (`interface{}` → `any`, etc.).

---

## v1.3.1

### Fixes

- Plugin settings: removed Ukrainian from admin-facing settings (System Console does not i18n plugin settings); settings are English-only.
- CI / check-style: TypeScript fixes (`@types/react-dom`, `registerReducer`, `getPluginState` typing).

---

## v1.3.0

### Changes

- Mobile fallback is **opt-in**: page-backing posts, channel header sync, and the fallback navigation post are created only when **Sync Tabs to Channel Header** is enabled. By default, tabs work via the RHS only.
- Removed the “Channel Tabs Plugin Settings” header from System Console.
- Bilingual (EN/UK) help text for plugin settings.
- ESLint fixes across the webapp (import order, JSX, nested ternaries, etc.).

---

## v1.2.0 — initial public release

### Features

- Link tabs, Page tabs (Markdown, Mattermost-backed posts), folders (one level), drag-and-drop reorder.
- Custom emoji icons; optional channel header sync; fallback post when header exceeds length; EN/UK UI.
- Permissions: admins manage tabs; members view.

### Technical

- Server: Go, Gorilla Mux, KV store with atomic updates.
- Webapp: React, Redux, TypeScript, SCSS.
- Plugin ID: `channel-tabs`; minimum Mattermost: **7.0.0**.

---

## Publishing a release (maintainers)

1. Confirm `plugin.json` → `"version"` matches the section you are shipping (e.g. **1.3.6**).
2. Run `make dist` — artifact: `dist/channel-tabs-<version>.tar.gz`.
3. Create and push an annotated tag: `git tag -a v1.3.6 -m "v1.3.6"` then `git push origin v1.3.6`.
4. On GitHub **Releases**: create release from that tag, attach the tarball, paste the matching **## v1.3.6** block from this file as the description.
