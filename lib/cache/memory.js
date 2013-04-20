/**
 * An in-memory cache of capabilities.
 * 
 * This class handles basic caching capabilities in memory.
 * 
 * @constructor
 * @api public
 */
var MemoryCache = function() {
	/**
	 * Cache of capabilities. Key is `node#ver` and value is the capability information
	 * @type {{Hash}}
	 * @api private
	 */
	this._capsCache = {};
	/**
	 * Cache of extension capabilities. `{ "node#ver": { "ext": ... } }`
	 * @type {{Hash}}
	 * @api private
	 */
	this._extCache = {};
};

MemoryCache.prototype = {
	/**
	 * Retrieves capabilities for the specified node
	 * 
	 * @param node Node to retrieve capabilities for
	 * @param callback Callback to call when capabilities are retrieved. Parameters are:
	 *                  - err: Error if one occured (otherwise null)
	 *                  - caps: Capabilities
	 * @api public
	 */
	getCapabilities: function(node, callback) {
		callback(null, this._capsCache[node]);
	},

	/**
	 * Caches the capabilities for the specified node
	 * 
	 * @param node Node to save capabilities for
	 * @param caps Capabilities to save
	 * @api public
	 */
	saveCapabilities: function(node, caps) {
		this._capsCache[node] = caps;
	},

	/**
	 * Retrieves details on the specified extensions for the specified node
	 * @param node Node to retrieve capabilities for
	 * @param exts Extensions to retrieve
	 * @param callback Callback to call when capabilities are retrieved. Parameters are:
	 *                  - err: Error if one occured (otherwise null)
	 *                  - cachedExts: Hash of extensions that are cached. Key is extension name.
	 *                  - uncachedExts: Array of the currently uncached extensions
	 * @api public
	 */
	getExtensions: function(node, exts, callback) {
		var extCache = this._extCache[node] || {},
			cached = {},
			notCached = [];
		
		exts.forEach(function(ext) {
			if (extCache[ext]) {
				cached[ext] = extCache[ext];
			} else {
				notCached.push(ext);
			}
		});
		
		callback(null, cached, notCached);
	},

	/**
	 * Caches the specified extensions
	 * 
	 * @param node Node to save capabilities for
	 * @param ext Extension to save capabilities for
	 * @param features Features to cache for these capabilities
	 * @api public
	 */
	saveExtension: function(node, ext, features) {
		if (!this._extCache[node]) {
			this._extCache[node] = {};
		}

		this._extCache[node][ext] = features;
	}
};

/**
 * Expose publicly
 * 
 * @type {Function}
 */
module.exports = MemoryCache;