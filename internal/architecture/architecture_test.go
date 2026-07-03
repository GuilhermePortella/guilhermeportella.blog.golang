package architecture_test

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"
)

const modulePath = "github.com/guilhermeportella/guilhermeportella.github.io"

type goFile struct {
	path    string
	pkgPath string
	imports []string
}

func TestArchitectureRules(t *testing.T) {
	files := loadGoFiles(t)

	tests := []struct {
		name    string
		matches func(goFile) bool
		denies  func(string) bool
		message string
	}{
		{
			name:    "blog package is independent from HTTP transport",
			matches: inPackage("internal/blog"),
			denies:  importsAny("net/http", modulePath+"/internal/transport/http"),
			message: "internal/blog deve continuar sem depender de HTTP; prepare dados no dominio e exponha via transport.",
		},
		{
			name:    "config package is independent from project packages",
			matches: inPackage("internal/config"),
			denies:  importsPrefix(modulePath + "/"),
			message: "internal/config deve ficar na base da aplicacao e nao importar outros pacotes do projeto.",
		},
		{
			name:    "transport does not bootstrap server or load env config",
			matches: inPackage("internal/transport/http"),
			denies: importsAny(
				modulePath+"/internal/config",
				modulePath+"/internal/server",
			),
			message: "internal/transport/http deve receber dependencias prontas, sem carregar config nem iniciar servidor.",
		},
		{
			name:    "platform logger stays reusable",
			matches: inPackage("internal/platform/logger"),
			denies: importsAny(
				modulePath+"/internal/blog",
				modulePath+"/internal/server",
				modulePath+"/internal/transport/http",
			),
			message: "internal/platform/logger nao deve conhecer dominio, servidor ou transporte HTTP.",
		},
		{
			name:    "internal packages do not import command packages",
			matches: inInternalPackage,
			denies:  importsPrefix(modulePath + "/cmd/"),
			message: "pacotes internal nao devem depender de cmd; cmd apenas compoe a aplicacao.",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			for _, file := range files {
				if !test.matches(file) {
					continue
				}

				for _, importedPackage := range file.imports {
					if test.denies(importedPackage) {
						t.Errorf("%s imports %q: %s", file.path, importedPackage, test.message)
					}
				}
			}
		})
	}
}

func loadGoFiles(t *testing.T) []goFile {
	t.Helper()

	root := repositoryRoot(t)
	var files []goFile

	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			switch entry.Name() {
			case ".git", "bin", "dist", "tmp", "vendor":
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") {
			return nil
		}

		parsed, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}

		imports := make([]string, 0, len(parsed.Imports))
		for _, spec := range parsed.Imports {
			importPath, err := strconv.Unquote(spec.Path.Value)
			if err != nil {
				return err
			}
			imports = append(imports, importPath)
		}

		relativePath, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}

		files = append(files, goFile{
			path:    filepath.ToSlash(relativePath),
			pkgPath: packagePath(root, path),
			imports: imports,
		})

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	return files
}

func repositoryRoot(t *testing.T) string {
	t.Helper()

	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}

	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("go.mod not found")
		}
		dir = parent
	}
}

func packagePath(root, path string) string {
	relativePath, err := filepath.Rel(root, filepath.Dir(path))
	if err != nil {
		return ""
	}
	return filepath.ToSlash(relativePath)
}

func inPackage(pkg string) func(goFile) bool {
	return func(file goFile) bool {
		return file.pkgPath == pkg
	}
}

func inInternalPackage(file goFile) bool {
	return file.pkgPath == "internal" || strings.HasPrefix(file.pkgPath, "internal/")
}

func importsAny(imports ...string) func(string) bool {
	return func(importPath string) bool {
		return slices.Contains(imports, importPath)
	}
}

func importsPrefix(prefix string) func(string) bool {
	return func(importPath string) bool {
		return strings.HasPrefix(importPath, prefix)
	}
}
