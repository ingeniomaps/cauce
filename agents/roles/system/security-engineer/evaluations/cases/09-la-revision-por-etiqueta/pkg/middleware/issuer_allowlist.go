package middleware

import (
	"fmt"
	"maps"
	"slices"
	"strings"
)

// issuerAllowlist is the set of token issuers the verifier accepts.
type issuerAllowlist struct {
	set    map[string]struct{}
	sorted []string
}

// newIssuerAllowlist rejects empty lists and blank or space-padded entries so
// a misconfigured config-map fails at startup instead of on every request.
// Duplicates are allowed: countries may share an issuer.
func newIssuerAllowlist(issuers []string) (issuerAllowlist, error) {
	if len(issuers) == 0 {
		return issuerAllowlist{}, ErrMissingIssuer
	}
	set := make(map[string]struct{}, len(issuers))
	for _, iss := range issuers {
		if trimmed := strings.TrimSpace(iss); trimmed == "" || trimmed != iss {
			return issuerAllowlist{}, fmt.Errorf("%w: %q", ErrMissingIssuer, iss)
		}
		set[iss] = struct{}{}
	}
	return issuerAllowlist{set: set, sorted: slices.Sorted(maps.Keys(set))}, nil
}

func (a issuerAllowlist) allows(iss string) bool {
	_, ok := a.set[iss]
	return ok
}

func (a issuerAllowlist) list() []string {
	return a.sorted
}
