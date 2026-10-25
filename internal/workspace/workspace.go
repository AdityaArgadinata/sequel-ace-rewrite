// Package workspace owns independent pinned sessions and in-memory connection settings.
package workspace

import (
	"errors"
	"sequel-rewrite/internal/database"
	"sequel-rewrite/internal/profiles"
	"strconv"
	"sync"
)

type Manager struct {
	mu         sync.Mutex
	tabs       map[string]*database.Session
	connection *database.Connection
	next       uint64
	epoch      uint64
	opening    int
}

func (m *Manager) Open(c *database.Connection) (string, error) {
	m.mu.Lock()
	if len(m.tabs)+m.opening >= 16 {
		m.mu.Unlock()
		return "", errors.New("maximum 16 query tabs")
	}
	if c == nil {
		c = m.connection
	}
	if c == nil {
		m.mu.Unlock()
		return "", errors.New("connect first")
	}
	copy := *c
	if c.Auth != nil {
		auth := *c.Auth
		copy.Auth = &auth
	}
	if c.SSH != nil {
		ssh := *c.SSH
		copy.SSH = &ssh
	}
	epoch := m.epoch
	m.opening++
	m.mu.Unlock()
	s := &database.Session{}
	err := s.Connect(copy)
	m.mu.Lock()
	defer m.mu.Unlock()
	m.opening--
	if err != nil {
		return "", err
	}
	if epoch != m.epoch {
		s.Shutdown()
		return "", errors.New("workspace closed while connecting")
	}
	if m.tabs == nil {
		m.tabs = map[string]*database.Session{}
	}
	m.next++
	id := strconv.FormatUint(m.next, 10)
	m.tabs[id] = s
	m.connection = &copy
	return id, nil
}
func (m *Manager) Session(id string) (*database.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.tabs[id]
	if s == nil {
		return nil, errors.New("query tab is closed")
	}
	return s, nil
}
func (m *Manager) Close(id string) error {
	m.mu.Lock()
	s := m.tabs[id]
	delete(m.tabs, id)
	if len(m.tabs) == 0 {
		m.connection = nil
		m.epoch++
	}
	m.mu.Unlock()
	if s == nil {
		return errors.New("query tab is already closed")
	}
	s.Shutdown()
	return nil
}
func (m *Manager) Shutdown() {
	m.mu.Lock()
	tabs := m.tabs
	m.tabs = nil
	m.connection = nil
	m.epoch++
	m.mu.Unlock()
	for _, s := range tabs {
		s.Shutdown()
	}
}

// Export only connection settings. Credentials never cross this boundary.
func (m *Manager) Profile() (profiles.Profile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c := m.connection
	if c == nil {
		return profiles.Profile{}, errors.New("connect first")
	}
	p := profiles.Profile{Socket: c.Socket, TimeZone: c.TimeZone, Name: c.Host, Host: c.Host, Port: c.Port, User: c.User, TLS: c.TLS, CAPEM: c.CAPEM}
	if c.Auth != nil {
		settings := c.Auth.Settings
		p.Auth = &settings
	}
	if c.SSH != nil {
		settings := c.SSH.Settings
		p.SSH = &settings
	}
	return p, nil
}
