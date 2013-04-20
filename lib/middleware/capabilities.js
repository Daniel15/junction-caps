/**
 * Module dependencies.
 */
var events = require('events'),
	util = require('util'),
	debug = require('debug')('junction-caps'),
	IQ = require('junction').elements.IQ,
	capabilitiesParser = require('./capabilitiesParser'),
	capsUtil = require('../util');

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
};

/**
 * Initialize a new `Handler`.
 *
 * @api private
 */
function Handler() {
	events.EventEmitter.call(this);
	
	/**
	 * Cache of capabilities. Key is `node#ver` and value is the capability information
	 * @type {{Hash}}
	 * @api private
	 */
	this._cache = {};
	/**
	 * Cache of extension capabilities. `{ "node#ver": { "ext": ... } }`
	 * @type {{Hash}}
	 * @api private
	 */
	this._extCache = {};

	/**
	 * Pending capabilities requests. Key is `node#ver` and value is an array of all the JIDs waiting for this data
	 * @type {{Hash}}
	 * @api private
	 */
	this._pending = {};

	/**
	 * Pending extension requests.
	 * @type {{Hash}}
	 * @api private
	 */
	this._pendingExt = {};

	/**
	 * Users waiting for data of some sort (either main capabilities, or extensions).
	 * @type {{Hash}}
	 * @api private
	 */
	this._pendingBuddies = {};	

	/**
	 * Pending IQ-requests for extensions. Key is the request ID.
	 * @type {{Hash}}
	 * @api private
	 */
	this._iqRequests = {};
	
	/**
	 * Current index for extension IQ-requests, incremented for every IQ-request
	 * @type {Number}
	 * @api private
	 */
	this._iqCount = 0;
}

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
		fullNode = caps.node + '#' + caps.ver,
		uncachedExts = [];
	
	// Find all the extensions (legacy Entity Capabilities) that aren't yet cached
	if (caps.ext) {
		uncachedExts = caps.ext.filter(function(ext) {
			return !this._extCache[fullNode] || !this._extCache[fullNode][ext];
		}.bind(this));
	}

	// Check if these capabilities are fully cached. That is:
	// 1. We know what the verification string resolves to
	// 2. We know what ALL the extensions resolve to
	if (this._cache[fullNode] && uncachedExts.length === 0) {
		this._emitCapabilitiesEvent(stanza);
		return;
	}
	
	// User has some uncached capabilities, so we have to cache some details for later
	this._pendingBuddies[stanza.from] = {
		jid: stanza.from,
		pendingExts: [],
		originalPresence: stanza
	};
	
	// Load the main capabilities if they're not already cached
	if (!this._cache[fullNode]) {
		this._getCapabilitiesFromPresence(stanza);
	}
	
	// Load any required extensions
	if (uncachedExts.length > 0) {
		if (!this._pendingExt[fullNode]) {
			this._pendingExt[fullNode] = {};
		}
		
		uncachedExts.forEach(function(ext) {
			this._getExtensionFromPresence(stanza, ext);	
		}, this);
	}
};

/**
 * Send an IQ-query for discovery. 
 * 
 * Gmail and Google Talk for Android both have odd quirks and don't return the node attribute in the <query> response. 
 * This means that when we get the response, we can't actually tell WHAT we were requesting. Instead, we have to cache 
 * the request (into _iqRequests) so we can get to it later.
 * 
 * @param stanza Incoming stanza
 * @param node Node to retrieve data for
 * @param extraData Any extra data to cache
 * @returns {string} ID of the outgoing IQ-request
 * @api private
 */
Handler.prototype._sendDiscoQuery = function(stanza, node, extraData) {
	this._iqCount++;
	var id = 'caps-' + this._iqCount;
	
	var request = this._iqRequests[id] = extraData;
	request.node = stanza.caps.node;
	request.ver = stanza.caps.ver;
	request.fullNode = stanza.caps.node + '#' + stanza.caps.ver;

	var getCaps = new IQ(stanza.from, 'get');
	getCaps.id = id;
	getCaps.c('query', { xmlns: 'http://jabber.org/protocol/disco#info', node: node });
	stanza.connection.send(getCaps);
	
	return id;
};

/**
 * Send an IQ request to retrieve details about the specified extension
 * @param stanza Original presence stanza
 * @param ext Extension to retrieve details for
 * @api private
 */
Handler.prototype._getExtensionFromPresence = function(stanza, ext) {
	var fullNode = stanza.caps.node + '#' + stanza.caps.ver,
		pendingBuddy = this._pendingBuddies[stanza.from];
	
	// Ensure a request hasn't already been sent for this extension
	if (!this._pendingExt[fullNode][ext]) {
		// No request sent yet, so send it
		this._pendingExt[fullNode][ext] = [];
		
		this._sendDiscoQuery(stanza, stanza.caps.node + '#' + ext, { type: 'ext', ext: ext });
	}
	
	// Extensions need to know about which users they apply to
	// And the users need to know which extensions they're waiting on data for
	this._pendingExt[fullNode][ext].push(pendingBuddy);
	pendingBuddy.pendingExts.push(this._pendingExt[fullNode][ext]);
};

