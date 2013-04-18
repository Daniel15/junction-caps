/**
 * Module dependencies.
 */
var events = require('events'),
	util = require('util'),
	IQ = require('junction').elements.IQ;

/**
 * Handle XMPP capabilities
 *
 * This middleware allows applications to handle XMPP capabilities.  Applications
 * provide a `callback(handler)` which the middleware calls with an instance of
 * `EventEmitter`.  Listeners can be attached to `handler` in order to process
 * presence stanza.
 *
 * Events:
 *   - `capabilities`   user's capabilities have been received. See capabilitiesParser.js
 *                      to see the data available in this event.
 *
 * Examples:
 *
 *      connection.use(junction.capabilitiesParser());
 *      connection.use(
 *        junction.capabilities(function(handler) {
 *          handler.on('capabilities', function(jid, caps) {
 *            console.log(jid, ' supports these: ', caps);
 *          });
 *        })
 *      );
 *
 * References:
 * - [XEP-0115: Entity Capabilities](http://xmpp.org/extensions/xep-0115.html)
 *
 * @param {Function} fn
 * @return {Function}
 * @api public
 */
module.exports = function capabilities(fn) {
	if (!fn) throw new Error('capabilities middleware requires a callback function');

	var handler = new Handler();
	fn.call(this, handler);

	return function capabilities(stanza, next) {
		if (stanza.is('presence')) {
			handler._handlePresence(stanza);
		} else if (stanza.is('iq')) {
			handler._handleIQ(stanza);
		}

		return next();
	}
}

/**
 * Initialize a new `Handler`.
 *
 * @api private
 */
function Handler() {
	events.EventEmitter.call(this);
	this._cache = {};
	this._pending = {};

	this._extCache = {};
	this._iqRequests = {};
	this._iqCount = 0;
};

/**
 * Inherit from `EventEmitter`.
 */
util.inherits(Handler, events.EventEmitter);

/**
 * Handle a presence stanza, if it include a capabilities node.
 *
 * @param {XMLElement} stanza
 * @api private
 */
Handler.prototype._handlePresence = function (stanza) {
	if (!stanza.caps) {
		return;
	}
	
	var caps = stanza.caps,
		fullNode = caps.node + '#' + caps.ver;
	
	// See if there's any extensions (legacy Entity Capabilities)
	if (caps.ext && caps.ext.length > 0) {
		caps.ext.forEach(function(ext) {
			// TODO: Check if this extension is cached
			
			// Gmail is weird and doesn't return the node attribute in the <query> response, which means we can't tell
			// which extension we asked for just from its response :(. We have to cache it here so we can get to it later.
			this._iqCount++;
			var id = 'caps-ext-' + this._iqCount;
			this._iqRequests[id] = {
				node: caps.node,
				ver: caps.ver,
				ext: ext
			};
			
			// Send a request to get this extension
			var getExt = new IQ(stanza.from, 'get');
			getExt.id = id;
			getExt.c('query', { xmlns: 'http://jabber.org/protocol/disco#info', node: caps.node + '#' + ext });
			stanza.connection.send(getExt);
		}, this);
	}

	// Check if these capabilities are cached (that is, we already know what the verification string resolves to)
	if (this._cache[fullNode]) {
		this.emit('capabilities', stanza.from, this._cache[fullNode]);
		return;
	}

	// Not yet cached, so we need to retrieve the capabilities for this verification string
	// Save this person's JID in an array of pending requests, as we need to fire the event once the capabilities are
	// retrieved.
	if (!this._pending[fullNode]) {
		this._pending[fullNode] = [];
	}

	this._pending[fullNode].push(stanza.from);

	var getCaps = new IQ(stanza.from, 'get');
	getCaps.id = 'caps';
	getCaps.c('query', { xmlns: 'http://jabber.org/protocol/disco#info', node: fullNode });
	stanza.connection.send(getCaps);
};

/**
 * Handle an IQ stanza, if it's a reply to a capability discovery query
 *
 * @param {XMLElement} stanza
 * @api private
 */
Handler.prototype._handleIQ = function (stanza) {
	var id = stanza.attrs.id,
		caps = stanza.capabilities;
	
	if (!caps) {
		return;
	}
	
	// Check if it's in reply to an extension request
	if (id.substr(0, 9) === 'caps-ext-') {
		
		var request = this._iqRequests[id],
			fullNode = request.node + '#' + request.ver;
		
		if (!this._extCache[fullNode]) {
			this._extCache[fullNode] = {};
		}
		
		this._extCache[fullNode][request.ext] = caps.rawFeatures;
		
		// TODO: Send events
		
		delete this._iqRequests[id];
	} else {
		var node = caps.node;
		this._cache[node] = caps;

		// Fire the event for all buddies that were waiting
		if (this._pending[node]) {
			var that = this;
			this._pending[node].forEach(function (jid) {
				that.emit('capabilities', jid, caps);
			});
			delete this._pending[node];
		}	
	}
}
