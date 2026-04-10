package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"runtime/debug"
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
	defer func() {
		if rec := recover(); rec != nil {
			p.API.LogError(
				"Channel Tabs plugin panic",
				"error", fmt.Sprint(rec),
				"stack", string(debug.Stack()),
			)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
	}()

	if p.router == nil {
		p.API.LogError("Channel Tabs plugin router is nil")
		http.Error(w, "Plugin not initialized", http.StatusServiceUnavailable)
		return
	}
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
	if p.kvstore == nil {
		return nil, nil, fmt.Errorf("kvstore is not initialized")
	}
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
	if p.kvstore == nil {
		return fmt.Errorf("kvstore is not initialized")
	}
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

var mattermostFilePathRe = regexp.MustCompile(`/api/v4/files/([a-zA-Z0-9]+)`)

func fileIDsInMarkdown(markdown string) []string {
	seen := make(map[string]struct{})
	var out []string
	for _, m := range mattermostFilePathRe.FindAllStringSubmatch(markdown, -1) {
		if len(m) < 2 {
			continue
		}
		id := m[1]
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func mergePageFileIDs(tab *Tab, content string, extra []string) {
	seen := make(map[string]struct{})
	var order []string
	add := func(id string) {
		if id == "" {
			return
		}
		if _, ok := seen[id]; ok {
			return
		}
		seen[id] = struct{}{}
		order = append(order, id)
	}
	for _, id := range tab.PageFileIDs {
		add(id)
	}
	for _, id := range fileIDsInMarkdown(content) {
		add(id)
	}
	for _, id := range extra {
		add(id)
	}
	tab.PageFileIDs = order
}

func removeDismissedPageFileIDs(ids []string, dismiss []string) []string {
	if len(dismiss) == 0 {
		return ids
	}
	rm := make(map[string]struct{}, len(dismiss))
	for _, id := range dismiss {
		rm[id] = struct{}{}
	}
	out := ids[:0]
	for _, id := range ids {
		if _, ok := rm[id]; !ok {
			out = append(out, id)
		}
	}
	return out
}

func (p *Plugin) maybeBackfillPageFileIDs(tabs *ChannelTabs, oldRaw []byte) error {
	type patch struct {
		idx  int
		prev []string
		next []string
	}
	var patches []patch
	for i := range tabs.Tabs {
		t := &tabs.Tabs[i]
		if t.Type != TabTypePage || t.Content == "" || len(t.PageFileIDs) > 0 {
			continue
		}
		if !strings.Contains(t.Content, "/api/v4/files/") {
			continue
		}
		ids := fileIDsInMarkdown(t.Content)
		if len(ids) == 0 {
			continue
		}
		prev := append([]string(nil), t.PageFileIDs...)
		patches = append(patches, patch{idx: i, prev: prev, next: ids})
	}
	if len(patches) == 0 {
		return nil
	}
	for _, p := range patches {
		tabs.Tabs[p.idx].PageFileIDs = p.next
	}
	if err := p.saveChannelTabsData(tabs, oldRaw); err != nil {
		for _, p := range patches {
			tabs.Tabs[p.idx].PageFileIDs = p.prev
		}
		return err
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

	tabs, oldRaw, err := p.getChannelTabsData(channelID)
	if err != nil {
		p.API.LogError("Failed to get tabs", "error", err.Error())
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if err := p.maybeBackfillPageFileIDs(tabs, oldRaw); err != nil {
		p.API.LogError("maybeBackfillPageFileIDs", "error", err.Error())
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
		mergePageFileIDs(&newTab, newTab.Content, nil)

		cfg := p.getConfiguration()
		if cfg.IsBotPostsEnabled() {
			pageContent := req.Content
			if pageContent == "" {
				pageContent = "*(empty page)*"
			}
			pageContent = p.absoluteFileLinks(pageContent)
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

	p.afterTabsChanged(channelID, tabs.Tabs, userID)
	writeJSON(w, http.StatusCreated, newTab)
}

func (p *Plugin) handleUpdateTab(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel_id")
	tabID := mux.Vars(r)["tab_id"]
	userID := r.Header.Get("Mattermost-User-ID")

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

	p.afterTabsChanged(channelID, tabs.Tabs, userID)
	writeJSON(w, http.StatusOK, tabs)
}

func (p *Plugin) handleUpdatePageContent(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel_id")
	tabID := mux.Vars(r)["tab_id"]
	userID := r.Header.Get("Mattermost-User-ID")

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
	mergePageFileIDs(tab, req.Content, req.ExtraTrackedFileIDs)
	tab.PageFileIDs = removeDismissedPageFileIDs(tab.PageFileIDs, req.DismissFileIDs)

	cfg := p.getConfiguration()
	if cfg.IsBotPostsEnabled() && tab.PostID != "" {
		post, appErr := p.API.GetPost(tab.PostID)
		if appErr == nil && post != nil {
			postContent := req.Content
			if postContent == "" {
				postContent = "*(empty page)*"
			}
			postContent = p.absoluteFileLinks(postContent)
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

	p.afterTabsChanged(channelID, tabs.Tabs, userID)
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (p *Plugin) handleMoveTab(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel_id")
	tabID := mux.Vars(r)["tab_id"]
	userID := r.Header.Get("Mattermost-User-ID")

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

	p.afterTabsChanged(channelID, tabs.Tabs, userID)
	writeJSON(w, http.StatusOK, tabs)
}

func (p *Plugin) handleDeleteTab(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel_id")
	tabID := mux.Vars(r)["tab_id"]
	userID := r.Header.Get("Mattermost-User-ID")

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

	p.afterTabsChanged(channelID, tabs.Tabs, userID)
	w.WriteHeader(http.StatusNoContent)
}

func (p *Plugin) handleReorderTabs(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel_id")
	userID := r.Header.Get("Mattermost-User-ID")

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

	p.afterTabsChanged(channelID, tabs.Tabs, userID)
	writeJSON(w, http.StatusOK, tabs)
}

func (p *Plugin) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	cfg := p.getConfiguration()
	writeJSON(w, http.StatusOK, map[string]any{
		"max_tabs":            cfg.GetMaxTabs(),
		"sync_tabs_header":    cfg.IsBotPostsEnabled(),
		"header_display_mode": cfg.GetHeaderDisplayMode(),
	})
}

// --- helpers ---

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (p *Plugin) afterTabsChanged(channelID string, tabs []Tab, actorUserID string) {
	cfg := p.getConfiguration()
	if cfg.IsHeaderOutputEnabled() {
		p.syncTabsToChannelHeader(channelID, tabs, actorUserID)
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

func permalinkForPost(teamName, postID string) string {
	if postID == "" {
		return ""
	}
	if teamName != "" {
		return "/" + teamName + "/pl/" + postID
	}
	return "/pl/" + postID
}

func (p *Plugin) rhsPopoutLink(teamName, channelID string) string {
	const pluginID = "channel-tabs"

	// Mattermost RHS popout uses the channel id in this path segment (stable; matches webapp routes).
	path := "/_popout/rhs/" + url.PathEscape(teamName) + "/" + url.PathEscape(channelID) + "/plugin/" + pluginID
	cfg := p.API.GetConfig()
	if cfg == nil || cfg.ServiceSettings.SiteURL == nil || *cfg.ServiceSettings.SiteURL == "" {
		return path
	}

	siteURL := strings.TrimRight(*cfg.ServiceSettings.SiteURL, "/")
	return siteURL + path
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

var (
	relativeFileLinkRe = regexp.MustCompile(`\((/api/v4/files/[a-zA-Z0-9]+)\)`)
	popoutTeamRe       = regexp.MustCompile(`/_popout/rhs/([^/]+)/`)
)

func (p *Plugin) absoluteFileLinks(markdown string) string {
	if markdown == "" || !strings.Contains(markdown, "/api/v4/files/") {
		return markdown
	}

	cfg := p.API.GetConfig()
	if cfg == nil || cfg.ServiceSettings.SiteURL == nil || *cfg.ServiceSettings.SiteURL == "" {
		return markdown
	}

	siteURL := strings.TrimRight(*cfg.ServiceSettings.SiteURL, "/")
	return relativeFileLinkRe.ReplaceAllString(markdown, "("+siteURL+"$1)")
}

func isChannelTabsHintLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return false
	}
	// Robust detection for all plugin-managed hint labels, including custom text.
	isMarkdownLink := strings.HasPrefix(trimmed, "[") && strings.Contains(trimmed, "](") && strings.HasSuffix(trimmed, ")")
	if isMarkdownLink &&
		strings.Contains(trimmed, "/_popout/rhs/") &&
		strings.Contains(trimmed, "/plugin/channel-tabs") {
		return true
	}

	// Backward compatibility with older labels.
	return strings.Contains(trimmed, "Channel Tabs") || strings.Contains(trimmed, "Вкладки каналу")
}

func upsertChannelTabsHint(existingHeader, hintLine string) string {
	lines := strings.Split(existingHeader, "\n")
	found := false
	out := make([]string, 0, len(lines))
	for i, line := range lines {
		if !isChannelTabsHintLine(line) {
			_ = i
			out = append(out, line)
			continue
		}
		// Keep exactly one up-to-date hint line even if old duplicates exist.
		if !found {
			out = append(out, hintLine)
			found = true
		}
	}

	result := strings.TrimRight(existingHeader, "\n")
	if strings.TrimSpace(strings.Join(out, "\n")) == "" && !found {
		return hintLine
	}
	if found {
		return strings.Join(out, "\n")
	}
	if strings.TrimSpace(result) == "" {
		return hintLine
	}
	return result + "\n" + hintLine
}

func removeChannelTabsLegacyEntries(header string) string {
	// Best-effort cleanup: when bot posts are disabled, we shouldn't show stale
	// plugin-generated entries (especially Page permalinks that may point to missing posts).
	// We remove only lines containing our known page/folder icons.
	lines := strings.Split(header, "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		if strings.Contains(line, "📄") || strings.Contains(line, "📁") {
			continue
		}
		out = append(out, line)
	}
	return strings.Join(out, "\n")
}

func removeChannelTabsHintLines(header string) string {
	lines := strings.Split(header, "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		if isChannelTabsHintLine(line) {
			continue
		}
		out = append(out, line)
	}
	return strings.Join(out, "\n")
}

func buildCompactMarkdown(tabs []Tab, teamName string) string {
	roots, children := partitionTabs(tabs)

	var b strings.Builder
	for i, rs := range roots {
		if i > 0 {
			// Add extra spacing between root entries for better readability in channel header.
			b.WriteString("\n")
		}
		t := rs.tab
		switch t.Type {
		case TabTypeLink:
			b.WriteString(tabIcon(t, "") + "[" + t.Title + "](" + t.URL + ")\n")
		case TabTypePage:
			if permalink := permalinkForPost(teamName, t.PostID); permalink != "" {
				b.WriteString(tabIcon(t, "📄 ") + "[" + t.Title + "](" + permalink + ")\n")
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
					if permalink := permalinkForPost(teamName, ct.PostID); permalink != "" {
						b.WriteString("- " + tabIcon(ct, "📄 ") + "[" + ct.Title + "](" + permalink + ")\n")
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
			if permalink := permalinkForPost(teamName, t.PostID); permalink != "" {
				b.WriteString("- " + tabIcon(t, "📄 ") + "[" + t.Title + "](" + permalink + ")\n")
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
					if permalink := permalinkForPost(teamName, ct.PostID); permalink != "" {
						b.WriteString("- " + tabIcon(ct, "📄 ") + "[" + ct.Title + "](" + permalink + ")\n")
					} else {
						b.WriteString("- " + tabIcon(ct, "📄 ") + ct.Title + "\n")
					}
				}
			}
		}
	}
	return strings.TrimRight(b.String(), "\n")
}

func (p *Plugin) ensurePagePostLinks(channelID string, tabs []Tab) []Tab {
	updated := false
	result := append([]Tab(nil), tabs...)
	now := time.Now().UnixMilli()

	for i := range result {
		t := &result[i]
		if t.Type != TabTypePage || t.PostID != "" {
			continue
		}

		pageContent := t.Content
		if pageContent == "" {
			pageContent = "*(empty page)*"
		}
		pageContent = p.absoluteFileLinks(pageContent)
		post := &model.Post{
			ChannelId: channelID,
			UserId:    p.botUserID,
			Message:   "# " + t.Title + "\n\n" + pageContent,
		}
		post.AddProp("channel_tabs_page", true)

		created, appErr := p.API.CreatePost(post)
		if appErr != nil {
			p.API.LogError("ensurePagePostLinks: failed to create page post", "tab_id", t.ID, "error", appErr.Error())
			continue
		}

		t.PostID = created.Id
		t.UpdatedAt = now
		updated = true
	}

	if !updated {
		return tabs
	}

	latest, oldRaw, err := p.getChannelTabsData(channelID)
	if err != nil {
		p.API.LogError("ensurePagePostLinks: failed to reload tabs", "error", err.Error())
		return result
	}

	postIDs := make(map[string]string, len(result))
	for _, t := range result {
		if t.Type == TabTypePage && t.PostID != "" {
			postIDs[t.ID] = t.PostID
		}
	}

	changed := false
	for i := range latest.Tabs {
		if postID, ok := postIDs[latest.Tabs[i].ID]; ok && latest.Tabs[i].PostID == "" {
			latest.Tabs[i].PostID = postID
			latest.Tabs[i].UpdatedAt = now
			changed = true
		}
	}

	if changed {
		if err := p.saveChannelTabsData(latest, oldRaw); err != nil {
			p.API.LogError("ensurePagePostLinks: failed to persist post IDs", "error", err.Error())
		}
	}

	return result
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

func (p *Plugin) syncTabsToChannelHeader(channelID string, tabs []Tab, actorUserID string) {
	cfg := p.getConfiguration()
	mode := cfg.GetHeaderDisplayMode()
	if mode == "none" {
		return
	}

	botPostsEnabled := cfg.IsBotPostsEnabled()

	effectiveMode := mode
	if mode == "full" && !botPostsEnabled {
		// If bot posts are disabled, full header permalinks can't be guaranteed.
		// In this case we fallback to hint-only mode.
		effectiveMode = "hint"
	}

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

	// For direct/group messages, TeamId may be empty but the popout route still needs a team slug.
	// Best-effort: actor's first team, or reuse a team slug from an existing header link.
	if teamName == "" {
		if actorUserID != "" {
			teams, tErr := p.API.GetTeamsForUser(actorUserID)
			if tErr == nil && len(teams) > 0 {
				teamName = teams[0].Name
			}
		}
		if teamName == "" {
			if match := popoutTeamRe.FindStringSubmatch(channel.Header); len(match) == 2 {
				teamName = match[1]
			}
		}
		if teamName == "" && p.botUserID != "" {
			teams, tErr := p.API.GetTeamsForUser(p.botUserID)
			if tErr == nil && len(teams) > 0 {
				teamName = teams[0].Name
			}
		}
	}

	postID := ""
	if botPostsEnabled {
		tabs = p.ensurePagePostLinks(channelID, tabs)
		postID = p.ensureFallbackPost(channelID, tabs, teamName)
	}

	locale := p.getServerLocale()
	label := cfg.GetHeaderHintLabel(locale)

	// Full header mode: only possible when bot posts are enabled.
	if effectiveMode == "full" {
		header := buildCompactMarkdown(tabs, teamName)

		if len([]rune(header)) > maxHeaderLen {
			linkText := "Read more..."
			if strings.HasPrefix(locale, "uk") {
				linkText = "Читати далі..."
			}

			var moreLink string
			if postID != "" {
				permalink := permalinkForPost(teamName, postID)
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
		return
	}

	// Hint mode: update only the plugin hint line, but also clear a stale full markdown header if it matches exactly.
	fullMarkdown := buildCompactMarkdown(tabs, teamName)
	existing := channel.Header
	if !botPostsEnabled {
		existing = removeChannelTabsLegacyEntries(existing)
	} else if strings.TrimSpace(existing) == strings.TrimSpace(fullMarkdown) {
		existing = ""
	}

	var hintLine string
	if botPostsEnabled && postID != "" {
		hintLine = "[" + label + "](" + permalinkForPost(teamName, postID) + ")"
	} else {
		hintLine = "[" + label + "](" + p.rhsPopoutLink(teamName, channel.Id) + ")"
	}

	header := upsertChannelTabsHint(existing, hintLine)
	if channel.Header == header {
		return
	}

	channel.Header = header
	if _, appErr = p.API.UpdateChannel(channel); appErr != nil {
		p.API.LogError("syncTabsToChannelHeader: failed to update header", "error", appErr.Error())
	}
}

func (p *Plugin) publishTabsUpdated(channelID string) {
	p.API.PublishWebSocketEvent("tabs_updated", map[string]any{
		"channel_id": channelID,
	}, &model.WebsocketBroadcast{ChannelId: channelID})
}

func (p *Plugin) syncManagedChannelHeaders() {
	channelIDs := p.listManagedChannelIDs()
	for _, channelID := range channelIDs {
		tabs, _, err := p.getChannelTabsData(channelID)
		if err != nil || tabs == nil {
			continue
		}
		p.syncTabsToChannelHeader(channelID, tabs.Tabs, p.botUserID)
	}
}

func (p *Plugin) cleanupManagedHeaders() {
	channelIDs := p.listManagedChannelIDs()
	for _, channelID := range channelIDs {
		p.cleanupChannelHeader(channelID)
	}
}

func (p *Plugin) listManagedChannelIDs() []string {
	const (
		pageSize = 200
		tabPref  = "channel_tabs_"
	)
	seen := map[string]struct{}{}
	page := 0
	for {
		keys, appErr := p.API.KVList(page, pageSize)
		if appErr != nil {
			p.API.LogError("listManagedChannelIDs: KVList failed", "error", appErr.Error())
			break
		}
		if len(keys) == 0 {
			break
		}
		for _, key := range keys {
			switch {
			case strings.HasPrefix(key, tabPref):
				seen[strings.TrimPrefix(key, tabPref)] = struct{}{}
			case strings.HasPrefix(key, fallbackPostKVPrefix):
				seen[strings.TrimPrefix(key, fallbackPostKVPrefix)] = struct{}{}
			}
		}
		if len(keys) < pageSize {
			break
		}
		page++
	}

	ids := make([]string, 0, len(seen))
	for id := range seen {
		if id != "" {
			ids = append(ids, id)
		}
	}
	return ids
}

func (p *Plugin) cleanupChannelHeader(channelID string) {
	channel, appErr := p.API.GetChannel(channelID)
	if appErr != nil || channel == nil {
		return
	}
	original := channel.Header
	if original == "" {
		return
	}

	header := removeChannelTabsHintLines(original)

	var teamName string
	if channel.TeamId != "" {
		if team, teamErr := p.API.GetTeam(channel.TeamId); teamErr == nil && team != nil {
			teamName = team.Name
		}
	}

	tabs, _, err := p.getChannelTabsData(channelID)
	if err == nil && tabs != nil {
		full := buildCompactMarkdown(tabs.Tabs, teamName)
		if strings.TrimSpace(original) == strings.TrimSpace(full) {
			// Header fully managed by plugin before disable/deactivate.
			header = ""
		}
	}

	if header == original {
		return
	}
	channel.Header = strings.TrimRight(header, "\n")
	if _, appErr = p.API.UpdateChannel(channel); appErr != nil {
		p.API.LogError("cleanupChannelHeader: failed to update", "channel_id", channelID, "error", appErr.Error())
	}
}
