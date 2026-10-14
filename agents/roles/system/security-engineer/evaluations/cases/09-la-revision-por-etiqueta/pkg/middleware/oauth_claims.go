// Extracto de github.com/acme-org/toolkit/tools/jwttools, tal como lo consume el middleware.
package jwttools

import "github.com/golang-jwt/jwt/v5"

// OAuthClaims is the claim set auth-service puts in every access token.
type OAuthClaims struct {
	jwt.RegisteredClaims        // iss, sub, aud, exp, iat
	CountryCode          string `json:"country_code"` // ISO code of the user's country (e.g. "CO")
	UserID               int64  `json:"user_id"`
	Role                 string `json:"role"`
}
