// Package customserver provides a custom HTTP server implementation.
package customserver

import (
	"encoding/json"
	"fmt"
)

// GeneratePaginatedResponse is a generic function that constructs pagination data.
// It accepts a slice of any type [T any], a key for that slice ('dataKey'),
// the total count of records, and the pagination parameters from the request.
func GeneratePaginatedResponse[T any](
	data []T,
	dataKey string,
	totalCount int64,
	page, limit int,
	baseURL string, // Base URL for generating links, e.g., "domain.com/users"
) (map[string]interface{}, error) {
	offset := (page - 1) * limit
	totalPages := 0
	if totalCount > 0 {
		totalPages = int(totalCount-1)/limit + 1
	}

	var prevPage, nextPage *int
	if page > 1 && page <= totalPages {
		p := page - 1
		prevPage = &p
	}
	if page < totalPages {
		n := page + 1
		nextPage = &n
	}

	paginationInfo := Pagination{
		TotalCount:   totalCount,
		TotalPages:   totalPages,
		Count:        len(data),
		Limit:        limit,
		Offset:       offset,
		CurrentPage:  page,
		PreviousPage: prevPage,
		NextPage:     nextPage,
	}

	// (Optional) Build HATEOAS links
	if baseURL != "" {
		paginationInfo.First = fmt.Sprintf("%s?page=1&limit=%d", baseURL, limit)
		paginationInfo.Last = fmt.Sprintf("%s?page=%d&limit=%d", baseURL, totalPages, limit)
		paginationInfo.Current = fmt.Sprintf("%s?page=%d&limit=%d", baseURL, page, limit)
		if prevPage != nil {
			paginationInfo.Previous = fmt.Sprintf("%s?page=%d&limit=%d", baseURL, *prevPage, limit)
		}
		if nextPage != nil {
			paginationInfo.Next = fmt.Sprintf("%s?page=%d&limit=%d", baseURL, *nextPage, limit)
		}
	}

	// Merge the metadata and the items under dataKey into a single map.
	raw, err := json.Marshal(paginationInfo)
	if err != nil {
		return nil, fmt.Errorf("pagination: %w", err)
	}
	result := map[string]interface{}{}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("pagination: %w", err)
	}
	result[dataKey] = data
	return result, nil
}
