package main

import (
	"strconv"
	"strings"
)

// mattermostRhsPopoutUsesQueryChannel reports whether the server webapp expects RHS plugin popout
// URLs with the channel in ?channel= (Mattermost 11.6.0+) vs in the path (older).
func mattermostRhsPopoutUsesQueryChannel(serverVersion string) bool {
	v := strings.TrimSpace(serverVersion)
	if v == "" {
		return false
	}
	v = strings.TrimPrefix(v, "v")
	if i := strings.IndexAny(v, "-+"); i >= 0 {
		v = v[:i]
	}
	parts := strings.Split(v, ".")
	if len(parts) < 2 {
		return false
	}
	major, err1 := strconv.Atoi(parts[0])
	minor, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil {
		return false
	}
	if major > 11 {
		return true
	}
	if major == 11 && minor >= 6 {
		return true
	}
	return false
}
