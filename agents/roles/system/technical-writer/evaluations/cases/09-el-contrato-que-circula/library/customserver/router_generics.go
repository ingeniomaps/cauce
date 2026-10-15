// Package customserver provides a custom HTTP server implementation.
package customserver

import "net/http"

// GenerateGeneticResponse generates a GenericResponse with the specified parameters.
func GenerateGeneticResponse(
	isSuccessful bool,
	statusCode int,
	statusReason string,
	data DataInterface,
) GenericResponse {
	return GenericResponse{
		IsSuccessful: isSuccessful,
		StatusCode:   statusCode,
		StatusReason: statusReason,
		Data:         data,
	}
}

// GenerateSuccessGenericResponse generates a successful GenericResponse with the specified data.
func GenerateSuccessGenericResponse(data DataInterface) GenericResponse {
	return GenerateGeneticResponse(true, http.StatusOK, "OK", data)
}

// GenerateErrorGenericResponse generates an error GenericResponse
// with the specified status code, status reason, and data.
func GenerateErrorGenericResponse(statusCode int, statusReason string, data DataInterface) GenericResponse {
	return GenerateGeneticResponse(false, statusCode, statusReason, data)
}

// GenerateSuccessPaginatedResponse creates a successful GenericResponse specifically for paginated data.
func GenerateSuccessPaginatedResponse(data map[string]interface{}) GenericResponse {
	return GenerateGeneticResponse(true, http.StatusOK, "OK", data)
}
