package main

import "testing"

func TestMattermostRhsPopoutUsesQueryChannel(t *testing.T) {
	t.Parallel()
	cases := []struct {
		ver  string
		want bool
	}{
		{"", false},
		{"11.4.2", false},
		{"11.5.0", false},
		{"v11.5.9", false},
		{"11.6.0", true},
		{"11.6.1", true},
		{"v12.0.0", true},
		{"11.6.1-rc2", true},
		{"11.6.0+abcdef", true},
		{"garbage", false},
		{"11", false},
	}
	for _, tc := range cases {
		if got := mattermostRhsPopoutUsesQueryChannel(tc.ver); got != tc.want {
			t.Errorf("%q: got %v want %v", tc.ver, got, tc.want)
		}
	}
}
