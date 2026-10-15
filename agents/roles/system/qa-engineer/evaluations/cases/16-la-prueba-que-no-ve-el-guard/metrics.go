package v2

// Business-metrics surface (custom DogStatsD counters and gauges) alongside the tracing helpers in
// this package. Tracing answers "how did this request behave"; these answer "how many of X happened,
// broken down by tag", sent to the Datadog agent over DogStatsD, separate from APM traces.

import (
	"fmt"
	"net"
	"os"
	"strings"

	"github.com/DataDog/datadog-go/v5/statsd"
)

const (
	EnvDDAgentHost     = "DD_AGENT_HOST"
	EnvDDDogstatsdPort = "DD_DOGSTATSD_PORT"
	// EnvDDDogstatsdURL is the full DogStatsD endpoint URL. When set it takes priority over
	// DD_AGENT_HOST/DD_DOGSTATSD_PORT in datadog-go and may carry a scheme (unix://, udp://).
	EnvDDDogstatsdURL = "DD_DOGSTATSD_URL"
	EnvDDService      = "DD_SERVICE"
	EnvDDEnv          = "DD_ENV"

	DefaultAgentHost     = "127.0.0.1"
	DefaultDogstatsdPort = "8125"
	DefaultEnv           = "development"

	metricSampleRate = 1
)

// Metrics is the business-metrics surface: counters and gauges emitted to the Datadog agent with tags.
type Metrics interface {
	Count(name string, value int64, tags []string) error
	Incr(name string, tags []string) error
	Gauge(name string, value float64, tags []string) error
	Close() error
}

type statsdMetrics struct {
	client *statsd.Client
}

var _ Metrics = (*statsdMetrics)(nil)

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// dogstatsdAddr builds the address passed to statsd.New. A Unix Domain Socket or Windows pipe host
// already carries the full address with its scheme, so it is returned verbatim; any other host is a
// UDP endpoint joined with the port.
func dogstatsdAddr(host, port string) string {
	for _, prefix := range statsd.AddressPrefixes {
		if strings.HasPrefix(host, prefix) {
			return host
		}
	}
	return net.JoinHostPort(host, port)
}

// dogstatsdURLSupported reports whether a DD_DOGSTATSD_URL value uses a scheme that datadog-go's
// resolver (parseAgentURL) actually honors: only udp:// and unix://. Note that unixgram:// does not
// match unix:// (different prefix). Returning false keeps us on the DD_AGENT_HOST/port path with
// defaults instead of handing the client an unusable address.
func dogstatsdURLSupported(url string) bool {
	return strings.HasPrefix(url, "udp://") || strings.HasPrefix(url, "unix://")
}

// newMetricsAt builds the client for an already-resolved DogStatsD address. An empty addr lets the
// client autodetect the endpoint from the environment (DD_DOGSTATSD_URL / DD_AGENT_HOST).
func newMetricsAt(addr, namespace string, globalTags []string) (Metrics, error) {
	opts := make([]statsd.Option, 0, 2)
	if namespace != "" {
		opts = append(opts, statsd.WithNamespace(namespace))
	}
	if len(globalTags) > 0 {
		opts = append(opts, statsd.WithTags(globalTags))
	}

	client, err := statsd.New(addr, opts...)
	if err != nil {
		return nil, fmt.Errorf("datadog metrics: %w", err)
	}
	return &statsdMetrics{client: client}, nil
}

// NewMetricsFromEnv builds the client from the DD_* environment (DD_DOGSTATSD_URL, or
// DD_AGENT_HOST/DD_DOGSTATSD_PORT) with Unified Service Tagging consistent with the tracer.
//
// When DD_DOGSTATSD_URL carries a scheme the client resolver understands (udp:// or unix://, the only
// ones datadog-go's parseAgentURL accepts) we pass an empty address so the client autodetects the
// whole environment. Any other DD_DOGSTATSD_URL value (unixgram://, unixstream://, http://, malformed)
// would make the client fall through to a raw/empty DD_AGENT_HOST and lose this library's defaults, so
// we ignore it and resolve the classic DD_AGENT_HOST/DD_DOGSTATSD_PORT.
func NewMetricsFromEnv(appName string) (Metrics, error) {
	var globalTags []string
	if os.Getenv(EnvDDService) == "" {
		globalTags = append(globalTags, "service:"+appName)
	}
	if os.Getenv(EnvDDEnv) == "" {
		globalTags = append(globalTags, "env:"+DefaultEnv)
	}

	if dogstatsdURLSupported(os.Getenv(EnvDDDogstatsdURL)) {
		return newMetricsAt("", "", globalTags)
	}
	addr := dogstatsdAddr(getEnv(EnvDDAgentHost, DefaultAgentHost), getEnv(EnvDDDogstatsdPort, DefaultDogstatsdPort))
	return newMetricsAt(addr, "", globalTags)
}

func (m *statsdMetrics) Count(name string, value int64, tags []string) error {
	return m.client.Count(name, value, tags, metricSampleRate)
}

func (m *statsdMetrics) Incr(name string, tags []string) error {
	return m.client.Incr(name, tags, metricSampleRate)
}

func (m *statsdMetrics) Gauge(name string, value float64, tags []string) error {
	return m.client.Gauge(name, value, tags, metricSampleRate)
}

func (m *statsdMetrics) Close() error {
	return m.client.Close()
}
