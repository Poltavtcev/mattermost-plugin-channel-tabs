package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

func (p *Plugin) initRouter() *mux.Router {
	router := mux.NewRouter()
	router.Use(p.MattermostAuthorizationRequired)

	api := router.PathPrefix("/api/v1").Subrouter()

	api.HandleFunc("/tabs", p.handleGetTabs).Methods(http.MethodGet)
	api.HandleFunc("/tabs", p.withTabAdmin(p.handleCreateTab)).Methods(http.MethodPost)
	api.HandleFunc("/tabs/reorder", p.withTabAdmin(p.handleReorderTabs)).Methods(http.MethodPut)
	api.HandleFunc("/tabs/{tab_id}/content", p.withTabAdmin(p.handleUpdatePageContent)).Methods(http.MethodPut)
	api.HandleFunc("/tabs/{tab_id}/move", p.withTabAdmin(p.handleMoveTab)).Methods(http.MethodPut)
	api.HandleFunc("/tabs/{tab_id}", p.withTabAdmin(p.handleUpdateTab)).Methods(http.MethodPut)
	api.HandleFunc("/tabs/{tab_id}", p.withTabAdmin(p.handleDeleteTab)).Methods(http.MethodDelete)

	api.HandleFunc("/config", p.handleGetConfig).Methods(http.MethodGet)

	return router
}

func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	p.router.ServeHTTP(w, r)
}

// --- middleware ---

func (p *Plugin) MattermostAuthorizationRequired(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Mattermost-User-ID") == "" {
			http.Error(w, "Not authorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (p *Plugin) withTabAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := r.Header.Get("Mattermost-User-ID")
		channelID := r.URL.Query().Get("channel_id")
		if channelID == "" {
			http.Error(w, "channel_id query parameter is required", http.StatusBadRequest)
			return
		}
		if !p.canManageTabs(userID, channelID) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		next(w, r)
	}
}

// --- KV helpers ---

func kvKey(channelID string) string { return "channel_tabs_" + channelID }

func (p *Plugin) getChannelTabsData(channelID string) (*ChannelTabs, []byte, error) {
	raw, err := p.kvstore.Get(kvKey(channelID))
	if err != nil {
		return nil, nil, err
	}
	if len(raw) == 0 {
		return &ChannelTabs{ChannelID: channelID, Tabs: []Tab{}}, nil, nil
	}
	var tabs ChannelTabs
	if err := json.Unmarshal(raw, &tabs); err != nil {
		return nil, nil, fmt.Errorf("unmarshal tabs: %w", err)
	}
	return &tabs, raw, nil
}

func (p *Plugin) saveChannelTabsData(tabs *ChannelTabs, oldRaw []byte) error {
	tabs.Version = time.Now().UnixMilli()
	data, err := json.Marshal(tabs)
	if err != nil {
		return err
	}
	ok, err := p.kvstore.CompareAndSet(kvKey(tabs.ChannelID), oldRaw, data)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("concurrent modification — please retry")
	}
	return nil
}

// --- handlers ---

