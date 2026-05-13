package core

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"math"
	"strings"
	"time"
)

// GenerateTOTPSecret creates a new TOTP secret
func GenerateTOTPSecret() (string, error) {
	bytes := make([]byte, 20)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(bytes), nil
}

// GenerateBackupCodes creates 8 random backup codes
func GenerateBackupCodes() ([]string, error) {
	codes := make([]string, 8)
	for i := range codes {
		b := make([]byte, 4)
		if _, err := rand.Read(b); err != nil {
			return nil, err
		}
		code := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)
		codes[i] = code[:4] + "-" + code[4:8]
	}
	return codes, nil
}

// ValidateTOTPCode validates a TOTP code with ±1 step window
func ValidateTOTPCode(secret string, code string) bool {
	now := time.Now()
	for _, offset := range []int{-1, 0, 1} {
		t := now.Add(time.Duration(offset*30) * time.Second)
		if generateTOTP(secret, t) == code {
			return true
		}
	}
	return false
}

// GetTOTPURI generates the otpauth:// URI for QR code generation
func GetTOTPURI(secret, username, issuer string) string {
	return fmt.Sprintf("otpauth://totp/%s:%s?secret=%s&issuer=%s&digits=6&period=30",
		issuer, username, secret, issuer)
}

func generateTOTP(secret string, t time.Time) string {
	secret = strings.ToUpper(strings.TrimSpace(secret))
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		return ""
	}

	counter := uint64(math.Floor(float64(t.Unix()) / 30))
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, counter)

	mac := hmac.New(sha1.New, key)
	mac.Write(buf)
	sum := mac.Sum(nil)

	offset := sum[len(sum)-1] & 0x0f
	code := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff

	return fmt.Sprintf("%06d", code%1000000)
}
