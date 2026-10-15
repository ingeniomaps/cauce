// Package middleware provides HTTP middleware for the MCP server and the
// per-request identity that downstream packages read from context. It wraps
// the SDK's auth layer using an OAuth-2.1 RS256 verifier:
//
//   - The access token is signed by `auth-service` with its RSA private key.
//   - The MCP server validates it locally against the RSA public key
//     (`MCP_JWT_PUBLIC_KEY`, distributed via config-map).
//   - Claims shape is `jwttools.OAuthClaims`; `aud`/`exp` are enforced by the
//     parser and `iss` must belong to the configured per-country allowlist.
package middleware

import (
	"context"
	"crypto/rsa"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/acme-org/toolkit/tools/jwttools"
	"github.com/golang-jwt/jwt/v5"
	sdkauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/rs/zerolog/log"
)

const extraRawJWTKey = "raw_jwt"

var (
	ErrMissingPublicKey = errors.New("middleware: JWT public key no puede ser nil")
	ErrMissingIssuer    = errors.New("middleware: JWT issuer vacío o con espacios (config-map countries.<cc>.issuer)")
	ErrMissingAudience  = errors.New("middleware: JWT audience no puede estar vacío")
)

var (
	errTokenInvalid     = errors.New("token inválido")
	errIssuerNotAllowed = errors.New("issuer no permitido")
	errEmptySubject     = errors.New("sub vacío")
)

// User is the per-request identity downstream packages read from context.
// Carries only the raw JWT: the BFF is still the consumer of the bearer for
// the upstream call, so no claim is split out here.
type User struct {
	JWT string
}

type userCtxKey struct{}

// OAuthVerifier validates RS256 JWTs emitted by auth-service: signature, aud,
// exp, non-empty sub, and iss against an allowlist (auth-service emits one iss
// per country). Stateless: key, issuers and audience come from the config-map.
type OAuthVerifier struct {
	publicKey *rsa.PublicKey
	issuers   issuerAllowlist
	Audience  string
}

// NewOAuthVerifier fails fast when the key, issuers or audience are missing
// or invalid, so misconfiguration surfaces at startup.
func NewOAuthVerifier(publicKey *rsa.PublicKey, issuers []string, audience string) (*OAuthVerifier, error) {
	if publicKey == nil {
		return nil, ErrMissingPublicKey
	}
	if strings.TrimSpace(audience) == "" {
		return nil, ErrMissingAudience
	}
	allowlist, err := newIssuerAllowlist(issuers)
	if err != nil {
		return nil, err
	}
	return &OAuthVerifier{publicKey: publicKey, issuers: allowlist, Audience: audience}, nil
}

// Verify implements sdkauth.TokenVerifier.
func (v *OAuthVerifier) Verify(_ context.Context, tokenStr string, _ *http.Request) (*sdkauth.TokenInfo, error) {
	claims := &jwttools.OAuthClaims{}
	if err := v.validate(tokenStr, claims); err != nil {
		v.logRejection(claims, err)
		return nil, fmt.Errorf("%w: %v", sdkauth.ErrInvalidToken, err)
	}

	expiration := time.Time{}
	if claims.ExpiresAt != nil {
		expiration = claims.ExpiresAt.Time
	}
	return &sdkauth.TokenInfo{
		UserID:     claims.Subject,
		Expiration: expiration,
		Extra:      map[string]any{extraRawJWTKey: tokenStr},
	}, nil
}

// validate parses tokenStr into claims and enforces signature, aud, exp, iss and sub.
func (v *OAuthVerifier) validate(tokenStr string, claims *jwttools.OAuthClaims) error {
	parsed, err := jwt.ParseWithClaims(
		tokenStr,
		claims,
		jwttools.NewRS256KeyFunc(v.publicKey),
		jwt.WithAudience(v.Audience),
		jwt.WithExpirationRequired(),
	)
	switch {
	case err != nil:
		return err
	case parsed == nil || !parsed.Valid:
		return errTokenInvalid
	case !v.issuers.allows(claims.Issuer):
		return errIssuerNotAllowed
	case strings.TrimSpace(claims.Subject) == "":
		return errEmptySubject
	}
	return nil
}

// logRejection records what the token carried against what is configured.
// Claims are logged only when the signature was valid, since otherwise anyone
// can choose them.
func (v *OAuthVerifier) logRejection(claims *jwttools.OAuthClaims, err error) {
	msg := "token rechazado: firma/iss/aud/exp falló"
	if errors.Is(err, errEmptySubject) {
		msg = "token rechazado: sub vacío"
	}
	event := log.Warn().
		Str("method", "OAuthVerifier.Verify").
		Err(err).
		Strs("want_iss", v.issuers.list()).
		Str("want_aud", v.Audience)
	if signatureVerified(err) {
		event = event.
			Str("got_iss", claims.Issuer).
			Strs("got_aud", claims.Audience).
			Str("got_sub", claims.Subject).
			Str("got_country", claims.CountryCode)
	}
	event.Msg(msg)
}

func signatureVerified(err error) bool {
	return errors.Is(err, jwt.ErrTokenInvalidClaims) ||
		errors.Is(err, errIssuerNotAllowed) ||
		errors.Is(err, errEmptySubject)
}

// Auth wraps next with the SDK's RequireBearerToken using the verifier.
func Auth(resourceMetadataURL string, verifier *OAuthVerifier, next http.Handler) http.Handler {
	opts := &sdkauth.RequireBearerTokenOptions{}
	if resourceMetadataURL != "" {
		opts.ResourceMetadataURL = resourceMetadataURL
	}
	return sdkauth.RequireBearerToken(verifier.Verify, opts)(next)
}

// FromContext extracts the User from ctx.
func FromContext(ctx context.Context) (User, bool) {
	if ti := sdkauth.TokenInfoFromContext(ctx); ti != nil {
		raw, _ := ti.Extra[extraRawJWTKey].(string)
		return User{JWT: raw}, true
	}
	if u, ok := ctx.Value(userCtxKey{}).(User); ok {
		return u, true
	}
	return User{}, false
}
