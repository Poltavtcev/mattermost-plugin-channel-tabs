package main

import "github.com/mattermost/mattermost/server/public/model"

func (p *Plugin) isSystemAdmin(userID string) bool {
	if p.client == nil {
		return false
	}
	user, err := p.client.User.Get(userID)
	if err != nil {
		return false
	}
	return user.IsInRole(model.SystemAdminRoleId)
}

func (p *Plugin) canManageTabs(userID, channelID string) bool {
	if p.client == nil {
		return false
	}
	if p.isSystemAdmin(userID) {
		return true
	}

	channel, err := p.client.Channel.Get(channelID)
	if err != nil || channel == nil {
		return false
	}

	member, err := p.client.Channel.GetMember(channelID, userID)
	if err != nil {
		return false
	}

	// In direct/group messages, all members can manage tabs in that conversation.
	if channel.Type == model.ChannelTypeDirect || channel.Type == model.ChannelTypeGroup {
		return true
	}

	return member.SchemeAdmin
}

func (p *Plugin) canViewChannel(userID, channelID string) bool {
	if p.client == nil {
		return false
	}
	_, err := p.client.Channel.GetMember(channelID, userID)
	return err == nil
}
