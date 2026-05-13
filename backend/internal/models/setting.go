package models

// Setting stores key-value configuration in the database
type Setting struct {
	Key   string `gorm:"primaryKey;size:100" json:"key"`
	Value string `gorm:"size:2048" json:"value"`
}
