

class Router {
  constructor() {
    this.routes = []; // { method, segments, handler }
  }

  _add(method, path, handler) {
    const segments = path.split("/").filter(Boolean);
    this.routes.push({ method, segments, handler });
  }

  get(path, handler) { this._add("GET", path, handler); }
  post(path, handler) { this._add("POST", path, handler); }
  put(path, handler) { this._add("PUT", path, handler); }
  patch(path, handler) { this._add("PATCH", path, handler); }
  delete(path, handler) { this._add("DELETE", path, handler); }

  // Tries to match a (method, urlPath) to a registered route.
  // Returns { handler, params } or null.
  match(method, urlPath) {
    const reqSegments = urlPath.split("/").filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== reqSegments.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const routeSeg = route.segments[i];
        const reqSeg = reqSegments[i];
        if (routeSeg.startsWith(":")) {
          params[routeSeg.slice(1)] = decodeURIComponent(reqSeg);
        } else if (routeSeg !== reqSeg) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: route.handler, params };
    }
    return null;
  }
}

module.exports = { Router };
