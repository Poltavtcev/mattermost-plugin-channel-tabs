package kvstore

import "fmt"

func (kv *Client) Get(key string) ([]byte, error) {
	data, appErr := kv.api.KVGet(key)
	if appErr != nil {
		return nil, fmt.Errorf("KVGet failed for key %s: %s", key, appErr.Error())
	}
	return data, nil
}

func (kv *Client) CompareAndSet(key string, oldData, newData []byte) (bool, error) {
	ok, appErr := kv.api.KVCompareAndSet(key, oldData, newData)
	if appErr != nil {
		return false, fmt.Errorf("KVCompareAndSet failed for key %s: %s", key, appErr.Error())
	}
	return ok, nil
}

func (kv *Client) Delete(key string) error {
	appErr := kv.api.KVDelete(key)
	if appErr != nil {
		return fmt.Errorf("KVDelete failed for key %s: %s", key, appErr.Error())
	}
	return nil
}
