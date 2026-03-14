package main

import "github.com/mattermost/mattermost/server/public/model"

func (p *Plugin) isSystemAdmin(userID string) bool {
	user, err := p.client.User.Get(userID)
	if err != nil {
		return false
	}
	return user.IsInRole(model.SystemAdminRoleId)
}

func (p *Plugin) canManageTabs(userID, channelID string) bool {
	if p.isSystemAdmin(userID) {
		return true
	}

	member, err := p.client.Channel.GetMember(channelID, userID)
	if err != nil {
		return false
	}

	return member.SchemeAdmin
}

func (p *Plugin) canViewChannel(userID, channelID string) bool {
	_, err := p.client.Channel.GetMember(channelID, userID)
	return err == nil
}
