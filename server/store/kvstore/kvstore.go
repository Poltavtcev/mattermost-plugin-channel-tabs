package kvstore

import "github.com/mattermost/mattermost/server/public/plugin"

type KVStore interface {
	Get(key string) ([]byte, error)
	CompareAndSet(key string, oldData, newData []byte) (bool, error)
	Delete(key string) error
}

type Client struct {
	api plugin.API
}

func NewKVStore(api plugin.API) KVStore {
	return &Client{api: api}
}
