package dns

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/dingdns/dingdns/internal/core"
	dnscore "github.com/dingdns/dingdns/internal/dns"
	"github.com/dingdns/dingdns/internal/models"
	"github.com/gin-gonic/gin"
)

type Handler struct{}

func NewHandler() *Handler {
	return &Handler{}
}

// --- Zones ---

func (h *Handler) ListZones(c *gin.Context) {
	var zones []models.Zone
	models.DB.Preload("Records").Find(&zones)
	c.JSON(http.StatusOK, gin.H{"zones": zones, "total": len(zones)})
}

func (h *Handler) GetZone(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid zone id"})
		return
	}

	var zone models.Zone
	if err := models.DB.Preload("Records").First(&zone, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "zone not found"})
		return
	}

	c.JSON(http.StatusOK, zone)
}

func (h *Handler) CreateZone(c *gin.Context) {
	var req struct {
		Name     string `json:"name" binding:"required"`
		ZoneType string `json:"zone_type"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "zone name required"})
		return
	}

	zoneName := strings.ToLower(strings.TrimSpace(req.Name))

	// Check if zone already exists
	var existing models.Zone
	if err := models.DB.Where("name = ?", zoneName).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "zone already exists"})
		return
	}

	zoneType := req.ZoneType
	if zoneType == "" {
		if strings.HasSuffix(zoneName, ".dingdns.com") {
			zoneType = "subdomain"
		} else {
			zoneType = "custom"
		}
	}

	zone := models.Zone{
		Name:     zoneName,
		ZoneType: zoneType,
		IsActive: true,
	}
	zone.IncrementSerial()

	if err := models.DB.Create(&zone).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create zone"})
		return
	}

	// Auto-create NS records
	nsRecords := []models.Record{
		{ZoneID: zone.ID, Name: "@", Type: "NS", Content: "ns1.dingdns.com", TTL: 86400},
		{ZoneID: zone.ID, Name: "@", Type: "NS", Content: "ns2.dingdns.com", TTL: 86400},
	}
	for _, r := range nsRecords {
		models.DB.Create(&r)
	}

	logAdminAction(c, "create_zone", "zone", &zone.ID, zoneName+" ("+zoneType+")")
	dnscore.TriggerReload()
	c.JSON(http.StatusCreated, zone)
}

func (h *Handler) UpdateZone(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid zone id"})
		return
	}

	var zone models.Zone
	if err := models.DB.First(&zone, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "zone not found"})
		return
	}

	var req struct {
		IsActive *bool  `json:"is_active"`
		Name     string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	updates := map[string]interface{}{}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	if req.Name != "" {
		updates["name"] = strings.ToLower(strings.TrimSpace(req.Name))
	}

	if len(updates) > 0 {
		models.DB.Model(&zone).Updates(updates)
	}

	logAdminAction(c, "update_zone", "zone", &zone.ID, "")
	dnscore.TriggerReload()
	models.DB.Preload("Records").First(&zone, id)
	c.JSON(http.StatusOK, zone)
}

func (h *Handler) DeleteZone(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid zone id"})
		return
	}

	var zone models.Zone
	if err := models.DB.First(&zone, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "zone not found"})
		return
	}

	// Delete all records in zone
	models.DB.Where("zone_id = ?", zone.ID).Delete(&models.Record{})
	// Delete all DDNS tokens pointing to records in this zone
	models.DB.Where("record_id IN (SELECT id FROM records WHERE zone_id = ?)", zone.ID).Delete(&models.DDNSToken{})
	models.DB.Delete(&zone)

	logAdminAction(c, "delete_zone", "zone", &zone.ID, zone.Name)
	dnscore.TriggerReload()
	c.JSON(http.StatusOK, gin.H{"message": "zone deleted"})
}

// --- Records ---

func (h *Handler) ListRecords(c *gin.Context) {
	zoneID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid zone id"})
		return
	}

	var records []models.Record
	models.DB.Where("zone_id = ?", zoneID).Find(&records)
	c.JSON(http.StatusOK, gin.H{"records": records, "total": len(records)})
}

func (h *Handler) CreateRecord(c *gin.Context) {
	zoneID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid zone id"})
		return
	}

	var zone models.Zone
	if err := models.DB.First(&zone, zoneID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "zone not found"})
		return
	}

	var req struct {
		Name     string `json:"name" binding:"required"`
		Type     string `json:"type" binding:"required"`
		Content  string `json:"content" binding:"required"`
		TTL      uint32 `json:"ttl"`
		Priority uint16 `json:"priority"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name, type, and content are required"})
		return
	}

	if !models.IsValidType(req.Type) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid record type"})
		return
	}

	if err := dnscore.ValidateRecordContent(req.Type, req.Content); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ttl := req.TTL
	if ttl == 0 {
		ttl = 300
	}

	record := models.Record{
		ZoneID:   uint(zoneID),
		Name:     req.Name,
		Type:     req.Type,
		Content:  req.Content,
		TTL:      ttl,
		Priority: req.Priority,
	}

	if err := models.DB.Create(&record).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create record"})
		return
	}

	zone.IncrementSerial()
	models.DB.Save(&zone)

	logAdminAction(c, "create_record", "record", &record.ID, req.Type+":"+req.Name)
	dnscore.TriggerReload()
	c.JSON(http.StatusCreated, record)
}

