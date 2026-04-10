package main

import "fmt"

type TabType string

const (
	TabTypeLink   TabType = "link"
	TabTypePage   TabType = "page"
	TabTypeFolder TabType = "folder"
)

const (
	maxContentSize    = 50 * 1024
	maxRootTabs       = 20
	maxItemsPerFolder = 20
)

type Tab struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Icon        string   `json:"icon,omitempty"`
	URL         string   `json:"url,omitempty"`
	PostID      string   `json:"post_id,omitempty"`
	Type        TabType  `json:"type"`
	ParentID    string   `json:"parent_id"`
	Content     string   `json:"content,omitempty"`
	Format      string   `json:"format,omitempty"`
	PageFileIDs []string `json:"page_file_ids,omitempty"`
	SortOrder   int      `json:"sort_order"`
	IsActive    bool     `json:"is_active"`
	Permissions []string `json:"permissions,omitempty"`
	CreatedBy   string   `json:"created_by"`
	CreatedAt   int64    `json:"created_at"`
	UpdatedAt   int64    `json:"updated_at"`
}

type ChannelTabs struct {
	ChannelID string `json:"channel_id"`
	Tabs      []Tab  `json:"tabs"`
	Version   int64  `json:"version"`
}

type CreateTabRequest struct {
	Title       string   `json:"title"`
	Icon        string   `json:"icon,omitempty"`
	URL         string   `json:"url,omitempty"`
	Type        TabType  `json:"type"`
	ParentID    string   `json:"parent_id"`
	Content     string   `json:"content,omitempty"`
	Permissions []string `json:"permissions,omitempty"`
}

type UpdateTabRequest struct {
	Title       *string  `json:"title,omitempty"`
	Icon        *string  `json:"icon,omitempty"`
	URL         *string  `json:"url,omitempty"`
	IsActive    *bool    `json:"is_active,omitempty"`
	Permissions []string `json:"permissions,omitempty"`
}

type UpdatePageContentRequest struct {
	Content             string   `json:"content"`
	DismissFileIDs      []string `json:"dismiss_file_ids,omitempty"`
	ExtraTrackedFileIDs []string `json:"extra_tracked_file_ids,omitempty"`
}

type MoveTabRequest struct {
	ParentID string `json:"parent_id"`
}

type ReorderTabsRequest struct {
	TabIDs   []string `json:"tab_ids"`
	ParentID string   `json:"parent_id"`
}

func (r *CreateTabRequest) IsValid() error {
	if r.Title == "" {
		return fmt.Errorf("title is required")
	}
	if len(r.Title) > 100 {
		return fmt.Errorf("title must be 100 characters or less")
	}

	switch r.Type {
	case TabTypeLink:
		if r.URL == "" {
			return fmt.Errorf("url is required for link tabs")
		}
		if len(r.URL) > 2048 {
			return fmt.Errorf("url must be 2048 characters or less")
		}
	case TabTypePage:
		if len(r.Content) > maxContentSize {
			return fmt.Errorf("content must be 50KB or less")
		}
	case TabTypeFolder:
		// folders have no url or content
	default:
		return fmt.Errorf("invalid tab type: %s", r.Type)
	}

	return nil
}

// --- hierarchy helpers ---

func countRootTabs(tabs []Tab) int {
	n := 0
	for _, t := range tabs {
		if t.ParentID == "" {
			n++
		}
	}
	return n
}

func countChildren(tabs []Tab, folderID string) int {
	n := 0
	for _, t := range tabs {
		if t.ParentID == folderID {
			n++
		}
	}
	return n
}

func findTab(tabs []Tab, id string) *Tab {
	for i := range tabs {
		if tabs[i].ID == id {
			return &tabs[i]
		}
	}
	return nil
}

func isFolder(tabs []Tab, id string) bool {
	t := findTab(tabs, id)
	return t != nil && t.Type == TabTypeFolder
}
