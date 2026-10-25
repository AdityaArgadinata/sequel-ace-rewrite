// Package cellfiles transfers one loaded cell without interpreting its contents.
package cellfiles

import (
	"encoding/hex"
	"errors"
	"io"
	"os"
	"sequel-rewrite/internal/database"
	"sequel-rewrite/internal/exportfile"
	"strings"
	"unicode/utf8"
)

func Read(path string, binary bool) (database.Cell, error) {
	limit := database.MaxResultBytes
	if binary {
		limit = (limit - 2) / 2
	}
	info, err := os.Stat(path)
	if err != nil {
		return database.Cell{}, err
	}
	if !info.Mode().IsRegular() || info.Size() > int64(limit) {
		return database.Cell{}, errors.New("cell file exceeds the cell size limit or is not a regular file")
	}
	file, err := os.Open(path)
	if err != nil {
		return database.Cell{}, err
	}
	defer file.Close()
	info, err = file.Stat()
	if err != nil {
		return database.Cell{}, err
	}
	if !info.Mode().IsRegular() || info.Size() > int64(limit) {
		return database.Cell{}, errors.New("cell file exceeds the cell size limit or is not a regular file")
	}
	raw, err := io.ReadAll(io.LimitReader(file, int64(limit)+1))
	if err != nil {
		return database.Cell{}, err
	}
	if len(raw) > limit {
		return database.Cell{}, errors.New("cell file exceeds the cell size limit")
	}
	if binary {
		return database.Cell{Value: "0x" + hex.EncodeToString(raw), Binary: true}, nil
	}
	if !utf8.Valid(raw) {
		return database.Cell{}, errors.New("text import requires UTF-8; choose Hex to import raw bytes")
	}
	return database.Cell{Value: string(raw)}, nil
}
func Bytes(c database.Cell) ([]byte, error) {
	if c.Null {
		return nil, errors.New("NULL has no file contents; choose an empty value to export an empty file")
	}
	if len(c.Value) > database.MaxResultBytes {
		return nil, errors.New("cell value exceeds 4 MiB encoded data")
	}
	if c.Binary {
		if !strings.HasPrefix(c.Value, "0x") {
			return nil, errors.New("binary cell must use 0x followed by hex pairs")
		}
		raw, err := hex.DecodeString(c.Value[2:])
		if err != nil {
			return nil, errors.New("invalid binary hex value")
		}
		return raw, nil
	}
	if !utf8.ValidString(c.Value) {
		return nil, errors.New("text cell must be valid UTF-8")
	}
	return []byte(c.Value), nil
}
func Write(path string, c database.Cell) error {
	raw, err := Bytes(c)
	if err != nil {
		return err
	}
	_, err = exportfile.WriteNew(path, func(w io.Writer) (int64, error) { n, e := w.Write(raw); return int64(n), e })
	return err
}
