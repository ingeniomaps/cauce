package vendedores

import "errors"

var ErrDuplicado = errors.New("documento ya registrado")

type Repo interface {
	Buscar(documento string) (*Vendedor, error)
	Guardar(v *Vendedor) error
}

// Alta registra un vendedor. Devuelve ErrDuplicado si el documento ya existe.
func Alta(r Repo, documento, nombre string) (*Vendedor, error) {
	existente, err := r.Buscar(documento)
	if err != nil {
		return nil, err
	}
	if existente != nil {
		return nil, ErrDuplicado
	}
	v := &Vendedor{Documento: documento, Nombre: nombre}
	if err := r.Guardar(v); err != nil {
		return nil, err
	}
	return v, nil
}
