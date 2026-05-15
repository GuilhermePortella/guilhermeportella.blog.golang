package httptransport

import (
	"net/http"
	"os"
	"path"
	"strings"
)

func newStaticFileServer(staticDir string) http.Handler {
	return http.FileServer(staticFileSystem{root: http.Dir(staticDir)})
}

type staticFileSystem struct {
	root http.FileSystem
}

func (fsys staticFileSystem) Open(name string) (http.File, error) {
	cleanName := path.Clean("/" + name)
	if hasHiddenPathSegment(cleanName) {
		return nil, os.ErrNotExist
	}

	file, err := fsys.root.Open(name)
	if err != nil {
		return nil, err
	}

	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, err
	}

	if info.IsDir() && !hasIndexFile(fsys.root, name) {
		_ = file.Close()
		return nil, os.ErrNotExist
	}

	return file, nil
}

func hasHiddenPathSegment(name string) bool {
	for _, segment := range strings.Split(name, "/") {
		if strings.HasPrefix(segment, ".") {
			return true
		}
	}
	return false
}

func hasIndexFile(root http.FileSystem, dir string) bool {
	indexPath := path.Join(dir, "index.html")
	indexFile, err := root.Open(indexPath)
	if err != nil {
		return false
	}
	defer indexFile.Close()

	info, err := indexFile.Stat()
	return err == nil && !info.IsDir()
}
