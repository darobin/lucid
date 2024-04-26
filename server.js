

// XXX
// This supports:
//  - A simple express router that is given a manifest and a path, and can serve
//    those CIDs off a path, with the correct media type, plus serving the tile.
//  - A dev server that sends a UI showing the web+tile URL and updates it whenever
//    it receives a change of manifest via an EventSource. It also configures a
//    vhost to serve the tile along with the route to provide its content.
//  - The UI also has a worker that can DTRT on the client side.
