# Channel Tabs — Mattermost Plugin

Add customizable tabs to Mattermost channels: external links, embedded Markdown pages, and folders for organizing documentation, rules, and knowledge bases.

## Features

- **Link tabs** — pin external URLs to a channel for quick access
- **Page tabs** — create rich Markdown pages directly inside a channel (backed by real Mattermost posts for full mobile compatibility)
- **Folders** — group related tabs into collapsible folders (one level of nesting)
- **Drag & drop** — reorder tabs and move them between folders
- **Custom icons** — assign emoji icons to any tab
- **Channel header sync** — optionally mirror tabs as Markdown links in the channel header so mobile clients can see them
- **Fallback post** — when the header overflows, a bot post with the full navigation is auto-maintained and linked from the header
- **Localization** — English and Ukrainian UI

## Screenshots

*(coming soon)*

## Requirements

- Mattermost Server **7.0+**
- Plugin uploads enabled in System Console (`PluginSettings.EnableUploads = true`)

## Installation

1. Download the latest release `.tar.gz` from the [Releases](../../releases) page (or build from source — see below).
2. In Mattermost, go to **System Console → Plugins → Plugin Management**.
3. Upload the `.tar.gz` file and click **Enable**.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| **Maximum Tabs Per Channel** | 30 | Limit of tabs allowed per channel (1–50). |
| **Sync Tabs to Channel Header** | false | Mirror link tabs as Markdown in the channel header for mobile visibility. |

## Usage

1. Open any channel and click the **Channel Tabs** button in the channel header.
2. The Right-Hand Sidebar panel opens with the tab list.
3. Click **+ Add Tab** to create a link, page, or folder.
4. Only channel/team/system admins can manage tabs; all members can view them.

## Building from Source

Prerequisites: **Go 1.21+**, **Node.js 18+**, **npm 9+**.

```bash
# Clone the repo
git clone https://github.com/<your-org>/mattermost-plugin-channel-tabs.git
cd mattermost-plugin-channel-tabs

# Build the distributable
make dist
```

The resulting `.tar.gz` will be in the `dist/` directory.

## Development

```bash
# Watch mode (auto-deploys to a local Mattermost instance with Local Mode enabled)
make watch
```

## License

This project is licensed under the Apache 2.0 License — see the [LICENSE](LICENSE) file for details.
