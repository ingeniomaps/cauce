package v2

import (
	"net"
	"strings"
	"testing"
	"time"
)

// udpSink is a throwaway UDP server that captures DogStatsD datagrams for assertions.
type udpSink struct {
	conn *net.UDPConn
	host string
	port string
}

func newUDPSink(t *testing.T) *udpSink {
	t.Helper()
	addr, err := net.ResolveUDPAddr("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	host, port, err := net.SplitHostPort(conn.LocalAddr().String())
	if err != nil {
		t.Fatalf("split: %v", err)
	}
	return &udpSink{conn: conn, host: host, port: port}
}

// readContaining reads datagrams until one line contains needle or the deadline passes.
func (s *udpSink) readContaining(t *testing.T, needle string) string {
	t.Helper()
	_ = s.conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 8192)
	for {
		n, _, err := s.conn.ReadFromUDP(buf)
		if err != nil {
			t.Fatalf("no datagram containing %q: %v", needle, err)
		}
		for _, line := range strings.Split(string(buf[:n]), "\n") {
			if strings.Contains(line, needle) {
				return line
			}
		}
	}
}

func (s *udpSink) close() { _ = s.conn.Close() }

func TestNewMetricsFromEnv_DogstatsdURL(t *testing.T) {
	sink := newUDPSink(t)
	defer sink.close()
	// A udp:// DD_DOGSTATSD_URL must drive the endpoint (it takes priority over DD_AGENT_HOST).
	t.Setenv(EnvDDDogstatsdURL, "udp://"+sink.host+":"+sink.port)
	t.Setenv(EnvDDAgentHost, "")
	t.Setenv(EnvDDDogstatsdPort, "")

	m, err := NewMetricsFromEnv("orders-worker")
	if err != nil {
		t.Fatalf("NewMetricsFromEnv: %v", err)
	}
	if err := m.Incr("url.feature.started", nil); err != nil {
		t.Fatalf("Incr: %v", err)
	}
	if err := m.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	sink.readContaining(t, "url.feature.started")
}

func TestNewMetricsFromEnv_UnsupportedURLFallsBackToDefaults(t *testing.T) {
	sink := newUDPSink(t)
	defer sink.close()
	// A scheme the client cannot resolve (unixgram://) must NOT clobber the classic path: we fall
	// back to DD_AGENT_HOST/DD_DOGSTATSD_PORT, so the datagram still reaches the sink.
	t.Setenv(EnvDDDogstatsdURL, "unixgram:///var/run/datadog/dsd.socket")
	t.Setenv(EnvDDAgentHost, sink.host)
	t.Setenv(EnvDDDogstatsdPort, sink.port)

	m, err := NewMetricsFromEnv("orders-worker")
	if err != nil {
		t.Fatalf("NewMetricsFromEnv: %v", err)
	}
	if err := m.Incr("url.fallback.started", nil); err != nil {
		t.Fatalf("Incr: %v", err)
	}
	if err := m.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	sink.readContaining(t, "url.fallback.started")
}
