package mailer

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"

	"github.com/dingdns/dingdns/internal/models"
)

// GetBaseURL returns the configured base URL or empty string
func GetBaseURL() string {
	var s models.Setting
	if err := models.DB.Where("key = ?", "base_url").First(&s).Error; err != nil {
		return ""
	}
	return strings.TrimRight(s.Value, "/")
}

// SMTPConfig holds SMTP configuration
type SMTPConfig struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string
	UseTLS   bool
}

// GetSMTPConfig loads SMTP settings from database
func GetSMTPConfig() *SMTPConfig {
	cfg := &SMTPConfig{}

	keys := []string{"smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_from", "smtp_tls"}
	var settings []models.Setting
	models.DB.Where("key IN ?", keys).Find(&settings)

	for _, s := range settings {
		switch s.Key {
		case "smtp_host":
			cfg.Host = s.Value
		case "smtp_port":
			cfg.Port = s.Value
		case "smtp_username":
			cfg.Username = s.Value
		case "smtp_password":
			cfg.Password = s.Value
		case "smtp_from":
			cfg.From = s.Value
		case "smtp_tls":
			cfg.UseTLS = s.Value == "true"
		}
	}

	if cfg.Port == "" {
		cfg.Port = "587"
	}

	return cfg
}

// IsConfigured checks if SMTP is properly configured
func (c *SMTPConfig) IsConfigured() bool {
	return c.Host != "" && c.From != ""
}

// SendMail sends an email
func SendMail(to, subject, htmlBody string) error {
	cfg := GetSMTPConfig()
	if !cfg.IsConfigured() {
		return fmt.Errorf("SMTP not configured")
	}

	from := cfg.From
	addr := net.JoinHostPort(cfg.Host, cfg.Port)

	// Build message
	msg := strings.Builder{}
	msg.WriteString(fmt.Sprintf("From: %s\r\n", from))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", to))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n")
	msg.WriteString("\r\n")
	msg.WriteString(htmlBody)

	var auth smtp.Auth
	if cfg.Username != "" {
		auth = smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)
	}

	if cfg.UseTLS {
		// TLS connection (port 465)
		tlsConfig := &tls.Config{
			ServerName: cfg.Host,
		}
		conn, err := tls.Dial("tcp", addr, tlsConfig)
		if err != nil {
			return fmt.Errorf("TLS dial failed: %v", err)
		}
		defer conn.Close()

		client, err := smtp.NewClient(conn, cfg.Host)
		if err != nil {
			return fmt.Errorf("SMTP client failed: %v", err)
		}
		defer client.Close()

		if auth != nil {
			if err := client.Auth(auth); err != nil {
				return fmt.Errorf("SMTP auth failed: %v", err)
			}
		}

		if err := client.Mail(from); err != nil {
			return err
		}
		if err := client.Rcpt(to); err != nil {
			return err
		}
		w, err := client.Data()
		if err != nil {
			return err
		}
		_, err = w.Write([]byte(msg.String()))
		if err != nil {
			return err
		}
		return w.Close()
	}

	// STARTTLS (port 587) or plain (port 25)
	return smtp.SendMail(addr, auth, from, []string{to}, []byte(msg.String()))
}

// SendVerificationEmail sends an account verification email
func SendVerificationEmail(email, token, baseURL string) error {
	if baseURL == "" {
		baseURL = GetBaseURL()
	}
	verifyURL := fmt.Sprintf("%s/api/auth/verify?token=%s", baseURL, token)

	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 40px 0;">
<div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #2563eb; margin: 0;">DingDns</h1>
    <p style="color: #666; margin-top: 5px;">DNS Management</p>
  </div>
  <h2 style="color: #333;">Verify Your Email</h2>
  <p style="color: #555; line-height: 1.6;">Thanks for registering! Click the button below to verify your email address and activate your account.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="%s" style="display: inline-block; padding: 12px 32px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Verify Email</a>
  </div>
  <p style="color: #888; font-size: 13px;">If the button doesn't work, copy this link:<br><a href="%s" style="color: #2563eb; word-break: break-all;">%s</a></p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">
  <p style="color: #aaa; font-size: 12px; text-align: center;">If you didn't create this account, you can ignore this email.</p>
</div>
</body>
</html>`, verifyURL, verifyURL, verifyURL)

	return SendMail(email, "Verify Your Email - DingDns", html)
}

// SendTestEmail sends a test email to verify SMTP config
func SendTestEmail(to string) error {
	html := `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; padding: 40px;">
<div style="max-width: 400px; margin: 0 auto; text-align: center;">
  <h1 style="color: #2563eb;">DingDns</h1>
  <p style="color: #333; font-size: 18px;">SMTP Test Successful!</p>
  <p style="color: #666;">Your email configuration is working correctly.</p>
</div>
</body>
</html>`

	return SendMail(to, "DingDns - SMTP Test", html)
}
