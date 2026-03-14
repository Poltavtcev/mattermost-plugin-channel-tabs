package main

import (
	"sync"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/pluginapi"

	"github.com/dyad-apps/mattermost-plugin-channel-tabs/server/store/kvstore"
)

type Plugin struct {
	plugin.MattermostPlugin

	kvstore kvstore.KVStore
	client  *pluginapi.Client
	router  *mux.Router

	botUserID string

	configurationLock sync.RWMutex
	configuration     *configuration
}

func (p *Plugin) OnActivate() error {
	p.client = pluginapi.NewClient(p.API, p.Driver)
	p.kvstore = kvstore.NewKVStore(p.API)
	p.router = p.initRouter()

	botID, err := p.client.Bot.EnsureBot(&model.Bot{
		Username:    "channel-tabs",
		DisplayName: "Channel Tabs",
		Description: "Bot for the Channel Tabs plugin",
	})
	if err != nil {
		return err
	}
	p.botUserID = botID

	return nil
}

func (p *Plugin) OnDeactivate() error {
	return nil
}