func (p *Plugin) handleGetTabs(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-ID")
	channelID := r.URL.Query().Get("channel_id")
	if channelID == "" {
		http.Error(w, "channel_id is required", http.StatusBadRequest)
		return
	}
	if !p.canViewChannel(userID, channelID) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	tabs, _, err := p.getChannelTabsData(channelID)
	if err != nil {
		p.API.LogError("Failed to get tabs", "error", err.Error())
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	result := tabs.Tabs
	if !p.canManageTabs(userID, channelID) {
		active := make([]Tab, 0, len(tabs.Tabs))
		for _, t := range tabs.Tabs {
			if t.IsActive {
				active = append(active, t)
			}
		}
		result = active
	}

	writeJSON(w, http.StatusOK, &ChannelTabs{ChannelID: tabs.ChannelID, Tabs: result, Version: tabs.Version})
}

func (p *Plugin) handleCreateTab(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel_id")
	userID := r.Header.Get("Mattermost-User-ID")

	var req CreateTabRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if err := req.IsValid(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	tabs, oldRaw, err := p.getChannelTabsData(channelID)
	if err != nil {
		p.API.LogError("Failed to get tabs", "error", err.Error())
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if req.ParentID != "" {
		if !isFolder(tabs.Tabs, req.ParentID) {
			http.Error(w, "parent_id must reference a folder", http.StatusBadRequest)
			return
		}
		if req.Type == TabTypeFolder {
			http.Error(w, "folders cannot be nested inside other folders", http.StatusBadRequest)
			return
		}
		if countChildren(tabs.Tabs, req.ParentID) >= maxItemsPerFolder {
			http.Error(w, fmt.Sprintf("folder already has maximum %d items", maxItemsPerFolder), http.StatusBadRequest)
			return
		}
	} else if countRootTabs(tabs.Tabs) >= maxRootTabs {
		http.Error(w, fmt.Sprintf("maximum %d root tabs reached", maxRootTabs), http.StatusBadRequest)
		return
	}

	now := time.Now().UnixMilli()
	newTab := Tab{
		ID:          uuid.New().String(),
		Title:       req.Title,
		Icon:        req.Icon,
		Type:        req.Type,
		ParentID:    req.ParentID,
		SortOrder:   len(tabs.Tabs),
		IsActive:    true,
		Permissions: req.Permissions,
		CreatedBy:   userID,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	switch req.Type {
	case TabTypeLink:
		newTab.URL = req.URL
	case TabTypePage:
		newTab.Content = req.Content
		newTab.Format = "markdown"

		cfg := p.getConfiguration()
		if cfg.SyncTabsToHeader {
			pageContent := req.Content
			if pageContent == "" {
				pageContent = "*(empty page)*"
			}
			post := &model.Post{
				ChannelId: channelID,
				UserId:    p.botUserID,
				Message:   "# " + req.Title + "\n\n" + pageContent,
			}
			post.AddProp("channel_tabs_page", true)

			created, appErr := p.API.CreatePost(post)
			if appErr != nil {
				p.API.LogError("handleCreateTab: failed to create page post", "error", appErr.Error())
			} else {
				newTab.PostID = created.Id
			}
		}
	}

	tabs.Tabs = append(tabs.Tabs, newTab)
	tabs.ChannelID = channelID

	if err := p.saveChannelTabsData(tabs, oldRaw); err != nil {
		http.Error(w, "Failed to save: "+err.Error(), http.StatusConflict)
		return
	}

	p.afterTabsChanged(channelID, tabs.Tabs)
	writeJSON(w, http.StatusCreated, newTab)
}

func (p *Plugin) handleUpdateTab(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel_id")
	tabID := mux.Vars(r)["tab_id"]

	var req UpdateTabRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	tabs, oldRaw, err := p.getChannelTabsData(channelID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	tab := findTab(tabs.Tabs, tabID)
	if tab == nil {
		http.Error(w, "Tab not found", http.StatusNotFound)
		return
	}

	if req.Title != nil {
		if len(*req.Title) > 100 {
			http.Error(w, "title must be 100 characters or less", http.StatusBadRequest)
			return
		}
		tab.Title = *req.Title
	}
	if req.Icon != nil {
		tab.Icon = *req.Icon
	}
	if req.URL != nil {
		tab.URL = *req.URL
	}
	if req.IsActive != nil {
		tab.IsActive = *req.IsActive
	}
	if req.Permissions != nil {
		tab.Permissions = req.Permissions
	}
	tab.UpdatedAt = time.Now().UnixMilli()

	if err := p.saveChannelTabsData(tabs, oldRaw); err != nil {
		http.Error(w, "Failed to save: "+err.Error(), http.StatusConflict)
		return
	}

	p.afterTabsChanged(channelID, tabs.Tabs)
	writeJSON(w, http.StatusOK, tabs)
}

func (p *Plugin) handleUpdatePageContent(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel_id")
	tabID := mux.Vars(r)["tab_id"]

	var req UpdatePageContentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if len(req.Content) > maxContentSize {
		http.Error(w, "content must be 50KB or less", http.StatusBadRequest)
		return
	}

	tabs, oldRaw, err := p.getChannelTabsData(channelID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	tab := findTab(tabs.Tabs, tabID)
	if tab == nil {
		http.Error(w, "Tab not found", http.StatusNotFound)
		return
	}
	if tab.Type != TabTypePage {
		http.Error(w, "Content can only be updated for page tabs", http.StatusBadRequest)
		return
	}

	tab.Content = req.Content
	tab.Format = "markdown"
	tab.UpdatedAt = time.Now().UnixMilli()

	cfg := p.getConfiguration()
	if cfg.SyncTabsToHeader && tab.PostID != "" {
		post, appErr := p.API.GetPost(tab.PostID)
		if appErr == nil && post != nil {
			postContent := req.Content
			if postContent == "" {
				postContent = "*(empty page)*"
			}
			post.Message = "# " + tab.Title + "\n\n" + postContent
			if _, err := p.API.UpdatePost(post); err != nil {
				p.API.LogError("handleUpdatePageContent: failed to update post", "error", err.Error())
			}
		}
	}

	if err := p.saveChannelTabsData(tabs, oldRaw); err != nil {
		http.Error(w, "Failed to save: "+err.Error(), http.StatusConflict)
		return
	}

	p.afterTabsChanged(channelID, tabs.Tabs)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func (p *Plugin) handleMoveTab(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel_id")
	tabID := mux.Vars(r)["tab_id"]

	var req MoveTabRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	tabs, oldRaw, err := p.getChannelTabsData(channelID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	tab := findTab(tabs.Tabs, tabID)
	if tab == nil {
		http.Error(w, "Tab not found", http.StatusNotFound)
		return
	}

	if tab.Type == TabTypeFolder && req.ParentID != "" {
		http.Error(w, "folders cannot be nested inside other folders", http.StatusBadRequest)
		return
	}

	if req.ParentID != "" {
		if !isFolder(tabs.Tabs, req.ParentID) {
			http.Error(w, "parent_id must reference a folder", http.StatusBadRequest)
			return
		}
		if req.ParentID == tabID {
			http.Error(w, "cannot move tab into itself", http.StatusBadRequest)
			return
		}
		if countChildren(tabs.Tabs, req.ParentID) >= maxItemsPerFolder {
			http.Error(w, fmt.Sprintf("folder already has maximum %d items", maxItemsPerFolder), http.StatusBadRequest)
			return
		}
	} else {
		rootCount := countRootTabs(tabs.Tabs)
		if tab.ParentID != "" {
			if rootCount >= maxRootTabs {
				http.Error(w, fmt.Sprintf("maximum %d root tabs reached", maxRootTabs), http.StatusBadRequest)
				return
			}
		}
	}

	tab.ParentID = req.ParentID
	tab.UpdatedAt = time.Now().UnixMilli()

	if err := p.saveChannelTabsData(tabs, oldRaw); err != nil {
		http.Error(w, "Failed to save: "+err.Error(), http.StatusConflict)
		return
	}

	p.afterTabsChanged(channelID, tabs.Tabs)
	writeJSON(w, http.StatusOK, tabs)
}

func (p *Plugin) handleDeleteTab(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel_id")
	tabID := mux.Vars(r)["tab_id"]

	tabs, oldRaw, err := p.getChannelTabsData(channelID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	tab := findTab(tabs.Tabs, tabID)
	if tab == nil {
		http.Error(w, "Tab not found", http.StatusNotFound)
		return
	}

	// Delete the underlying post for page tabs
	if tab.Type == TabTypePage && tab.PostID != "" {
		if appErr := p.API.DeletePost(tab.PostID); appErr != nil {
			p.API.LogError("handleDeleteTab: failed to delete page post", "error", appErr.Error())
		}
	}

	isDeletedFolder := tab.Type == TabTypeFolder

	newTabs := make([]Tab, 0, len(tabs.Tabs))
	for _, t := range tabs.Tabs {
		if t.ID == tabID {
			continue
		}
		if isDeletedFolder && t.ParentID == tabID {
			t.ParentID = ""
		}
		newTabs = append(newTabs, t)
	}

	for i := range newTabs {
		newTabs[i].SortOrder = i
	}
	tabs.Tabs = newTabs

	if err := p.saveChannelTabsData(tabs, oldRaw); err != nil {
		http.Error(w, "Failed to save: "+err.Error(), http.StatusConflict)
		return
	}

	p.afterTabsChanged(channelID, tabs.Tabs)
	w.WriteHeader(http.StatusNoContent)
}

func (p *Plugin) handleReorderTabs(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel_id")

	var req ReorderTabsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if len(req.TabIDs) == 0 {
		http.Error(w, "tab_ids is required", http.StatusBadRequest)
		return
	}

	tabs, oldRaw, err := p.getChannelTabsData(channelID)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	tabMap := make(map[string]*Tab, len(tabs.Tabs))
	for i := range tabs.Tabs {
		tabMap[tabs.Tabs[i].ID] = &tabs.Tabs[i]
	}

	for i, id := range req.TabIDs {
		t, ok := tabMap[id]
		if !ok {
			http.Error(w, "Tab ID not found: "+id, http.StatusBadRequest)
			return
		}
		t.SortOrder = i
	}

	if err := p.saveChannelTabsData(tabs, oldRaw); err != nil {
		http.Error(w, "Failed to save: "+err.Error(), http.StatusConflict)
		return
	}

	p.afterTabsChanged(channelID, tabs.Tabs)
	writeJSON(w, http.StatusOK, tabs)
}

func (p *Plugin) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	cfg := p.getConfiguration()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"max_tabs":         cfg.GetMaxTabs(),
		"sync_tabs_header": cfg.SyncTabsToHeader,
	})
}

// --- helpers ---

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (p *Plugin) afterTabsChanged(channelID string, tabs []Tab) {
	cfg := p.getConfiguration()
	if cfg.SyncTabsToHeader {
		p.syncTabsToChannelHeader(channelID, tabs)
	}
	p.publishTabsUpdated(channelID)
}

// ---------- sorting helper (shared) ----------

type sortable struct {
	tab   Tab
	order int
}

func sortTabs(s []sortable) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j].order < s[j-1].order; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}

func tabIcon(t Tab, fallback string) string {
	if t.Icon != "" {
		return t.Icon + " "
	}
	return fallback
}

func partitionTabs(tabs []Tab) (roots []sortable, children map[string][]sortable) {
	children = map[string][]sortable{}
	for _, t := range tabs {
		if !t.IsActive {
			continue
		}
		s := sortable{tab: t, order: t.SortOrder}
		if t.ParentID == "" {
			roots = append(roots, s)
		} else {
			children[t.ParentID] = append(children[t.ParentID], s)
		}
	}
	sortTabs(roots)
	for k := range children {
		sortTabs(children[k])
	}
	return
}

// ---------- compact header markdown ----------

const maxHeaderLen = 1024

func buildCompactMarkdown(tabs []Tab, teamName string) string {
	roots, children := partitionTabs(tabs)

	var b strings.Builder
	for _, rs := range roots {
		t := rs.tab
		switch t.Type {
		case TabTypeLink:
			b.WriteString(tabIcon(t, "") + "[" + t.Title + "](" + t.URL + ")\n")
		case TabTypePage:
			if t.PostID != "" && teamName != "" {
				b.WriteString(tabIcon(t, "📄 ") + "[" + t.Title + "](/" + teamName + "/pl/" + t.PostID + ")\n")
			} else {
				b.WriteString(tabIcon(t, "📄 ") + t.Title + "\n")
			}
		case TabTypeFolder:
			kids := children[t.ID]
			if len(kids) == 0 {
				continue
			}
			b.WriteString("**" + tabIcon(t, "📁 ") + t.Title + "**\n")
			for _, cs := range kids {
				ct := cs.tab
				switch ct.Type {
				case TabTypeLink:
					b.WriteString("- " + tabIcon(ct, "") + "[" + ct.Title + "](" + ct.URL + ")\n")
				case TabTypePage:
					if ct.PostID != "" && teamName != "" {
						b.WriteString("- " + tabIcon(ct, "📄 ") + "[" + ct.Title + "](/" + teamName + "/pl/" + ct.PostID + ")\n")
					} else {
						b.WriteString("- " + tabIcon(ct, "📄 ") + ct.Title + "\n")
					}
				}
			}
		}
	}
	return strings.TrimRight(b.String(), "\n")
}

// ---------- full fallback post markdown ----------

func buildFullMarkdown(tabs []Tab, teamName string, locale string) string {
	roots, children := partitionTabs(tabs)

	warning := "> ⚠ This page is automatically generated by the Channel Tabs plugin.\n> Editing is possible but changes may be overwritten."
	if strings.HasPrefix(locale, "uk") {
		warning = "> ⚠ Ця сторінка автоматично згенерована плагіном Channel Tabs.\n> Редагування можливе, але зміни можуть бути перезаписані."
	}

	var b strings.Builder
	b.WriteString("# Channel Tabs\n\n")
	b.WriteString(warning + "\n\n")

	for _, rs := range roots {
		t := rs.tab
		switch t.Type {
		case TabTypeLink:
			b.WriteString("- " + tabIcon(t, "🌐 ") + "[" + t.Title + "](" + t.URL + ")\n")
		case TabTypePage:
			if t.PostID != "" && teamName != "" {
				b.WriteString("- " + tabIcon(t, "📄 ") + "[" + t.Title + "](/" + teamName + "/pl/" + t.PostID + ")\n")
			} else {
				b.WriteString("- " + tabIcon(t, "📄 ") + t.Title + "\n")
			}
		case TabTypeFolder:
			kids := children[t.ID]
			b.WriteString("\n## " + tabIcon(t, "📁 ") + t.Title + "\n\n")
			if len(kids) == 0 {
				b.WriteString("*(empty)*\n")
			}
			for _, cs := range kids {
				ct := cs.tab
				switch ct.Type {
				case TabTypeLink:
					b.WriteString("- " + tabIcon(ct, "🌐 ") + "[" + ct.Title + "](" + ct.URL + ")\n")
				case TabTypePage:
					if ct.PostID != "" && teamName != "" {
						b.WriteString("- " + tabIcon(ct, "📄 ") + "[" + ct.Title + "](/" + teamName + "/pl/" + ct.PostID + ")\n")
					} else {
						b.WriteString("- " + tabIcon(ct, "📄 ") + ct.Title + "\n")
					}
				}
			}
		}
	}
	return strings.TrimRight(b.String(), "\n")
}

// ---------- fallback post management ----------

const fallbackPostKVPrefix = "fb_"

func (p *Plugin) getFallbackPostID(channelID string) string {
	data, appErr := p.API.KVGet(fallbackPostKVPrefix + channelID)
	if appErr != nil || len(data) == 0 {
		return ""
	}
	return string(data)
}

func (p *Plugin) setFallbackPostID(channelID, postID string) {
	_ = p.API.KVSet(fallbackPostKVPrefix+channelID, []byte(postID))
}

func (p *Plugin) getServerLocale() string {
	cfg := p.API.GetConfig()
	if cfg != nil && cfg.LocalizationSettings.DefaultServerLocale != nil {
		return *cfg.LocalizationSettings.DefaultServerLocale
	}
	return "en"
}

func (p *Plugin) ensureFallbackPost(channelID string, tabs []Tab, teamName string) string {
	locale := p.getServerLocale()
	markdown := buildFullMarkdown(tabs, teamName, locale)
	postID := p.getFallbackPostID(channelID)

	if postID != "" {
		existing, appErr := p.API.GetPost(postID)
		if appErr == nil && existing != nil {
			if existing.Message != markdown {
				existing.Message = markdown
				if _, err := p.API.UpdatePost(existing); err != nil {
					p.API.LogError("ensureFallbackPost: failed to update", "error", err.Error())
				}
			}
			return postID
		}
	}

	newPost := &model.Post{
		ChannelId: channelID,
		UserId:    p.botUserID,
		Message:   markdown,
	}
	newPost.AddProp("channel_tabs_fallback", true)

	created, appErr := p.API.CreatePost(newPost)
	if appErr != nil {
		p.API.LogError("ensureFallbackPost: failed to create", "error", appErr.Error())
		return ""
	}

	p.setFallbackPostID(channelID, created.Id)
	return created.Id
}

// ---------- header sync ----------

func (p *Plugin) syncTabsToChannelHeader(channelID string, tabs []Tab) {
	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil {
		p.API.LogError("syncTabsToChannelHeader: failed to get channel", "error", appErr.Error())
		return
	}

	var teamName string
	if channel.TeamId != "" {
		team, teamErr := p.API.GetTeam(channel.TeamId)
		if teamErr == nil && team != nil {
			teamName = team.Name
		}
	}

	header := buildCompactMarkdown(tabs, teamName)

	postID := p.ensureFallbackPost(channelID, tabs, teamName)

	if len([]rune(header)) > maxHeaderLen {
		locale := p.getServerLocale()
		linkText := "Read more..."
		if strings.HasPrefix(locale, "uk") {
			linkText = "Читати далі..."
		}

		var moreLink string
		if postID != "" && teamName != "" {
			permalink := "/" + teamName + "/pl/" + postID
			moreLink = "\n[📑 " + linkText + "](" + permalink + ")"
		}

		available := max(maxHeaderLen-len([]rune(moreLink)), 1)

		runes := []rune(header)
		if available < len(runes) {
			truncated := string(runes[:available])
			if idx := strings.LastIndex(truncated, "\n"); idx > len(truncated)/2 {
				truncated = truncated[:idx]
			}
			header = truncated + moreLink
		}
	}

	if channel.Header == header {
		return
	}
	channel.Header = header
	if _, appErr = p.API.UpdateChannel(channel); appErr != nil {
		p.API.LogError("syncTabsToChannelHeader: failed to update header", "error", appErr.Error())
	}
}

func (p *Plugin) publishTabsUpdated(channelID string) {
	p.API.PublishWebSocketEvent("tabs_updated", map[string]interface{}{
		"channel_id": channelID,
	}, &model.WebsocketBroadcast{ChannelId: channelID})
}
