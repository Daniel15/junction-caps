/**
 * Parse entity capabilities
 *
 * This middleware parses entity capabilities present as specified  in XEP-0115.
 * `stanza.capabilities.features` will contain a hash of common XMPP features.
 * Features this client supports will have a value of `true`.
 * `stanza.capabilities.rawFeatures` will contain an array of all the features
 * supported by this client.  `stanza.capabilities.node` will be set to a URI
 * that uniquely identifies a software application.  `stanza.capabilities.verification`
 * will be set to a string used to verify the identity and supported features of the entity.
 * `stanza.capabilities.hash` will indicate the hashing algorithm used to
 * generate the verification string
 *
 * This should be used alongside the capabilities middleware which actually uses this data.
 *
 * Examples:
 *
 *      connection.use(junction.capabilitiesParser());
 *      connection.use(junction.capabilities( ... )); // See capabilities.js for full docs
 *
 * References:
 * - [XEP-0115: Entity Capabilities](http://xmpp.org/extensions/xep-0115.html)
 * - [Jabber/XMPP Protocol Namespaces](http://xmpp.org/registrar/namespaces.html)
 *
 * @return {Function}
 * @api public
 */
function capabilitiesParser() {
	return function capabilitiesParser(stanza, next) {
		if (stanza.is('presence')) {
			handlePresence(stanza);
		} else if (stanza.is('iq')) {
			handleIQ(stanza);
		}

		return next();
	}
}

/**
 * Simple names for commonly used XMPP features.
 */
var commonFeatures = {
	// XEP-0012 Last Activity (and XEP-0256 Last Activity in Presence) 
	'jabber:iq:last': 'lastActivity',
	// XEP-0045: Multi-User Chat
	'http://jabber.org/protocol/muc': 'muc',
	// XEP-0047 IBB (In-band bytestreams)
	'http://jabber.org/protocol/ibb': 'byteStreams',
	// XEP-0071 XHTML-IM (rich-text messages)
	'http://jabber.org/protocol/xhtml-im': 'xhtml',
	// XEP-0084: User Avatar
	'urn:xmpp:avatar:metadata+notify': 'avatar',
	// XEP-0092: Software Version
	'jabber:iq:version': 'version',
	// XEP-0096: SI File Transfer
	'http://jabber.org/protocol/si/profile/file-transfer': 'siFileTransfer',
	// XEP-0107: User Mood
	'http://jabber.org/protocol/mood+notify': 'mood',
	// XEP-0167: Jingle RTP Sessions
	'urn:xmpp:jingle:apps:rtp:0': 'rtpv0',
	'urn:xmpp:jingle:apps:rtp:1': 'rtpv1',
	'urn:xmpp:jingle:apps:rtp:audio': 'rtpaudio',
	'urn:xmpp:jingle:apps:rtp:video': 'rtpvideo',
	// XEP-0224: Attention
	'urn:xmpp:attention:0': 'attention',
	// XEP-0231 BoB (Bits of Binary) 
	'urn:xmpp:bob': 'bob',

	// Google extensions
	'http://www.google.com/xmpp/protocol/camera/v1': 'googleCamera',
	'http://www.google.com/xmpp/protocol/video/v1': 'googleVideo',
	'http://www.google.com/xmpp/protocol/voice/v1': 'googleVoice',
	'google:mail:notify': 'gmailNotify'
};

/**
 * Handle an IQ stanza, if it's a reply to a capability discovery query
 *
 * @param {XMLElement} stanza
 * @api private
 */
function handleIQ(stanza) {
	var query = stanza.getChild('query', 'http://jabber.org/protocol/disco#info');
	if (!query || (stanza.attrs.id !== 'caps' && stanza.attrs.id.substr(0, 9) !== 'caps-ext-')) {
		return;
	}

	// Just ignore it if it's an error
	// TODO: Should this do something else? Log?
	if (stanza.attrs.type === 'error') {
		return;
	}

	var node = query.attrs.node,
		identity = query.getChild('identity'),
		rawFeatureNodes = query.getChildren('feature');

	var caps = stanza.caps = stanza.capabilities = {
		node: node,
		rawFeatures: rawFeatureNodes.map(function (rawFeature) {
			return rawFeature.attrs['var'];
		})
	};
	
	caps.features = parseCommonFeatures(caps.rawFeatures);

	if (identity) {
		caps.clientName = identity.attrs.name;
	}
}

/**
 * Handle a presence stanza, if it include a capabilities node.
 *
 * @param {XMLElement} stanza
 * @api private
 */
function handlePresence(stanza) {
	var c = stanza.getChild('c', 'http://jabber.org/protocol/caps');
	if (!c) {
		return;
	}

	var caps = stanza.caps = stanza.capabilities = {
		node: c.attrs.node,
		ver: c.attrs.ver,
		hash: c.attrs.hash,
		ext: (c.attrs.ext || '').split(' ')
	};
}

/**
 * Parse common XMPP features into a user-friendly hash
 * @param rawFeatures Raw features array
 * @returns {{Hash}} User-friendly features
 */
function parseCommonFeatures(rawFeatures) {
	var features = {};
	
	// By default, set all features to false
	for (var i in commonFeatures) {
		if (commonFeatures.hasOwnProperty(i)) {
			features[commonFeatures[i]] = false;
		}
	}

	// Now go through all the raw features and see which "common" features this client supports
	rawFeatures.forEach(function (rawFeature) {
		if (commonFeatures[rawFeature]) {
			features[commonFeatures[rawFeature]] = true;
		}
	});	
	
	return features;
}

module.exports = capabilitiesParser;
module.exports.capabilitiesParser = capabilitiesParser;
module.exports.parseCommonFeatures = parseCommonFeatures;