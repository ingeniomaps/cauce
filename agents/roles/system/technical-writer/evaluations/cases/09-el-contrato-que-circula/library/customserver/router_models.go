// Package customserver provides a custom HTTP server implementation.
package customserver

// DataInterface is an interface that defines the data field of a GenericResponse.
type DataInterface interface{}

// GenericResponse is a struct that represents a generic response from the server.
type GenericResponse struct {
	IsSuccessful bool          `json:"is_successful"`
	StatusCode   int           `json:"status_code"`
	StatusReason string        `json:"status_reason"`
	Data         DataInterface `json:"data"`
}

// Pagination represents the pagination information for a paginated response.
type Pagination struct {
	Count        int    `json:"count"`
	Limit        int    `json:"limit"`
	Offset       int    `json:"offset"`
	TotalPages   int    `json:"total_pages"`
	TotalCount   int64  `json:"total_count"`
	PreviousPage *int   `json:"previous_page"`
	CurrentPage  int    `json:"current_page"`
	NextPage     *int   `json:"next_page"`
	Previous     string `json:"previous_page_link,omitempty"`
	Current      string `json:"current_page_link,omitempty"`
	Next         string `json:"next_page_link,omitempty"`
	First        string `json:"first_page_link,omitempty"`
	Last         string `json:"last_page_link,omitempty"`
}