/**
 * Send an IQ request to retrieve details about the specified capabilties  
 * @param stanza Original presence stanza
 * @api private
 */
Handler.prototype._getCapabilitiesFromPresence = function(stanza) {
	var fullNode = stanza.caps.node + '#' + stanza.caps.ver;
	debug('%s not cached, retrieving from %s', fullNode, stanza.from);

	// Request details on these capabilities (if they haven't already been requested)
	if (!this._pending[fullNode]) {
		this._pending[fullNode] = {
			node: stanza.caps.node,
			ver: stanza.caps.ver,
			buddies: []
		};

		this._sendDiscoQuery(stanza, fullNode, { type: 'caps' });
	}

	// Save this person's JID in an array of pending requests, as we need to fire the event once the capabilities are retrieved.	
	this._pending[fullNode].buddies.push(stanza.from);
};

/**
 * Handle an IQ stanza, if it's a reply to a capability discovery query
 *
 * @param {XMLElement} stanza
 * @api private
 */
Handler.prototype._handleIQ = function (stanza) {
	var id = stanza.attrs.id,
		request = this._iqRequests[id];
	
	if (!request) {
		return;
	}
	
	// Check if it's in reply to an extension request
	if (request.type === 'ext') {
		this._handleIQExt(stanza, request);
	} else {
		this._handleIQCaps(stanza, request);	
	}
	
	delete this._iqRequests[id];
};

/**
 * Handles an IQ stanza in reply to a discovery request for an extension.
 * @param {XMLElement} stanza Stanza
 * @param request The original IQ-request
 * @api private
 */
Handler.prototype._handleIQExt = function(stanza, request) {
	var caps = stanza.capabilities,
		fullNode = request.fullNode,
		pendingExt = this._pendingExt[fullNode][request.ext];

	if (!this._extCache[fullNode]) {
		this._extCache[fullNode] = {};
	}

	this._extCache[fullNode][request.ext] = caps.rawFeatures;

	// Check which users are waiting on this extension
	pendingExt.forEach(function(buddy) {
		// Remove this extension from their pending extensions
		buddy.pendingExts.splice(buddy.pendingExts.indexOf(pendingExt), 1);
		this._emitEventIfFullyLoaded(buddy.jid);
	}, this);

	delete this._pendingExt[fullNode][request.ext];
};

/**
 * Handles an IQ stanza in reply to a discovery request for capabilities
 * @param {XMLElement} stanza Stanza
 * @param request The original IQ-request
 * @api private
 */
Handler.prototype._handleIQCaps = function(stanza, request) {
	
	var caps = stanza.capabilities,
		node = request.fullNode;
	this._cache[node] = caps;

	// Fire the event for all buddies that were waiting
	if (this._pending[node]) {
		this._pending[node].buddies.forEach(function (jid) {
			this._emitEventIfFullyLoaded(jid);
		}, this);
		delete this._pending[node];
	}
};

/**
 * Emits a capabilities event if this user's details have fully loaded (that is, if the standard capabilities and all
 * applicable extensions have been loaded)
 * @param jid Jabber ID of the user
 * @api private
 */
Handler.prototype._emitEventIfFullyLoaded = function(jid) {
	var pendingBuddy = this._pendingBuddies[jid], 
		presence = pendingBuddy.originalPresence,
		fullCapsNode = presence.caps.node + '#' + presence.caps.ver,
		caps = this._cache[fullCapsNode];

	debug('%s has %s extensions left to load. Main capabilities %s loaded? %s', jid, pendingBuddy.pendingExts.length, fullCapsNode, !!caps);
	
	if (caps && pendingBuddy.pendingExts.length === 0) {
		this._emitCapabilitiesEvent(presence);
	}
};

/**
 * Emit a capabilities event for the specified presence stanza, including all the extensions.
 * @param presence Presence stanza to emit event for
 * @api private
 */
Handler.prototype._emitCapabilitiesEvent = function(presence) {
	debug(' => %s fully loaded, emitting event', presence.from);
	
	var caps = presence.caps,
		fullNode = caps.node + '#' + caps.ver,
		// Create a deep clone of the capabilities (as we will be adding the extensions to them and don't want to 
		// modify the original)
		mainCaps = capsUtil.deepClone(this._cache[fullNode]);
	
	// Add all the extensions
	if (caps.ext) {
		caps.ext.forEach(function(ext) {
			// Add this extension's capabilities
			mainCaps.rawFeatures = mainCaps.rawFeatures.concat(this._extCache[fullNode][ext]);
		}, this);
	}
	capsUtil.removeDuplicates(mainCaps.rawFeatures);
	
	// Re-parse the common features
	mainCaps.features = capabilitiesParser.parseCommonFeatures(mainCaps.rawFeatures);
	
	this.emit('capabilities', presence.from, mainCaps);
};

