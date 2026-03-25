package main

import (
	"reflect"

	"github.com/pkg/errors"
)

type configuration struct {
	MaxTabsPerChannel int    `json:"MaxTabsPerChannel"`
	SyncTabsToHeader  bool   `json:"SyncTabsToHeader"`
	HeaderDisplayMode string `json:"HeaderDisplayMode"`
}

func (c *configuration) Clone() *configuration {
	clone := *c
	return &clone
}

func (c *configuration) GetMaxTabs() int {
	if c.MaxTabsPerChannel <= 0 {
		return 30
	}
	if c.MaxTabsPerChannel > 50 {
		return 50
	}
	return c.MaxTabsPerChannel
}

func (c *configuration) GetHeaderDisplayMode() string {
	if c.HeaderDisplayMode == "" {
		// Backward compatibility for older configs (when the new HeaderDisplayMode setting didn't exist).
		if c.SyncTabsToHeader {
			return "full"
		}
		return "none"
	}

	switch c.HeaderDisplayMode {
	case "none", "hint", "full":
		return c.HeaderDisplayMode
	default:
		return "none"
	}
}

func (c *configuration) IsBotPostsEnabled() bool {
	// Legacy key; the meaning is now: whether the plugin is allowed to create/update bot posts in the channel.
	return c.SyncTabsToHeader
}

func (c *configuration) IsHeaderOutputEnabled() bool {
	return c.GetHeaderDisplayMode() != "none"
}

func (p *Plugin) getConfiguration() *configuration {
	p.configurationLock.RLock()
	defer p.configurationLock.RUnlock()

	if p.configuration == nil {
		return &configuration{
			MaxTabsPerChannel: 30,
		}
	}

	return p.configuration
}

func (p *Plugin) setConfiguration(configuration *configuration) {
	p.configurationLock.Lock()
	defer p.configurationLock.Unlock()

	if configuration != nil && p.configuration == configuration {
		if reflect.ValueOf(*configuration).NumField() == 0 {
			return
		}
		panic("setConfiguration called with the existing configuration")
	}

	p.configuration = configuration
}

func (p *Plugin) OnConfigurationChange() error {
	prev := p.getConfiguration().Clone()
	configuration := new(configuration)

	if err := p.API.LoadPluginConfiguration(configuration); err != nil {
		return errors.Wrap(err, "failed to load plugin configuration")
	}

	p.setConfiguration(configuration)

	prevMode := prev.GetHeaderDisplayMode()
	newMode := configuration.GetHeaderDisplayMode()
	prevBot := prev.IsBotPostsEnabled()
	newBot := configuration.IsBotPostsEnabled()

	// Any switch between modes/bot-posts affects header content. Best-effort cleanup first.
	if prevMode != newMode || prevBot != newBot {
		p.cleanupManagedHeaders()
	}

	if configuration.IsHeaderOutputEnabled() {
		// Ensure header gets updated immediately after settings change (tabs themselves might not change).
		p.syncManagedChannelHeaders()
	}

	return nil
}
