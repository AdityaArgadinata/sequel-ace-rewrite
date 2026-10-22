package database

import (
	"testing"
)

func TestCSVValue(t *testing.T) {
	for _, tt := range []struct {
		c    Cell
		want string
	}{
		{Cell{Null: true}, `\N`}, {Cell{}, `\E`}, {Cell{Binary: true, Value: "0x00ff"}, `\B00ff`}, {Cell{Binary: true, Value: "0x"}, `\B`},
		{Cell{Value: `\N`}, `\\N`}, {Cell{Value: `\E`}, `\\E`}, {Cell{Value: `\B00ff`}, `\\B00ff`},
		{Cell{Value: "line\r\n\ttail"}, `line\r\n\ttail`}, {Cell{Value: "🙂,\"quote\""}, "🙂,\"quote\""}, {Cell{Value: "18446744073709551615"}, "18446744073709551615"},
	} {
		if got := csvValue(tt.c); got != tt.want {
			t.Fatalf("%#v: %q != %q", tt.c, got, tt.want)
		}
	}
}
