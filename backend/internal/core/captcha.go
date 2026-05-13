package core

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"
)

// CaptchaStore manages math-based captcha challenges
type CaptchaStore struct {
	mu      sync.Mutex
	entries map[string]*captchaEntry
}

type captchaEntry struct {
	answer    int
	expiresAt time.Time
}

// NewCaptchaStore creates a new captcha store with auto-cleanup
func NewCaptchaStore() *CaptchaStore {
	cs := &CaptchaStore{
		entries: make(map[string]*captchaEntry),
	}
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			cs.mu.Lock()
			now := time.Now()
			for k, v := range cs.entries {
				if now.After(v.expiresAt) {
					delete(cs.entries, k)
				}
			}
			cs.mu.Unlock()
		}
	}()
	return cs
}

// Generate creates a new captcha — returns id, SVG image as data URL, and answer
func (cs *CaptchaStore) Generate() (id string, imageDataURL string, answer int) {
	b := make([]byte, 16)
	rand.Read(b)
	id = fmt.Sprintf("%x", b)

	a, _ := rand.Int(rand.Reader, big.NewInt(20))
	bn, _ := rand.Int(rand.Reader, big.NewInt(10))
	aVal := int(a.Int64()) + 1
	bVal := int(bn.Int64()) + 1

	var question string
	opRand, _ := rand.Int(rand.Reader, big.NewInt(3))
	switch opRand.Int64() {
	case 0:
		question = fmt.Sprintf("%d + %d", aVal, bVal)
		answer = aVal + bVal
	case 1:
		question = fmt.Sprintf("%d - %d", aVal+bVal, bVal)
		answer = aVal
	default:
		if bVal > 5 {
			bVal = bVal%5 + 1
		}
		question = fmt.Sprintf("%d x %d", aVal, bVal)
		answer = aVal * bVal
	}

	cs.mu.Lock()
	cs.entries[id] = &captchaEntry{answer: answer, expiresAt: time.Now().Add(5 * time.Minute)}
	cs.mu.Unlock()

	imageDataURL = renderCaptchaSVG(question)
	return
}

// Validate checks a captcha answer (one-time use)
func (cs *CaptchaStore) Validate(id string, userAnswer int) bool {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	entry, exists := cs.entries[id]
	if !exists {
		return false
	}
	delete(cs.entries, id) // one-time use

	if time.Now().After(entry.expiresAt) {
		return false
	}
	return entry.answer == userAnswer
}

// IsCaptchaEnabled checks if captcha is enabled in settings
func IsCaptchaEnabled() bool {
	return GetSetting("admin_captcha_enabled") == "true"
}

// GetSetting reads a setting value from the database
func GetSetting(key string) string {
	var value string
	DB.Table("settings").Select("value").Where("key = ?", key).Scan(&value)
	return value
}

// SetSetting writes a setting value to the database
func SetSetting(key, value string) {
	result := DB.Exec("UPDATE settings SET value = ? WHERE key = ?", value, key)
	if result.RowsAffected == 0 {
		DB.Exec("INSERT INTO settings (key, value) VALUES (?, ?)", key, value)
	}
}

// randInt returns a random int in [0, max)
func randInt(max int) int {
	n, _ := rand.Int(rand.Reader, big.NewInt(int64(max)))
	return int(n.Int64())
}

// renderCaptchaSVG renders the captcha question as a distorted SVG image (data URL)
func renderCaptchaSVG(text string) string {
	const w, h = 260, 72

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d">`, w, h))

	// Dark background
	sb.WriteString(fmt.Sprintf(`<rect width="%d" height="%d" rx="6" fill="#0d1117"/>`, w, h))

	// Noise lines (thin, semi-transparent)
	for i := 0; i < 10; i++ {
		x1, y1 := randInt(w), randInt(h)
		x2, y2 := randInt(w), randInt(h)
		r, g, bv := 80+randInt(120), 80+randInt(120), 80+randInt(120)
		sb.WriteString(fmt.Sprintf(
			`<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="rgb(%d,%d,%d)" stroke-width="1" opacity="0.35"/>`,
			x1, y1, x2, y2, r, g, bv))
	}

	// Random dots
	for i := 0; i < 25; i++ {
		cx, cy := randInt(w), randInt(h)
		r, g, bv := 100+randInt(155), 100+randInt(155), 100+randInt(155)
		sb.WriteString(fmt.Sprintf(
			`<circle cx="%d" cy="%d" r="1.5" fill="rgb(%d,%d,%d)" opacity="0.4"/>`,
			cx, cy, r, g, bv))
	}

	// Wavy arc across middle (extra noise)
	sb.WriteString(fmt.Sprintf(
		`<path d="M 0 %d Q %d %d %d %d Q %d %d %d %d" stroke="#334155" stroke-width="1.5" fill="none" opacity="0.5"/>`,
		h/2,
		w/4, h/2+randInt(20)-10,
		w/2, h/2+randInt(20)-10,
		3*w/4, h/2+randInt(20)-10,
		w, h/2,
	))

	// Bright colors for characters
	palette := []string{"#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#38bdf8", "#fb923c"}

	chars := []rune(text)
	charW := 30
	totalW := len(chars) * charW
	startX := (w - totalW) / 2

	for i, ch := range chars {
		x := startX + i*charW + charW/2
		y := 46 + randInt(10) - 5
		rot := randInt(22) - 11
		color := palette[randInt(len(palette))]
		fontSize := 26 + randInt(6)

		// Slight shadow
		sb.WriteString(fmt.Sprintf(
			`<text x="%d" y="%d" font-family="'Courier New',monospace" font-size="%d" font-weight="900" fill="#00000066" text-anchor="middle" transform="rotate(%d,%d,%d)">%s</text>`,
			x+2, y+2, fontSize, rot, x, y, string(ch)))
		// Main char
		sb.WriteString(fmt.Sprintf(
			`<text x="%d" y="%d" font-family="'Courier New',monospace" font-size="%d" font-weight="900" fill="%s" text-anchor="middle" transform="rotate(%d,%d,%d)">%s</text>`,
			x, y, fontSize, color, rot, x, y, string(ch)))
	}

	// Border
	sb.WriteString(fmt.Sprintf(`<rect width="%d" height="%d" rx="6" fill="none" stroke="#334155" stroke-width="1"/>`, w, h))

	sb.WriteString(`</svg>`)

	encoded := base64.StdEncoding.EncodeToString([]byte(sb.String()))
	return "data:image/svg+xml;base64," + encoded
}