func (h *Handler) UpdateRecord(c *gin.Context) {
	recordID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid record id"})
		return
	}

	var record models.Record
	if err := models.DB.First(&record, recordID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "record not found"})
		return
	}

	var req struct {
		Name     string `json:"name"`
		Type     string `json:"type"`
		Content  string `json:"content"`
		TTL      uint32 `json:"ttl"`
		Priority uint16 `json:"priority"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if req.Type != "" && !models.IsValidType(req.Type) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid record type"})
		return
	}

	if req.Content != "" {
		recType := req.Type
		if recType == "" {
			recType = record.Type
		}
		if err := dnscore.ValidateRecordContent(recType, req.Content); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	updates := map[string]interface{}{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Type != "" {
		updates["type"] = req.Type
	}
	if req.Content != "" {
		updates["content"] = req.Content
	}
	if req.TTL > 0 {
		updates["ttl"] = req.TTL
	}
	updates["priority"] = req.Priority

	models.DB.Model(&record).Updates(updates)

	var zone models.Zone
	models.DB.First(&zone, record.ZoneID)
	zone.IncrementSerial()
	models.DB.Save(&zone)

	logAdminAction(c, "update_record", "record", &record.ID, "")
	dnscore.TriggerReload()
	models.DB.First(&record, recordID)
	c.JSON(http.StatusOK, record)
}

func (h *Handler) DeleteRecord(c *gin.Context) {
	recordID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid record id"})
		return
	}

	var record models.Record
	if err := models.DB.First(&record, recordID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "record not found"})
		return
	}

	// Delete associated DDNS tokens
	models.DB.Where("record_id = ?", record.ID).Delete(&models.DDNSToken{})
	models.DB.Delete(&record)

	var zone models.Zone
	models.DB.First(&zone, record.ZoneID)
	zone.IncrementSerial()
	models.DB.Save(&zone)

	logAdminAction(c, "delete_record", "record", &record.ID, record.Type+":"+record.Name)
	dnscore.TriggerReload()
	c.JSON(http.StatusOK, gin.H{"message": "record deleted"})
}

// --- DDNS Tokens ---

func (h *Handler) ListDDNSTokens(c *gin.Context) {
	var tokens []models.DDNSToken
	models.DB.Preload("Record").Find(&tokens)
	c.JSON(http.StatusOK, gin.H{"tokens": tokens, "total": len(tokens)})
}

func (h *Handler) CreateDDNSToken(c *gin.Context) {
	var req struct {
		RecordID uint   `json:"record_id" binding:"required"`
		Label    string `json:"label"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "record_id is required"})
		return
	}

	var record models.Record
	if err := models.DB.First(&record, req.RecordID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "record not found"})
		return
	}

	tokenStr, err := models.GenerateToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	token := models.DDNSToken{
		RecordID: req.RecordID,
		Token:    tokenStr,
		Label:    req.Label,
		IsActive: true,
	}

	if err := models.DB.Create(&token).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create token"})
		return
	}

	models.DB.Model(&record).Update("is_ddns", true)

	logAdminAction(c, "create_ddns_token", "token", &token.ID, req.Label)
	c.JSON(http.StatusCreated, token)
}

func (h *Handler) UpdateDDNSToken(c *gin.Context) {
	tokenID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid token id"})
		return
	}

	var token models.DDNSToken
	if err := models.DB.Preload("Record").First(&token, tokenID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "token not found"})
		return
	}

	var req struct {
		Label    string `json:"label"`
		IsActive *bool  `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	updates := map[string]interface{}{}
	if req.Label != "" {
		updates["label"] = req.Label
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	if len(updates) > 0 {
		models.DB.Model(&token).Updates(updates)
	}

	models.DB.Preload("Record").First(&token, tokenID)
	logAdminAction(c, "update_ddns_token", "token", &token.ID, req.Label)
	c.JSON(http.StatusOK, token)
}

func (h *Handler) DeleteDDNSToken(c *gin.Context) {
	tokenID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid token id"})
		return
	}

	var token models.DDNSToken
	if err := models.DB.First(&token, tokenID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "token not found"})
		return
	}

	models.DB.Delete(&token)
	logAdminAction(c, "delete_ddns_token", "token", &token.ID, "")
	c.JSON(http.StatusOK, gin.H{"message": "token deleted"})
}

// --- Helpers ---

func logAdminAction(c *gin.Context, action, resource string, resourceID *uint, details string) {
	adminID := core.GetAdminID(c)
	var aidPtr *uint
	if adminID > 0 {
		aidPtr = &adminID
	}

	log := models.AuditLog{
		UserID:     aidPtr,
		Action:     action,
		Resource:   resource,
		ResourceID: resourceID,
		Details:    details,
		IP:         c.ClientIP(),
	}
	models.DB.Create(&log)
}
