package configs

import (
	"maps"
	"slices"
	"strings"
)

// Config is the MCP server configuration loaded from the config-map.
type Config struct {
	// PublicKeyPEM comes from env MCP_JWT_PUBLIC_KEY; parsed in the composition root.
	PublicKeyPEM string
	JWTAudience  string
	// Countries is keyed by upper-cased country code (e.g. "CO").
	Countries map[string]CountryConfig
}

// CountryConfig holds settings that differ per country.
type CountryConfig struct {
	// Issuer is the `iss` auth-service sets on this country's access tokens.
	Issuer string
}

// Issuers returns the distinct issuers of all configured countries, sorted.
func (c Config) Issuers() []string {
	set := make(map[string]struct{}, len(c.Countries))
	for _, cc := range c.Countries {
		set[cc.Issuer] = struct{}{}
	}
	return slices.Sorted(maps.Keys(set))
}

const countriesKey = "countries"

func loadCountries(cfg ConfigReader) map[string]CountryConfig {
	codes := cfg.GetStringMapKeys(countriesKey)
	countries := make(map[string]CountryConfig, len(codes))
	for _, code := range codes {
		key := countriesKey + "." + code + ".issuer"
		issuer := strings.TrimSpace(cfg.GetString(key))
		if issuer == "" {
			warn("config-map: issuer de país vacío", key)
		}
		countries[strings.ToUpper(code)] = CountryConfig{Issuer: issuer}
	}
	return countries
}
