package database

import (
	"errors"
	"html/template"
	"io"
)

var saPrintTemplate = template.Must(template.New("print").Parse(`<!doctype html><html><head><meta charset="utf-8"><title>sequelx — results</title><style>body{font:12px system-ui;color:#111}table{border-collapse:collapse;width:100%}th,td{border:1px solid #aaa;padding:4px;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}@media print{button{display:none}}@page{size:landscape;margin:12mm}</style></head><body><button onclick="window.print()">Print / Save PDF</button><h1>Loaded results</h1><p>{{len .Rows}} rows.{{if .Truncated}} This result is incomplete.{{end}}</p><table><thead><tr>{{range .Columns}}<th>{{.Name}}</th>{{end}}</tr></thead><tbody>{{range .Rows}}<tr>{{range .}}<td>{{if .Null}}NULL{{else}}{{.Value}}{{end}}</td>{{end}}</tr>{{end}}</tbody></table></body></html>`))

func WritePrintView(w io.Writer, r Result) error {
	if len(r.Rows) > MaxRows || len(r.Columns) > 4096 {
		return errors.New("print view exceeds loaded-result limits")
	}
	size := 0
	for _, c := range r.Columns {
		size += len(c.Name)
	}
	for _, row := range r.Rows {
		if len(row) != len(r.Columns) {
			return errors.New("invalid print row")
		}
		for _, c := range row {
			size += len(c.Value)
		}
	}
	if size > MaxResultBytes {
		return errors.New("print view exceeds 4 MiB")
	}
	return saPrintTemplate.Execute(w, r)
}
